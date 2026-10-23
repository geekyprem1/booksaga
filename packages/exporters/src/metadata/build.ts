/**
 * KDP metadata files (T5.6): a human-readable TXT in KDP form order and a one-row CSV for
 * spreadsheet workflows. Both carry the AI-disclosure note KDP asks for.
 */
import type { BookMetadata } from '@booksaga/shared';

export interface MetadataInput {
  title: string;
  subtitle?: string | null;
  author: string;
  seriesTitle: string;
  partNumber: number;
  language: string;
  metadata: Partial<BookMetadata> | null;
}

const AI_NOTE =
  'AI disclosure: this book was written with the assistance of artificial intelligence and edited by the author.';

export function buildMetadataTxt(input: MetadataInput): string {
  const m = input.metadata ?? {};
  const keywords = (m.keywords ?? []).map((keyword, index) => `  ${index + 1}. ${keyword}`);
  const categories = (m.categories ?? []).map((category, index) => `  ${index + 1}. ${category}`);

  return [
    'BOOKSAGA — KDP METADATA',
    '='.repeat(40),
    '',
    `Title: ${input.title}`,
    `Subtitle: ${input.subtitle ?? ''}`,
    `Author: ${input.author}`,
    `Series: ${input.seriesTitle}`,
    `Series number: ${input.partNumber}`,
    `Language: ${input.language}`,
    '',
    'Description',
    '-'.repeat(40),
    m.blurb ?? '',
    '',
    'Keywords (max 7, each <= 50 characters)',
    '-'.repeat(40),
    keywords.length > 0 ? keywords.join('\n') : '  (none)',
    '',
    'Categories',
    '-'.repeat(40),
    categories.length > 0 ? categories.join('\n') : '  (none)',
    '',
    'Read Next page',
    '-'.repeat(40),
    (m.readNext ?? '').replace('{{NEXT_BOOK_URL}}', '<replace with the next book URL>'),
    '',
    AI_NOTE,
  ].join('\n');
}

const csvCell = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export function buildMetadataCsv(input: MetadataInput): string {
  const m = input.metadata ?? {};
  const header = [
    'title',
    'subtitle',
    'author',
    'series',
    'series_number',
    'language',
    'description',
    'keywords',
    'categories',
    'ai_disclosure',
  ];
  const row = [
    input.title,
    input.subtitle ?? '',
    input.author,
    input.seriesTitle,
    String(input.partNumber),
    input.language,
    m.blurb ?? '',
    (m.keywords ?? []).join('; '),
    (m.categories ?? []).join('; '),
    AI_NOTE,
  ];
  return `${header.map(csvCell).join(',')}\n${row.map(csvCell).join(',')}\n`;
}
