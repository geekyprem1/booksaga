/**
 * AI editor tools (T3.7): rewrite / expand / shorten a selection or chapter, or regenerate a whole
 * chapter from its outline beats. The result is returned in `jobs.meta.result` as a TipTap doc plus
 * plain text — the UI shows a diff and the author decides whether to apply it.
 */
import {
  countWords,
  markdownToTiptap,
  tiptapToPlainText,
  type BookOutline,
  type Bible,
  type LengthPreset,
  LENGTH_PRESETS,
} from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import type { Database, DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { chapterPrompt, rewritePrompt } from '../../prompts/v1';

type JsonColumn = Database['public']['Tables']['chapters']['Insert']['content'];

export type RewriteMode = 'rewrite' | 'expand' | 'shorten' | 'regenerate';

export interface RewriteJobData {
  jobId: string;
  userId: string;
  /** chapter id */
  refId: string;
  mode: RewriteMode;
  instruction?: string;
  /** Plain text of the selected passage; when absent the whole chapter is rewritten. */
  selection?: string;
}

const DEFAULT_INSTRUCTION: Record<Exclude<RewriteMode, 'regenerate'>, string> = {
  rewrite: 'Rewrite this passage so it is more vivid and tense. Keep every plot point.',
  expand: 'Expand this passage with more sensory detail and interiority. Do not add new events.',
  shorten: 'Cut this passage to about 60% of its length without losing any plot point.',
};

export async function processRewrite(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: RewriteJobData,
): Promise<void> {
  const { db, ai } = deps;

  const { data: chapter } = await db
    .from('chapters')
    .select('id, book_id, number, title, content_text, word_count')
    .eq('id', data.refId)
    .maybeSingle();
  if (!chapter) throw new Error(`Chapter ${data.refId} not found`);

  const { data: book } = await db
    .from('books')
    .select('*')
    .eq('id', chapter.book_id)
    .maybeSingle();
  if (!book) throw new Error(`Book ${chapter.book_id} not found`);

  const { data: series } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .maybeSingle();
  if (!series) throw new Error(`Series ${book.series_id} not found`);
  if (series.user_id !== data.userId) throw new Error('This chapter does not belong to the job owner.');

  const { data: bibleRow } = await db
    .from('series_bible')
    .select('data')
    .eq('series_id', series.id)
    .maybeSingle();
  const bible = (bibleRow?.data ?? {}) as unknown as Bible;

  await runner.progress(20, 'Reading the chapter');

  let markdown: string;

  if (data.mode === 'regenerate') {
    const outline = (book.outline ?? { chapters: [] }) as BookOutline;
    const outlineChapter = outline.chapters.find((c) => c.number === chapter.number);
    const preset = LENGTH_PRESETS[book.length_preset as LengthPreset] ?? LENGTH_PRESETS.standard;
    const targetWords = outlineChapter?.targetWords ?? Math.max(chapter.word_count, preset.wordsPerChapter);

    const result = await ai.text({
      ...chapterPrompt({
        seriesTitle: series.title,
        partNumber: book.part_number,
        chapterNumber: chapter.number,
        chapterTitle: outlineChapter?.title ?? chapter.title,
        beats: outlineChapter?.beats ?? [],
        targetWords,
        pov: bible.style?.pov || 'third',
        tense: bible.style?.tense || 'past',
        bible,
        outline,
        previousSummaries: [],
        previousBookSummaries: [],
        previousTail: '',
      }),
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'chapter' },
      mock: {
        words: targetWords,
        part: book.part_number,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        seriesTitle: series.title,
      },
    });
    markdown = result.text;
  } else {
    const source = (data.selection ?? chapter.content_text ?? '').trim();
    if (!source) throw new Error('There is nothing to rewrite in this chapter yet.');

    const instruction =
      data.instruction?.trim() || DEFAULT_INSTRUCTION[data.mode as Exclude<RewriteMode, 'regenerate'>];

    const result = await ai.text({
      ...rewritePrompt({
        text: source,
        instruction,
        context: `Series: ${series.title} · Part ${book.part_number} · Chapter ${chapter.number}: ${chapter.title}`,
      }),
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'rewrite' },
      mock: { words: Math.max(200, countWords(source)) },
    });
    markdown = result.text;
  }

  await runner.progress(85, 'Preparing the preview');

  const doc = markdownToTiptap(markdown);
  const text = tiptapToPlainText(doc);

  await runner.progress(95, 'Ready for review', {
    result: {
      doc: doc as unknown as JsonColumn,
      text,
      wordCount: countWords(text),
      mode: data.mode,
      chapterId: chapter.id,
    },
  });

  await runner.complete({ title: 'Rewrite ready for review', type: 'rewrite_ready' });
}
