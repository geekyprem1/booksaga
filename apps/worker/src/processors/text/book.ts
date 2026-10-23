/**
 * Book generation pipeline (T2.15, ARCH §6).
 *
 *   series plan (part 1 only) -> outline -> chapter loop -> continuity -> metadata -> unlock next
 *
 * Every step is resumable: `series.arc`, `books.outline`, `chapters.status` and `books.metadata`
 * are the checkpoints. If the worker dies at chapter 7, the retry (or the reaper) re-enters here
 * and skips everything already done, which is what makes a 25-minute job safe.
 */
import {
  LENGTH_PRESETS,
  assertCan,
  bookMetadataSchema,
  bookOutlineSchema,
  chapterExtractSchema,
  continuityReportSchema,
  countWords,
  markdownToTiptap,
  plannedChapters,
  resolveCreditSource,
  seriesPlanSchema,
  tiptapToPlainText,
  type Bible,
  type BookOutline,
  type LengthPreset,
  type TiptapDoc,
} from '@booksaga/shared';
import { loadAccount, enqueueJob, type Database, type DbClient, type Queues } from '@booksaga/core';
import type { AiClient } from '@booksaga/ai';
import type { JobRunner } from '../../lib/jobs';
import { mergeBible } from '../../pipeline/bibleMerge';
import { buildChapterContext } from '../../pipeline/context';
import {
  bookOutlinePrompt,
  chapterExtractPrompt,
  chapterPrompt,
  continuityPrompt,
  metadataPrompt,
  paragraphFixPrompt,
  PROMPT_VERSION,
  seriesPlanPrompt,
} from '../../prompts/v1';

/** `chapters.content` is jsonb; the TipTap doc is structurally valid but not a `Json` literal. */
type JsonColumn = Database['public']['Tables']['chapters']['Insert']['content'];
const asJson = (value: unknown) => value as NonNullable<JsonColumn>;

export interface BookJobData {
  jobId: string;
  userId: string;
  refId: string;
  ledgerId: number;
}

export interface BookProcessorDeps {
  db: DbClient;
  ai: AiClient;
  /** Cheaper/faster model for structured steps (facts, continuity, metadata). Defaults to `ai`. */
  aiFast?: AiClient;
  /** Queue registry — used to enqueue the auto-cover after a book completes. */
  queues: Queues;
}

const CHAPTER_BASE = 10;
const CHAPTER_SPAN = 75;

export async function processBook(
  deps: BookProcessorDeps,
  runner: JobRunner,
  data: BookJobData,
): Promise<void> {
  const { db, ai } = deps;
  const aiFast = deps.aiFast ?? ai;
  const bookId = data.refId;

  const { data: book, error: bookError } = await db
    .from('books')
    .select('*')
    .eq('id', bookId)
    .maybeSingle();
  if (bookError) throw new Error(`Could not load the book: ${bookError.message}`);
  if (!book) throw new Error(`Book ${bookId} not found`);

  const { data: series, error: seriesError } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .maybeSingle();
  if (seriesError) throw new Error(`Could not load the series: ${seriesError.message}`);
  if (!series) throw new Error(`Series ${book.series_id} not found`);

  // Defence in depth: the Server Action checked this too, but the worker never trusts the caller.
  if (series.user_id !== data.userId) {
    throw new Error('This book does not belong to the job owner.');
  }

  const { data: profile } = await db
    .from('profiles')
    .select('id, parent_agency_id, reseller_owner_id')
    .eq('id', data.userId)
    .maybeSingle();

  const account = await loadAccount(db, {
    id: data.userId,
    parentAgencyId: profile?.parent_agency_id ?? null,
    resellerOwnerId: profile?.reseller_owner_id ?? null,
  });
  assertCan(account.entitlements, {
    kind: 'generateBook',
    lengthPreset: book.length_preset as LengthPreset,
  });

  const preset = LENGTH_PRESETS[book.length_preset as LengthPreset];

  await db.from('books').update({ status: 'generating' }).eq('id', book.id);
  await runner.progress(2, 'Preparing the series bible');

  // -------------------------------------------------------------------------
  // 1) Series plan + bible v1 (part 1 only, once per series)
  // -------------------------------------------------------------------------
  let arc = series.arc as
    | { overview?: string; books?: { partNumber: number; premise: string; title?: string }[] }
    | null;

  if (!arc) {
    const plan = await ai.json({
      ...seriesPlanPrompt({
        idea: series.idea,
        genre: series.genre,
        isFiction: series.is_fiction,
        tone: series.tone,
        audience: series.audience,
        seriesTitle: series.title,
        penName: series.pen_name,
        plannedBooks: series.planned_books,
        lengthPreset: book.length_preset as LengthPreset,
      }),
      schema: seriesPlanSchema,
      label: 'SeriesPlan',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'series_plan' },
      mock: {
        books: series.planned_books,
        seriesTitle: series.title,
        genre: series.genre,
        isFiction: series.is_fiction,
      },
    });

    arc = plan.data.arc;
    await db
      .from('series')
      .update({ arc: plan.data.arc, status: 'active' })
      .eq('id', series.id);

    await db
      .from('series_bible')
      .upsert(
        { series_id: series.id, data: plan.data.bible, version: 1 },
        { onConflict: 'series_id' },
      );

    await db.from('bible_versions').upsert(
      {
        series_id: series.id,
        version: 1,
        data: plan.data.bible,
        source: 'ai',
        book_id: book.id,
        diff: { added: Object.keys(plan.data.bible.characters), updated: [], conflicts: [] },
      },
      { onConflict: 'series_id,version' },
    );

    // Materialise the roadmap: part 1 is this book, the rest start locked.
    const rows = plan.data.arc.books.map((b) => ({
      series_id: series.id,
      part_number: b.partNumber,
      title: b.partNumber === book.part_number ? book.title || b.title : b.title,
      premise: b.premise,
      length_preset: book.length_preset,
      status: b.partNumber === book.part_number ? 'generating' : 'locked',
    }));
    const { error: roadmapError } = await db
      .from('books')
      .upsert(rows, { onConflict: 'series_id,part_number' });
    if (roadmapError) throw new Error(`Could not create the roadmap: ${roadmapError.message}`);
  }

  await runner.progress(5, 'Series bible ready');

  // -------------------------------------------------------------------------
  // 2) Outline
  // -------------------------------------------------------------------------
  let outline = book.outline as BookOutline | null;

  if (!outline) {
    const bible = await loadBible(db, series.id);
    const { data: previousBooks } = await db
      .from('books')
      .select('part_number, summary')
      .eq('series_id', series.id)
      .lt('part_number', book.part_number)
      .order('part_number');

    const result = await ai.json({
      ...bookOutlinePrompt({
        seriesTitle: series.title,
        partNumber: book.part_number,
        premise: book.premise || arc?.books?.[book.part_number - 1]?.premise || series.idea,
        lengthPreset: book.length_preset as LengthPreset,
        chapters: plannedChapters(book.length_preset as LengthPreset),
        wordsPerChapter: preset.wordsPerChapter,
        bible,
        arcOverview: arc?.overview ?? '',
        previousSummaries: (previousBooks ?? [])
          .map((b) => b.summary)
          .filter((s): s is string => !!s),
      }),
      schema: bookOutlineSchema,
      label: 'BookOutline',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'book_outline' },
      mock: {
        chapters: plannedChapters(book.length_preset as LengthPreset),
        words: preset.wordsPerChapter,
        part: book.part_number,
        seriesTitle: series.title,
      },
    });

    outline = result.data;

    await db
      .from('books')
      .update({
        outline,
        title: book.title || outline.title,
        subtitle: outline.subtitle ?? null,
        prompt_version: PROMPT_VERSION,
      })
      .eq('id', book.id);

    const chapterRows = outline.chapters.map((c) => ({
      book_id: book.id,
      number: c.number,
      title: c.title,
      status: 'pending' as const,
    }));
    const { error: chaptersError } = await db
      .from('chapters')
      .upsert(chapterRows, { onConflict: 'book_id,number' });
    if (chaptersError) throw new Error(`Could not create chapters: ${chaptersError.message}`);
  }

  await runner.progress(10, 'Outline ready');

  // -------------------------------------------------------------------------
  // 3) Chapter loop
  // -------------------------------------------------------------------------
  const { data: chapters, error: loadChaptersError } = await db
    .from('chapters')
    .select('*')
    .eq('book_id', book.id)
    .order('number');
  if (loadChaptersError) throw new Error(`Could not load chapters: ${loadChaptersError.message}`);

  const all = chapters ?? [];
  const total = all.length;

  /**
   * Extract a finished chapter's facts and merge them into the bible.
   *
   * This is the only step that overlaps with writing: chapter N+1 is written while chapter N's
   * facts are extracted. Only one extraction is ever in flight, so merges stay strictly ordered,
   * and the next chapter still receives the previous chapter's prose through `previousTail` — the
   * structured facts catch up one chapter later, which is what makes the overlap safe.
   */
  const extractFacts = async (target: (typeof all)[number], text: string): Promise<void> => {
    const extract = await aiFast.json({
      ...chapterExtractPrompt(target.title, text),
      schema: chapterExtractSchema,
      label: 'ChapterExtract',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'chapter_extract' },
    });

    const current = await loadBible(db, series.id);
    const merged = mergeBible(current, extract.data.facts, {
      chapterNumber: target.number,
      bookNumber: book.part_number,
    });
    await saveBible(db, series.id, merged.bible, merged.diff, book.id, target.id);

    await db.from('chapters').update({ summary: extract.data.summary }).eq('id', target.id);
    target.summary = extract.data.summary;
  };

  let extractInFlight: Promise<void> | null = null;

  for (const chapter of all) {
    // Resumability: a chapter written before a crash has prose but no summary/facts yet.
    if (chapter.status === 'done' && !chapter.summary) {
      if (extractInFlight) await extractInFlight;
      extractInFlight = extractFacts(chapter, chapter.content_text ?? '');
      continue;
    }
    if (chapter.status === 'done') continue;

    if (await runner.isCancelRequested()) {
      if (extractInFlight) await extractInFlight;
      const done = all.filter((c) => c.status === 'done').length;
      const refund = total === 0 || done / total < 0.2;
      await runner.cancel({ refund });
      // Cancelled work stays retryable: put the part back instead of marking it failed.
      await db.from('books').update({ status: 'ready' }).eq('id', book.id);
      return;
    }

    const outlineChapter = outline.chapters.find((c) => c.number === chapter.number);
    const doneSoFar = all.filter((c) => c.number < chapter.number && c.status === 'done');

    const bible = await loadBible(db, series.id);
    const context = buildChapterContext({
      bible,
      outline,
      chapterSummaries: doneSoFar.map((c) => ({
        number: c.number,
        title: c.title,
        summary: c.summary ?? '',
      })),
      previousBookSummaries: await previousBookSummaries(db, series.id, book.part_number),
      previousText: doneSoFar.at(-1)?.content_text ?? undefined,
      focus: outlineChapter?.characters ?? [],
    });

    await db.from('chapters').update({ status: 'generating' }).eq('id', chapter.id);
    await runner.progress(
      CHAPTER_BASE + (CHAPTER_SPAN * (chapter.number - 1)) / Math.max(total, 1),
      `Writing chapter ${chapter.number} of ${total}`,
      { chapterNumber: chapter.number, chaptersDone: doneSoFar.length, chaptersTotal: total },
    );

    const written = await ai.text({
      ...chapterPrompt({
        seriesTitle: series.title,
        partNumber: book.part_number,
        chapterNumber: chapter.number,
        chapterTitle: outlineChapter?.title ?? chapter.title,
        beats: outlineChapter?.beats ?? [],
        targetWords: outlineChapter?.targetWords ?? preset.wordsPerChapter,
        pov: context.bible.style.pov || 'third',
        tense: context.bible.style.tense || 'past',
        bible: context.bible,
        outline: context.outline,
        previousSummaries: context.previousSummaries,
        previousBookSummaries: context.previousBookSummaries,
        previousTail: context.previousTail,
      }),
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'chapter' },
      mock: {
        words: outlineChapter?.targetWords ?? preset.wordsPerChapter,
        part: book.part_number,
        chapterNumber: chapter.number,
        chapterTitle: outlineChapter?.title ?? chapter.title,
        seriesTitle: series.title,
      },
    });

    const doc = markdownToTiptap(written.text);
    const text = tiptapToPlainText(doc);
    const words = countWords(text);

    // Save the prose immediately so the editor shows the chapter while facts are extracted.
    await db
      .from('chapters')
      .update({
        content: asJson(doc),
        content_text: text,
        word_count: words,
        status: 'done',
      })
      .eq('id', chapter.id);

    await db.from('chapter_versions').insert({
      chapter_id: chapter.id,
      content: asJson(doc),
      content_text: text,
      source: 'ai',
    });

    chapter.status = 'done';
    chapter.word_count = words;
    chapter.content_text = text;

    // The previous extraction ran during this write, so this await is normally instant.
    if (extractInFlight) await extractInFlight;
    extractInFlight = extractFacts(chapter, text);

    await runner.progress(
      CHAPTER_BASE + (CHAPTER_SPAN * chapter.number) / Math.max(total, 1),
      `Chapter ${chapter.number} of ${total} written`,
      { chapterNumber: chapter.number, chaptersDone: chapter.number, chaptersTotal: total },
    );
  }

  // Let the last extraction land before continuity and metadata read the bible.
  if (extractInFlight) await extractInFlight;

  // -------------------------------------------------------------------------
  // 4) Continuity
  // -------------------------------------------------------------------------
  await runner.progress(88, 'Checking continuity');

  const finalBible = await loadBible(db, series.id);
  const { data: doneChapters } = await db
    .from('chapters')
    .select('number, title, summary')
    .eq('book_id', book.id)
    .order('number');

  const report = await aiFast.json({
    ...continuityPrompt({
      bible: finalBible,
      chapterSummaries: (doneChapters ?? []).map((c) => ({
        number: c.number,
        title: c.title,
        summary: c.summary ?? '',
      })),
    }),
    schema: continuityReportSchema,
    label: 'ContinuityReport',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'continuity' },
  });

  await db.from('books').update({ continuity_report: report.data }).eq('id', book.id);

  // One automatic fix round for issues that quote an exact passage.
  await applyContinuityFixes(db, ai, data.userId, runner.jobId, book.id, report.data.issues, finalBible);

  // -------------------------------------------------------------------------
  // 5) Metadata
  // -------------------------------------------------------------------------
  await runner.progress(94, 'Writing the blurb and keywords');

  const metadata = await aiFast.json({
    ...metadataPrompt({
      seriesTitle: series.title,
      partNumber: book.part_number,
      bookTitle: book.title || outline.title,
      genre: series.genre,
      isFiction: series.is_fiction,
      penName: series.pen_name,
      outline,
      bible: finalBible,
    }),
    schema: bookMetadataSchema,
    label: 'BookMetadata',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'metadata' },
    mock: { part: book.part_number, seriesTitle: series.title },
  });

  const { data: counted } = await db
    .from('chapters')
    .select('word_count')
    .eq('book_id', book.id);
  const totalWords = (counted ?? []).reduce((sum, c) => sum + (c.word_count ?? 0), 0);

  await db
    .from('books')
    .update({
      metadata: metadata.data,
      title: book.title || metadata.data.title,
      subtitle: metadata.data.subtitle || book.subtitle,
      status: 'generated',
      word_count: totalWords,
      summary: metadata.data.blurb.slice(0, 1500),
    })
    .eq('id', book.id);

  await unlockNextPart(db, series.id, book.part_number);

  await runner.progress(99, 'Finishing up');
  await runner.complete({
    title: `Part ${book.part_number} is ready`,
    body: `${book.title || metadata.data.title} — ${totalWords.toLocaleString()} words. Open it to edit, cover and export.`,
    link: `/series/${series.id}`,
    type: 'book_ready',
  });

  // Auto-generate a cover when the series asks for it (T4.8). Best-effort: an empty balance must
  // never fail a book that is already written and paid for.
  const autoCovers = (series.settings as { autoCovers?: boolean } | null)?.autoCovers;
  if (autoCovers) {
    try {
      const { data: coverCost } = await db
        .from('credit_costs')
        .select('credits')
        .eq('action', 'cover')
        .maybeSingle();

      const source = resolveCreditSource(
        { id: data.userId, parentAgencyId: profile?.parent_agency_id ?? null },
        'cover',
      );

      await enqueueJob(db, deps.queues, {
        type: 'cover',
        refId: book.id,
        userId: data.userId,
        source,
        action: 'cover',
        amount: coverCost?.credits ?? 2,
        reason: 'Auto cover',
      });
    } catch (err) {
      console.warn(
        `[cover] auto cover skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadBible(db: DbClient, seriesId: string): Promise<Bible> {
  const { data } = await db
    .from('series_bible')
    .select('data')
    .eq('series_id', seriesId)
    .maybeSingle();
  return (data?.data ?? {}) as unknown as Bible;
}

async function saveBible(
  db: DbClient,
  seriesId: string,
  bible: Bible,
  diff: { added: string[]; updated: string[]; conflicts: string[] },
  bookId: string,
  chapterId: string,
): Promise<number> {
  const { data: current } = await db
    .from('series_bible')
    .select('version')
    .eq('series_id', seriesId)
    .maybeSingle();

  const version = (current?.version ?? 0) + 1;

  await db
    .from('series_bible')
    .upsert({ series_id: seriesId, data: bible, version }, { onConflict: 'series_id' });

  await db.from('bible_versions').insert({
    series_id: seriesId,
    version,
    data: bible,
    source: 'ai',
    book_id: bookId,
    chapter_id: chapterId,
    diff,
  });

  return version;
}

async function previousBookSummaries(
  db: DbClient,
  seriesId: string,
  partNumber: number,
): Promise<string[]> {
  const { data } = await db
    .from('books')
    .select('part_number, summary')
    .eq('series_id', seriesId)
    .lt('part_number', partNumber)
    .order('part_number');
  return (data ?? [])
    .filter((b) => !!b.summary)
    .map((b) => `Part ${b.part_number}: ${b.summary}`);
}

async function unlockNextPart(db: DbClient, seriesId: string, partNumber: number): Promise<void> {
  await db
    .from('books')
    .update({ status: 'ready' })
    .eq('series_id', seriesId)
    .eq('part_number', partNumber + 1)
    .eq('status', 'locked');
}

/** Replace the paragraph containing `needle` with the rewritten text, keeping the doc shape. */
export function replaceParagraph(
  doc: TiptapDoc,
  needle: string,
  replacementMarkdown: string,
): TiptapDoc | null {
  const target = needle.trim().slice(0, 120);
  if (!target) return null;

  const replacement = markdownToTiptap(replacementMarkdown).content;
  const index = doc.content.findIndex(
    (node) =>
      node.type === 'paragraph' &&
      (node.content ?? [])
        .map((t) => t.text)
        .join('')
        .includes(target),
  );
  if (index === -1) return null;

  const next = [...doc.content];
  const first = replacement[0];
  if (first) next[index] = first;
  return { ...doc, content: next };
}

async function applyContinuityFixes(
  db: DbClient,
  ai: AiClient,
  userId: string,
  jobId: string,
  bookId: string,
  issues: { type: string; detail: string; chapterNumber: number; quote?: string; fix?: string }[],
  bible: Bible,
): Promise<void> {
  const fixable = issues.filter((i) => i.quote && i.quote.length > 20).slice(0, 3);

  for (const issue of fixable) {
    const { data: chapter } = await db
      .from('chapters')
      .select('id, content, content_text')
      .eq('book_id', bookId)
      .eq('number', issue.chapterNumber)
      .maybeSingle();
    if (!chapter?.content) continue;

    const doc = chapter.content as unknown as TiptapDoc;
    const paragraph = doc.content
      .map((n) => (n.content ?? []).map((t) => t.text).join(''))
      .find((text) => text.includes(issue.quote!.slice(0, 80)));
    if (!paragraph) continue;

    const fixed = await ai.text({
      ...paragraphFixPrompt({ paragraph, issue: issue.detail, bible }),
      usage: { userId, jobId, purpose: 'rewrite' },
    });

    const updated = replaceParagraph(doc, issue.quote!, fixed.text);
    if (!updated) continue;

    await db
      .from('chapters')
      .update({
        content: asJson(updated),
        content_text: tiptapToPlainText(updated),
      })
      .eq('id', chapter.id);

    await db.from('chapter_versions').insert({
      chapter_id: chapter.id,
      content: asJson(updated),
      content_text: tiptapToPlainText(updated),
      source: 'rewrite',
    });
  }
}
