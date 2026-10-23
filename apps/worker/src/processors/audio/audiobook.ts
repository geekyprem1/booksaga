/**
 * Audiobook narration (T6.14).
 *
 * Per chapter: clean the prose, chunk it to Kokoro's limit, synthesise each chunk, master the
 * concatenation with ffmpeg (ACX specs), upload the MP3 and record it on the row â€” so a retry
 * resumes instead of paying for the same chapter twice.
 */
import { randomUUID } from 'node:crypto';
import type { DbClient } from '@booksaga/core';
import type { AiClient } from '@booksaga/ai';
import {
  buildZip,
  chunkForSpeech,
  cleanForSpeech,
  masterChapter,
  probeAudio,
} from '@booksaga/exporters';
import sharp from 'sharp';
import type { JobRunner } from '../../lib/jobs';

export interface AudiobookJobData {
  jobId: string;
  userId: string;
  /** book id */
  refId: string;
  audiobookId: string;
  voice: string;
  speed: number;
}

interface ChapterRecord {
  number: number;
  title: string;
  path: string;
  durationSec: number;
  chars: number;
}

export async function processAudiobook(
  deps: { db: DbClient; ai: AiClient },
  runner: JobRunner,
  data: AudiobookJobData,
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

  const { data: existing } = await db
    .from('audiobooks')
    .select('chapters, cover_path')
    .eq('id', data.audiobookId)
    .maybeSingle();

  const done = new Map<number, ChapterRecord>();
  for (const record of (existing?.chapters ?? []) as unknown as ChapterRecord[]) {
    done.set(record.number, record);
  }

  const { data: chapterRows } = await db
    .from('chapters')
    .select('number, title, content_text')
    .eq('book_id', book.id)
    .order('number');

  const chapters = (chapterRows ?? []).filter((chapter) => (chapter.content_text ?? '').trim().length > 0);
  if (chapters.length === 0) throw new Error('This book has no chapter text to narrate.');

  const basePath = `${data.userId}/${book.id}/audio/${data.audiobookId}`;
  const title = book.title || `Part ${book.part_number}`;
  const author = series.pen_name || 'Unknown Author';

  await db.from('audiobooks').update({ status: 'running' }).eq('id', data.audiobookId);

  const finished: ChapterRecord[] = [...done.values()];

  // Opening credits.
  if (!done.has(0)) {
    await runner.progress(3, 'Recording the opening credits');
    const credits = cleanForSpeech(`${title}. By ${author}. Narrated by ${data.voice}.`);
    const audio = await ai.speech({
      text: credits,
      voice: data.voice,
      speed: data.speed,
      usage: { userId: data.userId, jobId: runner.jobId, purpose: 'audiobook_credits' },
    });
    const mp3 = await masterChapter([audio.buffer]);
    const path = `${basePath}/00-credits.mp3`;
    const upload = await db.storage
      .from('audio')
      .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true });
    if (upload.error) throw new Error(`Could not store the credits: ${upload.error.message}`);

    const probe = await probeAudio(mp3);
    const record: ChapterRecord = {
      number: 0,
      title: 'Opening credits',
      path,
      durationSec: Math.round(probe.durationSec),
      chars: credits.length,
    };
    finished.push(record);
    await db
      .from('audiobooks')
      .update({ chapters: finished as never })
      .eq('id', data.audiobookId);
  }

  for (const [index, chapter] of chapters.entries()) {
    if (done.has(chapter.number)) continue;

    const percent = 5 + Math.round((index / chapters.length) * 85);
    await runner.progress(percent, `Chapter ${chapter.number} of ${chapters.length}`);

    const chunks = chunkForSpeech(chapter.content_text ?? '');
    const rendered: Buffer[] = [];

    for (const chunk of chunks) {
      const audio = await ai.speech({
        text: chunk,
        voice: data.voice,
        speed: data.speed,
        usage: { userId: data.userId, jobId: runner.jobId, purpose: 'audiobook_chapter' },
      });
      rendered.push(audio.buffer);
    }

    const mp3 = await masterChapter(rendered);
    const path = `${basePath}/${String(chapter.number).padStart(2, '0')}-chapter.mp3`;
    const upload = await db.storage
      .from('audio')
      .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true });
    if (upload.error) throw new Error(`Could not store chapter ${chapter.number}: ${upload.error.message}`);

    const probe = await probeAudio(mp3);
    const record: ChapterRecord = {
      number: chapter.number,
      title: chapter.title,
      path,
      durationSec: Math.round(probe.durationSec),
      chars: (chapter.content_text ?? '').length,
    };
    finished.push(record);
    finished.sort((a, b) => a.number - b.number);

    await db
      .from('audiobooks')
      .update({ chapters: finished as never })
      .eq('id', data.audiobookId);
  }

  await runner.progress(92, 'Packaging the audiobook');

  // 2400Ã—2400 square cover for the store listing.
  let coverPath = existing?.cover_path ?? null;
  if (!coverPath) {
    const { data: activeCover } = await db
      .from('covers')
      .select('final_path')
      .eq('book_id', book.id)
      .eq('type', 'ebook')
      .eq('is_active', true)
      .maybeSingle();

    if (activeCover?.final_path) {
      const download = await db.storage.from('covers').download(activeCover.final_path);
      if (!download.error && download.data) {
        const square = await sharp(Buffer.from(await download.data.arrayBuffer()))
          .resize(2400, 2400, {
            fit: 'contain',
            background: { r: 18, g: 25, b: 55, alpha: 1 },
          })
          .jpeg({ quality: 90 })
          .toBuffer();

        const path = `${basePath}/cover-2400.jpg`;
        const upload = await db.storage
          .from('audio')
          .upload(path, square, { contentType: 'image/jpeg', upsert: true });
        if (!upload.error) coverPath = path;
      }
    }
  }

  const zipFiles: { name: string; buffer: Buffer }[] = [];
  for (const record of finished.sort((a, b) => a.number - b.number)) {
    const download = await db.storage.from('audio').download(record.path);
    if (download.error || !download.data) continue;
    const name =
      record.number === 0
        ? '00-opening-credits.mp3'
        : `${String(record.number).padStart(2, '0')}-${record.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'chapter'}.mp3`;
    zipFiles.push({ name, buffer: Buffer.from(await download.data.arrayBuffer()) });
  }

  if (coverPath) {
    const coverDownload = await db.storage.from('audio').download(coverPath);
    if (!coverDownload.error && coverDownload.data) {
      zipFiles.push({
        name: 'cover-2400x2400.jpg',
        buffer: Buffer.from(await coverDownload.data.arrayBuffer()),
      });
    }
  }

  const zip = await buildZip(zipFiles);
  const zipPath = `${basePath}.zip`;
  const zipUpload = await db.storage
    .from('exports')
    .upload(zipPath, zip, { contentType: 'application/zip', upsert: true });
  if (zipUpload.error) throw new Error(`Could not store the audiobook ZIP: ${zipUpload.error.message}`);

  const totalSeconds = finished.reduce((sum, record) => sum + record.durationSec, 0);

  await db
    .from('audiobooks')
    .update({
      status: 'ready',
      chapters: finished as never,
      zip_path: zipPath,
      cover_path: coverPath,
      total_seconds: totalSeconds,
    })
    .eq('id', data.audiobookId);

  await runner.progress(99, 'Done');
  await runner.complete({
    title: 'Your audiobook is ready',
    body: `${title} â€” ${Math.round(totalSeconds / 60)} minutes, ${finished.length} files.`,
    link: `/series/${series.id}/audiobook`,
    type: 'export_ready',
  });
}

export function newAudiobookId(): string {
  return randomUUID();
}
