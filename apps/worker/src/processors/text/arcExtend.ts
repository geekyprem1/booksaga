/**
 * "Add More Parts" (T3.2). Extends the series arc past the parts the author originally planned and
 * materialises the new parts as `locked` book rows, so the roadmap grows without touching the books
 * that already exist.
 */
import { arcExtendSchema, type Bible } from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { arcExtendPrompt } from '../../prompts/v1';

export interface ArcExtendJobData {
  jobId: string;
  userId: string;
  refId: string;
  count: number;
}

interface ArcShape {
  overview?: string;
  books?: {
    partNumber: number;
    title?: string;
    premise: string;
    question?: string;
    cliffhanger?: string;
  }[];
}

export async function processArcExtend(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: ArcExtendJobData,
): Promise<void> {
  const { db, ai } = deps;

  const { data: series, error } = await db
    .from('series')
    .select('*')
    .eq('id', data.refId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the series: ${error.message}`);
  if (!series) throw new Error(`Series ${data.refId} not found`);
  if (series.user_id !== data.userId) throw new Error('This series does not belong to the job owner.');

  const count = Math.max(1, Math.min(data.count, 10));
  const arc = (series.arc ?? {}) as ArcShape;
  const existing = arc.books ?? [];
  const fromPart = series.planned_books + 1;

  await runner.progress(25, `Extending the arc with ${count} more part${count > 1 ? 's' : ''}`);

  const { data: bibleRow } = await db
    .from('series_bible')
    .select('data')
    .eq('series_id', series.id)
    .maybeSingle();
  const bible = (bibleRow?.data ?? {}) as unknown as Bible;

  const result = await ai.json({
    ...arcExtendPrompt({
      seriesTitle: series.title,
      genre: series.genre,
      isFiction: series.is_fiction,
      arcOverview: arc.overview ?? '',
      existingParts: existing.map((b) => ({
        partNumber: b.partNumber,
        title: b.title ?? '',
        premise: b.premise,
      })),
      fromPart,
      count,
      bible,
    }),
    schema: arcExtendSchema,
    label: 'ArcExtend',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'arc_extend' },
    mock: { books: count, seriesTitle: series.title, genre: series.genre, part: fromPart },
  });

  const added = result.data.books.slice(0, count).map((b, index) => ({
    partNumber: fromPart + index,
    title: b.title,
    premise: b.premise,
    question: b.question,
    cliffhanger: b.cliffhanger,
  }));

  await runner.progress(70, 'Adding the new parts to the roadmap');

  const nextArc = { ...arc, books: [...existing, ...added] };
  const { error: arcError } = await db
    .from('series')
    .update({ arc: nextArc, planned_books: fromPart + added.length - 1 })
    .eq('id', series.id);
  if (arcError) throw new Error(`Could not save the extended arc: ${arcError.message}`);

  const { data: firstBook } = await db
    .from('books')
    .select('length_preset')
    .eq('series_id', series.id)
    .order('part_number')
    .limit(1)
    .maybeSingle();

  const { error: booksError } = await db.from('books').insert(
    added.map((b) => ({
      series_id: series.id,
      part_number: b.partNumber,
      title: b.title,
      premise: b.premise,
      length_preset: firstBook?.length_preset ?? 'standard',
      status: 'locked' as const,
    })),
  );
  if (booksError) throw new Error(`Could not create the new parts: ${booksError.message}`);

  await runner.progress(95, `${added.length} new parts added`);
  await runner.complete({
    title: `${added.length} new part${added.length > 1 ? 's' : ''} added`,
    body: `The arc now runs to Part ${fromPart + added.length - 1}.`,
    link: `/series/${series.id}`,
    type: 'arc_extended',
  });
}
