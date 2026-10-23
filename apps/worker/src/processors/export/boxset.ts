/**
 * Box set export (T6.4): one EPUB with every selected book, a nested table of contents, divider
 * pages, an AI-written description and an optional cover (2 credits).
 */
import { randomUUID } from 'node:crypto';
import { boxSetDescriptionSchema } from '@booksaga/shared';
import type { TiptapDoc } from '@booksaga/shared';
import type { DbClient } from '@booksaga/core';
import type { AiClient } from '@booksaga/ai';
import {
  buildBoxSetEpub,
  composeCover,
  type CoverLayer,
  type ExportChapter,
} from '@booksaga/exporters';
import type { JobRunner } from '../../lib/jobs';

export interface BoxSetJobData {
  jobId: string;
  userId: string;
  /** series id */
  refId: string;
  boxSetId: string;
  bookIds: string[];
  title: string;
  withCover: boolean;
}

export async function processBoxSet(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: BoxSetJobData,
): Promise<void> {
  const { db, ai } = deps;

  const { data: series } = await db.from('series').select('*').eq('id', data.refId).maybeSingle();
  if (!series) throw new Error(`Series ${data.refId} not found`);
  if (series.user_id !== data.userId) throw new Error('This series does not belong to the job owner.');

  await runner.progress(10, 'Collecting the books');

  const { data: books } = await db
    .from('books')
    .select('id, part_number, title, subtitle, metadata, status')
    .in('id', data.bookIds)
    .order('part_number');

  const ordered = (books ?? []).filter((book) => book.status === 'generated');
  if (ordered.length < 2) throw new Error('Pick at least two generated books for a box set.');

  const { data: chapterRows } = await db
    .from('chapters')
    .select('book_id, number, title, content, content_text')
    .in(
      'book_id',
      ordered.map((book) => book.id),
    )
    .order('number');

  const chaptersByBook = new Map<string, ExportChapter[]>();
  for (const chapter of chapterRows ?? []) {
    const list = chaptersByBook.get(chapter.book_id) ?? [];
    list.push({
      number: chapter.number,
      title: chapter.title,
      doc: (chapter.content ?? null) as TiptapDoc | null,
      text: chapter.content_text ?? '',
    });
    chaptersByBook.set(chapter.book_id, list);
  }

  const boxBooks = ordered.map((book) => {
    const metadata = (book.metadata ?? {}) as { blurb?: string };
    return {
      title: book.title || `Part ${book.part_number}`,
      partNumber: book.part_number,
      subtitle: book.subtitle,
      blurb: metadata.blurb,
      chapters: chaptersByBook.get(book.id) ?? [],
    };
  });

  await runner.progress(25, 'Writing the box set description');

  let description = `${series.title}: ${ordered.length} books in one volume.`;
  try {
    const result = await ai.json({
      system:
        'You are a direct-response copywriter for serial fiction. Return JSON with a single "description" field.',
      messages: [
        {
          role: 'user',
          content: [
            `Write a 90-140 word sales description for a box set of ${ordered.length} books.`,
            `Series: ${series.title}`,
            `Box set title: ${data.title}`,
            `Books: ${boxBooks.map((book) => `Book ${book.partNumber} — ${book.title}`).join('; ')}`,
            'Hook the reader in the first sentence, keep it spoiler-free, and end with a reason to buy the set.',
          ].join('\n'),
        },
      ],
      maxTokens: 700,
      schema: boxSetDescriptionSchema,
      label: 'BoxSetDescription',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'box_set_description' },
      mock: { seriesTitle: series.title, books: ordered.length },
    });
    description = (result.data as { description: string }).description;
  } catch (err) {
    console.warn('[box-set] description failed, keeping the fallback:', err instanceof Error ? err.message : err);
  }

  let cover: { buffer: Buffer; mime: string } | null = null;

  if (data.withCover) {
    await runner.progress(45, 'Painting the box set cover');
    const style = (series.cover_style ?? {}) as {
      artPrompt?: string;
      palette?: string[];
      scene?: string;
      fontFamily?: 'serif' | 'sans' | 'display';
    };

    const art = await ai.image({
      prompt: [
        'Book box set cover artwork, no text, no lettering.',
        style.artPrompt ?? `A dramatic ${series.genre ?? 'fiction'} scene for ${series.title}.`,
        `Palette: ${(style.palette ?? ['deep teal', 'amber']).join(', ')}.`,
        'Leave the lower third visually calm for a title.',
      ].join('\n'),
      aspectRatio: '1024x1536',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'box_set_cover' },
    });

    const layers: CoverLayer[] = [
      {
        kind: 'series',
        text: series.title,
        x: 0.5,
        y: 0.07,
        w: 0.82,
        align: 'center',
        size: 0.024,
        color: '#ffffff',
        uppercase: true,
      },
      {
        kind: 'title',
        text: data.title,
        x: 0.5,
        y: 0.58,
        w: 0.84,
        align: 'center',
        size: 0.066,
        weight: 'bold',
        color: '#ffffff',
      },
      {
        kind: 'tagline',
        text: `${ordered.length} books in one volume`,
        x: 0.5,
        y: 0.78,
        w: 0.7,
        align: 'center',
        size: 0.022,
        color: style.palette?.[1] ?? '#f0e6d2',
        uppercase: true,
      },
      {
        kind: 'author',
        text: series.pen_name || 'Unknown Author',
        x: 0.5,
        y: 0.9,
        w: 0.8,
        align: 'center',
        size: 0.032,
        color: '#ffffff',
        uppercase: true,
      },
    ];

    cover = {
      buffer: await composeCover({
        art: art.buffer,
        width: 1600,
        height: 2560,
        layers,
        fontFamily: style.fontFamily ?? 'serif',
      }),
      mime: 'image/jpeg',
    };
  }

  await runner.progress(70, 'Building the EPUB');

  const basePath = `${data.userId}/${series.id}/box-sets/${data.boxSetId}`;
  const epub = await buildBoxSetEpub({
    id: data.boxSetId,
    seriesTitle: series.title,
    boxTitle: data.title,
    author: series.pen_name || 'Unknown Author',
    description,
    books: boxBooks,
    cover,
  });

  const epubPath = `${basePath}.epub`;
  const upload = await db.storage
    .from('exports')
    .upload(epubPath, epub, { contentType: 'application/epub+zip', upsert: true });
  if (upload.error) throw new Error(`Could not store the box set: ${upload.error.message}`);

  let coverPath: string | null = null;
  if (cover) {
    coverPath = `${basePath}-cover.jpg`;
    const coverUpload = await db.storage
      .from('exports')
      .upload(coverPath, cover.buffer, { contentType: 'image/jpeg', upsert: true });
    if (coverUpload.error) coverPath = null;
  }

  await db
    .from('box_sets')
    .update({
      status: 'ready',
      description,
      epub_path: epubPath,
      cover_path: coverPath,
    })
    .eq('id', data.boxSetId);

  await runner.progress(98, 'Done');
  await runner.complete({
    title: 'Your box set is ready',
    body: `${data.title} — ${ordered.length} books in one EPUB.`,
    link: `/series/${series.id}/box-set`,
    type: 'export_ready',
  });
}

/** Stable id for a new box set row, created by the action before the job runs. */
export function newBoxSetId(): string {
  return randomUUID();
}
