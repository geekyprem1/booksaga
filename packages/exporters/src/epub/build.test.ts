import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildEpub } from './build';
import type { ExportChapter } from '../html/render';
import { tableOfContents } from '../book/matter';

const chapter = (number: number, title: string, text: string): ExportChapter => ({
  number,
  title,
  doc: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text }] },
      { type: 'horizontalRule' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second scene.' }] },
    ],
  },
  text,
});

const base = {
  id: 'book-1',
  title: 'The Lantern Garden',
  author: 'A. Writer',
  seriesTitle: 'The Ledger of Small Debts',
  partNumber: 2,
  description: 'A blurb.',
  frontHtml: '<section class="title-page"><h1>Title</h1></section>',
  backHtml: '<section class="read-next"><p>Next</p></section>',
  chapters: [chapter(1, 'The Will', 'It began with rain.'), chapter(2, 'The Quay', 'Fog.')],
};

describe('EPUB3', () => {
  it('uses a single chapter prefix and links Contents to the correct XHTML file', async () => {
    const chapters = [chapter(3, 'Chapter 3: The Iron Chorus', 'The chorus began.')];
    const zip = await JSZip.loadAsync(
      await buildEpub({
        ...base,
        chapters,
        frontHtml: tableOfContents(chapters),
      }),
    );
    const front = await zip.file('OEBPS/front-matter.xhtml')!.async('string');
    expect(front).toContain('href="chapter-03.xhtml#ch-3"');
    expect(front).not.toContain('href="#ch-3"');
    expect(front).not.toContain('Chapter 3:');
    for (const path of ['OEBPS/chapter-03.xhtml', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx']) {
      const xml = await zip.file(path)!.async('string');
      expect(xml).toContain('The Iron Chorus');
      expect(xml).not.toContain('Chapter 3: Chapter 3:');
    }
    expect(await zip.file('OEBPS/chapter-03.xhtml')!.async('string')).toContain('id="ch-3"');
  });

  it('produces a valid package with the required entries', async () => {
    const buffer = await buildEpub(base);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);

    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/nav.xhtml');
    expect(names).toContain('OEBPS/toc.ncx');
    expect(names).toContain('OEBPS/chapter-01.xhtml');
    expect(names).toContain('OEBPS/chapter-02.xhtml');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('version="3.0"');
    expect(opf).toContain('idref="ch1"');
    expect(opf).toContain('idref="ch2"');
    expect(opf).toContain('dcterms:modified');

    const ch1 = await zip.file('OEBPS/chapter-01.xhtml')!.async('string');
    expect(ch1).toContain('Chapter 1');
    expect(ch1).toContain('It began with rain.');
    expect(ch1).toContain('hr class="scene-break"');
  });

  it('keeps mimetype stored (uncompressed)', async () => {
    const buffer = await buildEpub(base);
    const zip = await JSZip.loadAsync(buffer);
    const mimetype = zip.file('mimetype')!;
    // JSZip exposes the raw compressed size; for STORE they match.
    expect(
      (mimetype as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize,
    ).toBe(20);
  });
});
