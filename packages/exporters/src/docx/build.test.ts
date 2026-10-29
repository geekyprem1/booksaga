import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from './build';

it('normalizes stored chapter numbering in both the DOCX contents and heading', async () => {
  const buffer = await buildDocx({
    title: 'Book',
    author: 'Author',
    year: 2026,
    seriesTitle: 'Series',
    partNumber: 1,
    chapters: [{ number: 3, title: 'Chapter 3: The Iron Chorus', text: 'Prose.', doc: null }],
    backMatterText: '',
  });
  const zip = await JSZip.loadAsync(buffer);
  const document = await zip.file('word/document.xml')!.async('string');
  expect(document).toContain('Chapter 3 · The Iron Chorus');
  expect(document).toContain('>The Iron Chorus</w:t>');
  expect(document).not.toContain('Chapter 3: The Iron Chorus');
});
