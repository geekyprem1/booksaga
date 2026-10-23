/**
 * Metadata regeneration (T3.9): re-runs the blurb/keywords/categories prompt for one book and saves
 * the result. Costs 1 credit; the author can still edit every field by hand afterwards.
 */
import { bookMetadataSchema, type Bible, type BookOutline } from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { metadataPrompt } from '../../prompts/v1';

export interface MetadataJobData {
  jobId: string;
  userId: string;
  /** book id */
  refId: string;
}

export async function processMetadata(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: MetadataJobData,
): Promise<void> {
  const { db, ai } = deps;

  const { data: book } = await db.from('books').select('*').eq('id', data.refId).maybeSingle();
  if (!book) throw new Error(`Book ${data.refId} not found`);

  const { data: series } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .maybeSingle();
  if (!series) throw new Error(`Series ${book.series_id} not found`);
  if (series.user_id !== data.userId) throw new Error('This book does not belong to the job owner.');

  const { data: bibleRow } = await db
    .from('series_bible')
    .select('data')
    .eq('series_id', series.id)
    .maybeSingle();
  const bible = (bibleRow?.data ?? {}) as unknown as Bible;
  const outline = (book.outline ?? { chapters: [] }) as BookOutline;

  await runner.progress(30, 'Writing the blurb and keywords');

  const result = await ai.json({
    ...metadataPrompt({
      seriesTitle: series.title,
      partNumber: book.part_number,
      bookTitle: book.title,
      genre: series.genre,
      isFiction: series.is_fiction,
      penName: series.pen_name,
      outline,
      bible,
    }),
    schema: bookMetadataSchema,
    label: 'BookMetadata',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'metadata' },
    mock: { part: book.part_number, seriesTitle: series.title },
  });

  await db
    .from('books')
    .update({
      metadata: result.data,
      title: result.data.title,
      subtitle: result.data.subtitle,
    })
    .eq('id', book.id);

  await runner.progress(95, 'Saved');
  await runner.complete({ title: 'Metadata regenerated', type: 'metadata_ready' });
}
