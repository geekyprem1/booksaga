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

const input = z.object({ bookId: z.string().uuid() });

/** Generate (or regenerate) a cover — 2 credits, one image per call (T4.6). */
export async function generateCoverAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId } = input.parse(raw);
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
      payload: { variation: true },
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
