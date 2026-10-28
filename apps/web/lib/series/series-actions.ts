'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';
import { seriesSettingsSchema } from './validation';

const settingsInput = z.object({
  seriesId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  penName: z.string().trim().min(1).max(120),
  tone: z.string().trim().min(1).max(80),
  plannedBooks: z.coerce.number().int().min(1).max(30),
  settings: seriesSettingsSchema,
});

/** Series Settings tab (T3.15). Planned parts can never drop below what is already written. */
export async function updateSeriesSettingsAction(
  input: z.infer<typeof settingsInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = settingsInput.parse(input);
    const db = getAdminDb();

    const { data: series } = await db
      .from('series')
      .select('id, user_id')
      .eq('id', data.seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id && user.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'This series is not yours.');
    }

    const { count } = await db
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', series.id)
      .eq('status', 'generated');

    if ((count ?? 0) > data.plannedBooks) {
      throw new AppError(
        'VALIDATION',
        `${count} parts are already written, so planned parts cannot go below ${count}.`,
      );
    }

    const { error } = await db
      .from('series')
      .update({
        title: data.title,
        pen_name: data.penName,
        tone: data.tone,
        planned_books: data.plannedBooks,
        settings: data.settings,
      })
      .eq('id', series.id);
    if (error) throw new AppError('INTERNAL', `Could not save the settings: ${error.message}`);

    revalidatePath(`/series/${series.id}`);
    revalidatePath('/my-series');
    return undefined;
  });
}

const idInput = z.object({ seriesId: z.string().uuid() });

export async function archiveSeriesAction(
  input: z.infer<typeof idInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { seriesId } = idInput.parse(input);
    await assertOwned(db, seriesId, user.id, user.role);

    await db.from('series').update({ status: 'archived' }).eq('id', seriesId);
    revalidatePath('/my-series');
    revalidatePath(`/series/${seriesId}`);
    return undefined;
  });
}

export async function unarchiveSeriesAction(
  input: z.infer<typeof idInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    await assertOwned(db, input.seriesId, user.id, user.role);

    await db.from('series').update({ status: 'active' }).eq('id', input.seriesId);
    revalidatePath('/my-series');
    return undefined;
  });
}

/** Soft delete (T3.3): the row stays for 30 days so the user can restore it from Trash. */
export async function deleteSeriesAction(
  input: z.infer<typeof idInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    await assertOwned(db, input.seriesId, user.id, user.role);

    await db
      .from('series')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.seriesId);
    revalidatePath('/my-series');
    return undefined;
  });
}

export async function restoreSeriesAction(
  input: z.infer<typeof idInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    await assertOwned(db, input.seriesId, user.id, user.role);

    await db.from('series').update({ deleted_at: null }).eq('id', input.seriesId);
    revalidatePath('/my-series');
    return undefined;
  });
}

/** Duplicate = settings + bible only (PRD §8.5); the books are not copied. */
export async function duplicateSeriesAction(
  input: z.infer<typeof idInput>,
): Promise<ActionResult<{ seriesId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { seriesId } = idInput.parse(input);

    const { data: series } = await db
      .from('series')
      .select('*')
      .eq('id', seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This series is not yours.');

    // A duplicate is a new series, so it must respect the same plan cap as "Create Series".
    const { account } = await getAccount();
    const { count } = await db
      .from('series')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .neq('status', 'archived');
    assertCan(account.entitlements, { kind: 'createSeries', activeSeriesCount: count ?? 0 });

    const { data: created, error } = await db
      .from('series')
      .insert({
        user_id: user.id,
        title: `${series.title} (copy)`.slice(0, 200),
        idea: series.idea,
        genre: series.genre,
        is_fiction: series.is_fiction,
        tone: series.tone,
        audience: series.audience,
        pen_name: series.pen_name,
        planned_books: series.planned_books,
        settings: series.settings,
        cover_style: series.cover_style,
        arc: series.arc,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !created) {
      throw new AppError('INTERNAL', `Could not duplicate the series: ${error?.message}`);
    }

    const { data: bible } = await db
      .from('series_bible')
      .select('data, version')
      .eq('series_id', series.id)
      .maybeSingle();

    if (bible) {
      await db.from('series_bible').insert({
        series_id: created.id,
        data: bible.data,
        version: bible.version,
      });
      await db.from('bible_versions').insert({
        series_id: created.id,
        version: bible.version,
        data: bible.data,
        source: 'user',
        diff: { added: [], updated: [], conflicts: [] },
      });
    }

    revalidatePath('/my-series');
    return { seriesId: created.id };
  });
}

async function assertOwned(
  db: ReturnType<typeof getAdminDb>,
  seriesId: string,
  userId: string,
  role: 'user' | 'admin',
) {
  const { data } = await db.from('series').select('user_id').eq('id', seriesId).maybeSingle();
  if (!data) throw new AppError('NOT_FOUND', 'Series not found.');
  if (data.user_id !== userId && role !== 'admin') {
    throw new AppError('FORBIDDEN', 'This series is not yours.');
  }
}
