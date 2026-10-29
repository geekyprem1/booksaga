/**
 * Cover generation (T4.4).
 *
 *   1. Direct the series once (artPrompt + palette + font) and lock it on `series.cover_style`.
 *   2. Paint this book's scene with gpt-image-2 (2:3, text-less).
 *   3. Produce the two shipping files with sharp: ebook 1600×2560 and print front 1856×2784.
 *   4. Save a `covers` row and make it the active cover for the book.
 *
 * Text overlay (title/author) is composed separately, so the original art stays reusable.
 */
import { randomUUID } from 'node:crypto';
import { coverBriefSchema, type Bible, type CoverBrief } from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import { composeCover, defaultLayers, type CoverLayer } from '@booksaga/exporters';
import sharp from 'sharp';
import type { Database, DbClient } from '@booksaga/core';

type JsonColumn = Database['public']['Tables']['covers']['Insert']['layers'];
const asJson = (value: unknown) => value as NonNullable<JsonColumn>;
import type { JobRunner } from '../../lib/jobs';
import { coverBriefPrompt, coverImagePrompt, fallbackBrief } from '../../prompts/v1/cover';

export interface CoverJobData {
  jobId: string;
  userId: string;
  /** book id */
  refId: string;
  /** Regenerate an existing cover instead of creating a new one. */
  variation?: boolean;
  /** 'ai' lets the model letter the cover; 'overlay' (default) composes our own type. */
  textMode?: 'overlay' | 'ai';
  /** Use an existing library image instead of generating art (T4.7). */
  sourceImagePath?: string;
  sourceBucket?: string;
  /** Re-render an existing cover with edited layers (no AI call, no credits). */
  recompose?: boolean;
  coverId?: string;
  layers?: CoverLayer[];
}

export async function processCover(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: CoverJobData,
): Promise<void> {
  const { db, ai } = deps;

  if (data.recompose && data.coverId && data.layers) {
    return recomposeCover(
      { db },
      runner,
      data as CoverJobData & { coverId: string; layers: CoverLayer[] },
    );
  }

  const { data: book } = await db.from('books').select('*').eq('id', data.refId).maybeSingle();
  if (!book) throw new Error(`Book ${data.refId} not found`);

  const { data: series } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .maybeSingle();
  if (!series) throw new Error(`Series ${book.series_id} not found`);
  if (series.user_id !== data.userId)
    throw new Error('This book does not belong to the job owner.');

  const { data: bibleRow } = await db
    .from('series_bible')
    .select('data')
    .eq('series_id', series.id)
    .maybeSingle();
  const bible = (bibleRow?.data ?? {}) as unknown as Bible;

  await runner.progress(10, 'Directing the cover');

  let style = series.cover_style as CoverBrief | null;

  if (!style?.artPrompt && !data.sourceImagePath) {
    const input = {
      seriesTitle: series.title,
      genre: series.genre,
      tone: series.tone,
      isFiction: series.is_fiction,
      partNumber: book.part_number,
      bookTitle: book.title,
      premise: book.premise,
      bible,
    };

    try {
      const brief = await ai.json({
        ...coverBriefPrompt(input),
        schema: coverBriefSchema,
        label: 'CoverBrief',
        usage: { userId: data.userId, jobId: runner.jobId, purpose: 'cover_brief' },
        mock: { part: book.part_number, seriesTitle: series.title, genre: series.genre },
      });
      style = brief.data;
    } catch (err) {
      // A bad brief must not block the cover: fall back to a genre-appropriate direction.
      console.warn(
        '[cover] brief failed, using the fallback:',
        err instanceof Error ? err.message : err,
      );
      style = fallbackBrief(input);
    }

    // Book 1's cover locks the look of the whole series.
    await db.from('series').update({ cover_style: style }).eq('id', series.id);
  }

  // A library image needs a palette/font but not an AI art direction.
  if (!style && data.sourceImagePath) {
    style = { artPrompt: '', palette: ['#f0e6d2'], scene: '', fontFamily: 'serif' };
  }

  if (!style) throw new Error('Could not establish a cover style.');

  const coverId = randomUUID();
  const basePath = `${data.userId}/${series.id}/${book.id}`;
  const sourceImagePath = data.sourceImagePath;
  const sourceBucket = data.sourceBucket ?? 'uploads';

  let artBuffer: Buffer;
  let artPath: string;
  let prompt: string | null = null;

  if (sourceImagePath) {
    // Library image (T4.7): no AI call, just compose the text over the author's own artwork.
    await runner.progress(40, 'Using your image');
    const download = await db.storage.from(sourceBucket).download(sourceImagePath);
    if (download.error || !download.data) {
      throw new Error(`Could not read the image: ${download.error?.message}`);
    }
    artBuffer = Buffer.from(await download.data.arrayBuffer());
    const ext = sourceImagePath.split('.').pop()?.toLowerCase() ?? 'png';
    artPath = `${basePath}/${coverId}.${ext}`;
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const copy = await db.storage
      .from('cover-art')
      .upload(artPath, artBuffer, { contentType, upsert: true });
    if (copy.error) throw new Error(`Could not store the artwork: ${copy.error.message}`);
  } else {
    await runner.progress(30, 'Painting the artwork');

    prompt = coverImagePrompt({
      artPrompt: style.artPrompt,
      palette: style.palette,
      scene: style.scene,
      genre: series.genre,
      title: book.title || `Part ${book.part_number}`,
      author: series.pen_name || 'Unknown Author',
      textMode: data.textMode ?? 'overlay',
    });

    const art = await ai.image({
      prompt,
      aspectRatio: '1024x1536',
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'cover' },
    });

    artBuffer = art.buffer;
    artPath = `${basePath}/${coverId}.png`;
    const artUpload = await db.storage
      .from('cover-art')
      .upload(artPath, artBuffer, { contentType: 'image/png', upsert: true });
    if (artUpload.error) throw new Error(`Could not store the artwork: ${artUpload.error.message}`);
  }

  await runner.progress(70, 'Setting the title and author');

  const layers = defaultLayers({
    seriesTitle: series.title,
    title: book.title || `Part ${book.part_number}`,
    partNumber: book.part_number,
    author: series.pen_name || 'Unknown Author',
    palette: style.palette,
  });

  // AI text mode: the model lettered the cover itself, so only resize — compositing our own type
  // on top would double it.
  const [ebook, print] =
    data.textMode === 'ai'
      ? await Promise.all([
          sharp(artBuffer)
            .resize(1600, 2560, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 92 })
            .toBuffer(),
          sharp(artBuffer)
            .resize(1856, 2784, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 92 })
            .toBuffer(),
        ])
      : await Promise.all([
          composeCover({
            art: artBuffer,
            width: 1600,
            height: 2560,
            layers,
            fontFamily: style.fontFamily,
          }),
          composeCover({
            art: artBuffer,
            width: 1856,
            height: 2784,
            layers,
            fontFamily: style.fontFamily,
          }),
        ]);

  const ebookPath = `${basePath}/ebook-${coverId}.jpg`;
  const printPath = `${basePath}/print-${coverId}.jpg`;

  const [ebookUpload, printUpload] = await Promise.all([
    db.storage.from('covers').upload(ebookPath, ebook, { contentType: 'image/jpeg', upsert: true }),
    db.storage.from('covers').upload(printPath, print, { contentType: 'image/jpeg', upsert: true }),
  ]);
  if (ebookUpload.error || printUpload.error) {
    throw new Error(
      `Could not store the cover: ${ebookUpload.error?.message ?? printUpload.error?.message}`,
    );
  }

  await runner.progress(90, 'Saving the cover');

  // Only one active cover per (book, type) — the partial unique index enforces it.
  await db.from('covers').update({ is_active: false }).eq('book_id', book.id).eq('type', 'ebook');

  const { data: cover, error: insertError } = await db
    .from('covers')
    .insert({
      book_id: book.id,
      type: 'ebook',
      art_path: artPath,
      final_path: ebookPath,
      mode: data.textMode === 'ai' ? 'ai_text' : 'overlay',
      prompt,
      is_active: true,
      layers: asJson({
        version: 1,
        textMode: data.textMode ?? 'overlay',
        width: 1600,
        height: 2560,
        fontFamily: style.fontFamily,
        items: layers,
        print: { path: printPath, width: 1856, height: 2784 },
        style,
      }),
    })
    .select('id')
    .single();
  if (insertError || !cover) throw new Error(`Could not save the cover: ${insertError?.message}`);

  await runner.complete({
    title: 'Cover ready',
    body: `A new cover for ${book.title || `Part ${book.part_number}`} is waiting in Cover Studio.`,
    link: `/series/${series.id}/covers`,
    type: 'cover_ready',
  });
}

/**
 * Re-render an edited cover: same artwork, new text layout. No AI call and no credits — the layer
 * JSON was already validated and stored by the web action.
 */
async function recomposeCover(
  deps: { db: DbClient },
  runner: JobRunner,
  data: CoverJobData & { coverId: string; layers: CoverLayer[] },
): Promise<void> {
  const { db } = deps;

  const { data: cover } = await db
    .from('covers')
    .select('id, book_id, art_path, layers')
    .eq('id', data.coverId)
    .maybeSingle();
  if (!cover?.art_path) throw new Error(`Cover ${data.coverId} has no artwork.`);

  const { data: book } = await db
    .from('books')
    .select('series_id')
    .eq('id', cover.book_id)
    .maybeSingle();
  const { data: series } = book
    ? await db.from('series').select('user_id').eq('id', book.series_id).maybeSingle()
    : { data: null };
  if (!series || series.user_id !== data.userId) {
    throw new Error('This cover does not belong to the job owner.');
  }

  await runner.progress(40, 'Re-rendering the cover');

  const art = await db.storage.from('cover-art').download(cover.art_path);
  if (art.error || !art.data) throw new Error('Could not read the artwork.');
  const artBuffer = Buffer.from(await art.data.arrayBuffer());

  const meta = (cover.layers ?? {}) as {
    fontFamily?: 'serif' | 'sans' | 'display';
    textMode?: 'overlay' | 'ai';
  };

  // AI-lettered art already contains the title and author. Compositing the stored layers again
  // would print both a second time, so recompose is only valid for engine-composed covers.
  if (meta.textMode === 'ai') {
    throw new Error('This cover was lettered by the AI, so its text cannot be recomposed.');
  }

  const [ebook, print] = await Promise.all([
    composeCover({
      art: artBuffer,
      width: 1600,
      height: 2560,
      layers: data.layers,
      fontFamily: meta.fontFamily ?? 'serif',
    }),
    composeCover({
      art: artBuffer,
      width: 1856,
      height: 2784,
      layers: data.layers,
      fontFamily: meta.fontFamily ?? 'serif',
    }),
  ]);

  const basePath = cover.art_path.replace(/\/[^/]+$/, '');
  const ebookPath = `${basePath}/ebook-${cover.id}-${runner.executionToken}.jpg`;
  const printPath = `${basePath}/print-${cover.id}-${runner.executionToken}.jpg`;

  const [ebookUpload, printUpload] = await Promise.all([
    db.storage.from('covers').upload(ebookPath, ebook, { contentType: 'image/jpeg', upsert: true }),
    db.storage.from('covers').upload(printPath, print, { contentType: 'image/jpeg', upsert: true }),
  ]);
  if (ebookUpload.error || printUpload.error) throw new Error('Could not store the edited cover.');

  await db
    .from('covers')
    .update({
      final_path: ebookPath,
      layers: asJson({
        ...meta,
        version: 1,
        width: 1600,
        height: 2560,
        items: data.layers,
        print: { path: printPath, width: 1856, height: 2784 },
      }),
    })
    .eq('id', cover.id);

  await runner.progress(95, 'Saved');
  await runner.complete();
}
