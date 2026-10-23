/**
 * Export cleanup (T5.8): files older than the 30-day window are removed from storage and the row is
 * marked `expired` so the history still explains what happened. Runs daily on the `system` queue.
 */
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';

export async function processExportCleanup(
  deps: { db: DbClient },
  runner: JobRunner,
): Promise<void> {
  const { db } = deps;
  const now = new Date().toISOString();

  await runner.progress(10, 'Finding expired exports');

  const { data: expired, error } = await db
    .from('exports')
    .select('id, files')
    .eq('status', 'ready')
    .lt('expires_at', now);
  if (error) throw new Error(`Could not read exports: ${error.message}`);

  let removed = 0;

  for (const row of expired ?? []) {
    const files = (row.files ?? {}) as Record<string, string>;
    const paths = Object.values(files).filter(
      (value) => typeof value === 'string' && value.includes('/'),
    );

    if (paths.length > 0) {
      const deletion = await db.storage.from('exports').remove(paths);
      if (deletion.error) {
        console.warn(`[export-cleanup] could not remove files for ${row.id}: ${deletion.error.message}`);
        continue;
      }
    }

    await db
      .from('exports')
      .update({ status: 'expired', files: {} })
      .eq('id', row.id);
    removed += 1;
  }

  await runner.progress(100, `${removed} export(s) expired`);
  await runner.complete();
}
