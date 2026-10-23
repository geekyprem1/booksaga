'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, bibleSchema, type Bible } from '@booksaga/shared';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const saveInput = z.object({
  seriesId: z.string().uuid(),
  data: bibleSchema,
});

/**
 * Save the whole bible from the editor (T3.4). Every save becomes a new `bible_versions` row with
 * `source: 'user'`, and entries the author touched are marked so the AI merge can never overwrite
 * them.
 */
export async function saveBibleAction(
  input: z.infer<typeof saveInput>,
): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = saveInput.parse(input);
    const db = getAdminDb();
    await assertSeriesOwner(db, data.seriesId, user.id, user.role);

    const { data: current } = await db
      .from('series_bible')
      .select('data, version')
      .eq('series_id', data.seriesId)
      .maybeSingle();

    const version = (current?.version ?? 0) + 1;
    const before = (current?.data ?? {}) as Bible;

    const diff = {
      added: Object.keys(data.data.characters).filter((k) => !(k in (before.characters ?? {}))),
      updated: Object.keys(data.data.characters).filter((k) => k in (before.characters ?? {})),
      conflicts: data.data.conflicts ?? [],
    };

    await db
      .from('series_bible')
      .upsert(
        { series_id: data.seriesId, data: data.data, version },
        { onConflict: 'series_id' },
      );
    await db.from('bible_versions').insert({
      series_id: data.seriesId,
      version,
      data: data.data,
      source: 'user',
      diff,
    });

    revalidatePath(`/series/${data.seriesId}/bible`);
    return { version };
  });
}

const restoreInput = z.object({ versionId: z.string().uuid() });

export async function restoreBibleVersionAction(
  input: z.infer<typeof restoreInput>,
): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { versionId } = restoreInput.parse(input);

    const { data: target } = await db
      .from('bible_versions')
      .select('id, series_id, version, data')
      .eq('id', versionId)
      .maybeSingle();
    if (!target) throw new AppError('NOT_FOUND', 'Version not found.');
    await assertSeriesOwner(db, target.series_id, user.id, user.role);

    const { data: current } = await db
      .from('series_bible')
      .select('version')
      .eq('series_id', target.series_id)
      .maybeSingle();

    const version = Math.max(current?.version ?? 0, target.version) + 1;

    await db
      .from('series_bible')
      .upsert(
        { series_id: target.series_id, data: target.data, version },
        { onConflict: 'series_id' },
      );
    await db.from('bible_versions').insert({
      series_id: target.series_id,
      version,
      data: target.data,
      source: 'user',
      diff: { added: [], updated: [], conflicts: [] },
    });

    revalidatePath(`/series/${target.series_id}/bible`);
    return { version };
  });
}

export interface BibleVersionRow {
  id: string;
  version: number;
  source: 'ai' | 'user';
  createdAt: string;
  added: number;
  updated: number;
  conflicts: number;
}

export async function listBibleVersionsAction(input: {
  seriesId: string;
}): Promise<ActionResult<BibleVersionRow[]>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    await assertSeriesOwner(db, input.seriesId, user.id, user.role);

    const { data } = await db
      .from('bible_versions')
      .select('id, version, source, created_at, diff')
      .eq('series_id', input.seriesId)
      .order('version', { ascending: false })
      .limit(30);

    return (data ?? []).map((row) => {
      const diff = (row.diff ?? {}) as { added?: unknown[]; updated?: unknown[]; conflicts?: unknown[] };
      return {
        id: row.id,
        version: row.version,
        source: row.source as 'ai' | 'user',
        createdAt: row.created_at,
        added: diff.added?.length ?? 0,
        updated: diff.updated?.length ?? 0,
        conflicts: diff.conflicts?.length ?? 0,
      };
    });
  });
}

async function assertSeriesOwner(
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
