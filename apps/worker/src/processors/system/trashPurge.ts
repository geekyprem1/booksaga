/**
 * Trash purge (T3.3): series deleted more than 30 days ago are removed for good. Runs daily on the
 * `system` queue. The cascade on `series` takes books, chapters, versions and bible rows with it.
 */
import type { DbClient } from '@booksaga/core';
import type { CronRunner } from './exportCleanup';

const RETENTION_DAYS = 30;

export async function processTrashPurge(
  deps: { db: DbClient },
  runner: CronRunner,
): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();

  await runner.progress(20, 'Finding expired series');

  const { data: expired, error } = await deps.db
    .from('series')
    .select('id')
    .lt('deleted_at', cutoff);
  if (error) throw new Error(`Could not read the trash: ${error.message}`);

  const ids = (expired ?? []).map((row) => row.id);
  if (ids.length > 0) {
    const { error: deleteError } = await deps.db.from('series').delete().in('id', ids);
    if (deleteError) throw new Error(`Could not purge the trash: ${deleteError.message}`);
  }

  await runner.progress(100, `${ids.length} series purged`);
  await runner.complete();
}
