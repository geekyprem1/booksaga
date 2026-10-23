/**
 * Book export (T5.7): EPUB3 + DOCX + metadata, bundled into one ZIP.
 *
 * Re-exports are free (the job is enqueued with `skipCredits`) because no AI work happens here.
 * The print PDF is added by the same processor once the renderer lands (T5.4).
 */
import { randomUUID } from 'node:crypto';
import type { TiptapDoc } from '@booksaga/shared';
import type { DbClient } from '@booksaga/core';
import {
  backMatter,
  buildDocx,
  buildEpub,
  buildMetadataCsv,
  buildMetadataTxt,
  buildPrintHtml,
  buildZip,
  chapterHtml,
  frontMatter,
  printGeometry,
  TRIM_INCHES,
  type ExportChapter,
  type MatterInput,
  type TrimSize,
} from '@booksaga/exporters';
import type { JobRunner } from '../../lib/jobs';
import { renderPdf } from '../../lib/pdf';

export type ExportFormat = 'epub' | 'pdf' | 'docx' | 'metadata';

export interface BookExportJobData {
  jobId: string;
  userId: string;
  /** book id */
  refId: string;
  formats?: ExportFormat[];
}

const EXPIRY_DAYS = 30;

export async function processBookExport(
  deps: { db: DbClient },
  runner: JobRunner,
  data: BookExportJobData,
): Promise<void> {
  const { db } = deps;
  const formats = data.formats?.length ? data.formats : (['epub', 'pdf', 'docx', 'metadata'] as ExportFormat[]);
  let pdfPages: number | null = null;

  const { data: book } = await db.from('books').select('*').eq('id', data.refId).maybeSingle();
  if (!book) throw new Error(`Book ${data.refId} not found`);

  const { data: series } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .maybeSingle();
  if (!series) throw new Error(`Series ${book.series_id} not found`);
  if (series.user_id !== data.userId) throw new Error('This book does not belong to the job owner.');

  await runner.progress(10, 'Collecting the manuscript');

  const { data: chapterRows } = await db
    .from('chapters')
    .select('number, title, content, content_text')
    .eq('book_id', book.id)
    .order('number');

  const chapters: ExportChapter[] = (chapterRows ?? []).map((chapter) => ({
    number: chapter.number,
    title: chapter.title,
    doc: (chapter.content ?? null) as TiptapDoc | null,
    text: chapter.content_text ?? '',
  }));

  if (chapters.length === 0) throw new Error('This book has no chapters to export yet.');

  const metadata = (book.metadata ?? {}) as Record<string, string | string[]>;
  const title = book.title || `Part ${book.part_number}`;

  const matter: MatterInput = {
    seriesTitle: series.title,
    bookTitle: title,
    subtitle: book.subtitle,
    partNumber: book.part_number,
    author: series.pen_name || 'Unknown Author',
    year: new Date().getFullYear(),
    metadata: {
      blurb: typeof metadata.blurb === 'string' ? metadata.blurb : undefined,
      keywords: Array.isArray(metadata.keywords) ? (metadata.keywords as string[]) : [],
      categories: Array.isArray(metadata.categories) ? (metadata.categories as string[]) : [],
      readNext: typeof metadata.readNext === 'string' ? metadata.readNext : undefined,
      authorBio: typeof metadata.authorBio === 'string' ? metadata.authorBio : undefined,
    },
    chapters: chapters.map((chapter) => ({ number: chapter.number, title: chapter.title })),
  };

  const { data: otherBooks } = await db
    .from('books')
    .select('part_number, title')
    .eq('series_id', series.id)
    .neq('id', book.id)
    .order('part_number');

  const alsoTitles = (otherBooks ?? [])
    .filter((other) => other.title)
    .map((other) => `Book ${other.part_number}: ${other.title}`);

  const front = frontMatter(matter);
  const back = backMatter(matter, alsoTitles);

  const exportId = randomUUID();
  const basePath = `${data.userId}/${book.id}/${exportId}`;
  const files: { name: string; buffer: Buffer }[] = [];
  const uploaded: Record<string, string> = {};

  // Cover (active ebook JPG) goes into the EPUB and the ZIP.
  let cover: { buffer: Buffer; mime: string } | null = null;
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
      cover = { buffer: Buffer.from(await download.data.arrayBuffer()), mime: 'image/jpeg' };
    }
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'book';

  if (formats.includes('epub')) {
    await runner.progress(35, 'Building the EPUB');
    const epub = await buildEpub({
      id: book.id,
      title,
      subtitle: book.subtitle,
      author: matter.author,
      seriesTitle: series.title,
      partNumber: book.part_number,
      description: matter.metadata?.blurb,
      chapters,
      frontHtml: front,
      backHtml: back,
      cover,
    });
    files.push({ name: `${slug}.epub`, buffer: epub });
  }

  if (formats.includes('pdf')) {
    await runner.progress(65, 'Typesetting the print PDF');

    const settings = (series.settings ?? {}) as { trim?: TrimSize; bleed?: boolean };
    const trim: TrimSize = settings.trim && settings.trim in TRIM_INCHES ? settings.trim : '6x9';
    const bleed = settings.bleed === true;

    const printInput = {
      title,
      author: matter.author,
      seriesTitle: series.title,
      partNumber: book.part_number,
      trim,
      bleed,
      frontHtml: front,
      chapters: chapters.map((chapter) => ({
        number: chapter.number,
        title: chapter.title,
        html: chapterHtml(chapter, { heading: false }),
      })),
      backHtml: back,
    };

    // Margins depend on the page count, so render once, then re-render only if the bucket changed.
    let geometry = printGeometry(trim, 200, bleed);
    let rendered = await renderPdf(buildPrintHtml({ ...printInput, pageCount: 200 }), {
      widthIn: geometry.pageWidth,
      heightIn: geometry.pageHeight,
    });

    const exact = printGeometry(trim, rendered.pages, bleed);
    if (exact.inside !== geometry.inside) {
      geometry = exact;
      rendered = await renderPdf(buildPrintHtml({ ...printInput, pageCount: rendered.pages }), {
        widthIn: geometry.pageWidth,
        heightIn: geometry.pageHeight,
      });
    }

    pdfPages = rendered.pages;
    files.push({ name: `${slug}-print.pdf`, buffer: rendered.buffer });
  }

  if (formats.includes('docx')) {
    await runner.progress(55, 'Building the DOCX');
    const docx = await buildDocx({
      title,
      subtitle: book.subtitle,
      author: matter.author,
      year: matter.year,
      seriesTitle: series.title,
      partNumber: book.part_number,
      chapters,
      backMatterText: matter.metadata?.readNext ?? '',
    });
    files.push({ name: `${slug}.docx`, buffer: docx });
  }

  const metaInput = {
    title,
    subtitle: book.subtitle,
    author: matter.author,
    seriesTitle: series.title,
    partNumber: book.part_number,
    language: 'en',
    metadata: matter.metadata,
  };

  if (formats.includes('metadata')) {
    await runner.progress(70, 'Writing the metadata');
    files.push({
      name: `${slug}-metadata.txt`,
      buffer: Buffer.from(buildMetadataTxt(metaInput), 'utf8'),
    });
    files.push({
      name: `${slug}-metadata.csv`,
      buffer: Buffer.from(buildMetadataCsv(metaInput), 'utf8'),
    });
  }

  if (cover) {
    files.push({ name: `${slug}-cover.jpg`, buffer: cover.buffer });
  }

  await runner.progress(85, 'Packaging the ZIP');
  const zip = await buildZip(files);

  const zipPath = `${basePath}.zip`;
  const upload = await db.storage
    .from('exports')
    .upload(zipPath, zip, { contentType: 'application/zip', upsert: true });
  if (upload.error) throw new Error(`Could not store the export: ${upload.error.message}`);

  uploaded.zip = zipPath;
  if (pdfPages !== null) uploaded.pdfPages = String(pdfPages);

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 3600 * 1000).toISOString();

  await db.from('exports').insert({
    id: exportId,
    user_id: data.userId,
    book_id: book.id,
    series_id: series.id,
    formats,
    files: uploaded,
    status: 'ready',
    expires_at: expiresAt,
  });

  await runner.progress(98, 'Done');
  await runner.complete({
    title: 'Your files are ready',
    body: `${title} — ${formats.join(', ')}. The download link works for ${EXPIRY_DAYS} days.`,
    link: `/series/${series.id}/exports`,
    type: 'export_ready',
  });
}

/** Small helper the preview page reuses to render one chapter as HTML. */
export function chapterPreviewHtml(chapter: ExportChapter): string {
  return chapterHtml(chapter);
}
