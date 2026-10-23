'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, resolveCreditSource } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({
  bookId: z.string().uuid(),
  textMode: z.enum(['overlay', 'ai']).optional(),
});

/** Generate (or regenerate) a cover — 2 credits, one image per call (T4.6). */
export async function generateCoverAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId, textMode } = input.parse(raw);
    const db = getAdminDb();

    const { data: book } = await db
      .from('books')
      .select('id, series_id, status')
      .eq('id', bookId)
      .maybeSingle();
    if (!book) throw new AppError('NOT_FOUND', 'Book not found.');

    const { data: series } = await db
      .from('series')
      .select('id, user_id')
      .eq('id', book.series_id)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This book is not yours.');

    const action = 'cover' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource({ id: user.id, parentAgencyId: user.parentAgencyId }, action);

    const queued = await enqueueJob(db, getQueues(), {
      type: 'cover',
      refId: book.id,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      // A fresh key per click: without it the second variation deduplicates onto the first job
      // and the UI just reopens an already-finished job.
      version: Math.floor(Date.now() / 1000),
      payload: { variation: true, textMode: textMode ?? 'overlay' },
      reason: 'Cover generation',
    });

    revalidatePath(`/series/${series.id}/covers`);
    return { jobId: queued.jobId };
  });
}

const activeInput = z.object({ coverId: z.string().uuid() });

/** Pick which variation the rest of the app shows. */
export async function setActiveCoverAction(
  raw: z.infer<typeof activeInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { coverId } = activeInput.parse(raw);
    const db = getAdminDb();

    const { data: cover } = await db
      .from('covers')
      .select('id, book_id, type')
      .eq('id', coverId)
      .maybeSingle();
    if (!cover) throw new AppError('NOT_FOUND', 'Cover not found.');

    const { data: book } = await db
      .from('books')
      .select('series_id')
      .eq('id', cover.book_id)
      .maybeSingle();
    const { data: series } = book
      ? await db.from('series').select('user_id').eq('id', book.series_id).maybeSingle()
      : { data: null };
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This cover is not yours.');

    await db
      .from('covers')
      .update({ is_active: false })
      .eq('book_id', cover.book_id)
      .eq('type', cover.type);
    await db.from('covers').update({ is_active: true }).eq('id', cover.id);

    revalidatePath(`/series/${book?.series_id}/covers`);
    revalidatePath(`/series/${book?.series_id}`);
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Editor (T4.6)
// ---------------------------------------------------------------------------

const layerSchema = z.object({
  kind: z.enum(['series', 'title', 'part', 'author', 'tagline']),
  text: z.string().max(200),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.1).max(1),
  align: z.enum(['left', 'center', 'right']),
  size: z.number().min(0.01).max(0.2),
  weight: z.enum(['regular', 'bold']).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  uppercase: z.boolean().optional(),
  shadow: z.boolean().optional(),
});

const saveLayersInput = z.object({
  coverId: z.string().uuid(),
  layers: z.array(layerSchema).min(1).max(12),
});

/**
 * Save the author's edited layers and re-render the cover.
 *
 * The native canvas lives in the worker, so this only persists the layout and enqueues a free
 * `recompose` job — the server output stays canonical (ARCH §7.1).
 */
export async function saveCoverLayersAction(
  raw: z.infer<typeof saveLayersInput>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { coverId, layers } = saveLayersInput.parse(raw);
    const db = getAdminDb();

    const { data: cover } = await db
      .from('covers')
      .select('id, book_id, layers')
      .eq('id', coverId)
      .maybeSingle();
    if (!cover) throw new AppError('NOT_FOUND', 'Cover not found.');

    const { data: book } = await db
      .from('books')
      .select('series_id')
      .eq('id', cover.book_id)
      .maybeSingle();
    const { data: series } = book
      ? await db.from('series').select('user_id').eq('id', book.series_id).maybeSingle()
      : { data: null };
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This cover is not yours.');

    const meta = (cover.layers ?? {}) as Record<string, unknown>;

    await db
      .from('covers')
      .update({
        layers: {
          ...meta,
          version: 1,
          width: 1600,
          height: 2560,
          items: layers,
        },
      })
      .eq('id', cover.id);

    const queued = await enqueueJob(db, getQueues(), {
      type: 'cover',
      refId: cover.book_id,
      userId: user.id,
      source: { ownerId: user.id, pool: 'main', actingUserId: user.id },
      action: 'cover',
      amount: 0,
      skipCredits: true,
      // A fresh key per save so an edited cover is always re-rendered.
      version: Math.floor(Date.now() / 1000),
      payload: { coverId: cover.id, recompose: true, layers },
      reason: 'Recompose cover',
    });

    revalidatePath(`/series/${book?.series_id}/covers`);
    return { jobId: queued.jobId };
  });
}

/** Unlock the series look so the next cover re-directs the art style (T4.5). */
export async function unlockCoverStyleAction(input: {
  seriesId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { data: series } = await db
      .from('series')
      .select('user_id')
      .eq('id', input.seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This series is not yours.');

    await db.from('series').update({ cover_style: null }).eq('id', input.seriesId);
    revalidatePath(`/series/${input.seriesId}/covers`);
    return undefined;
  });
}
