import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildBoxSetEpub } from './boxset';
import type { ExportChapter } from '../html/render';

const chapter = (number: number, title: string, text: string): ExportChapter => ({
  number,
  title,
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  text,
});

const input = {
  id: 'box-1',
  seriesTitle: 'The Ledger of Small Debts',
  boxTitle: 'The Ledger of Small Debts: Books 1-2',
  author: 'A. Writer',
  books: [
    {
      title: 'The Lantern Machine',
      partNumber: 1,
      blurb: 'A bookkeeper dies.',
      chapters: [chapter(1, 'Chapter 1: The Will', 'It began.'), chapter(2, 'Chapter 2: The Quay', 'Fog.')],
    },
    {
      title: 'The Lantern Garden',
      partNumber: 2,
      chapters: [chapter(1, 'Chapter 1: The Garden', 'Rain.')],
    },
  ],
};

describe('box set EPUB', () => {
  it('bundles every book with a divider and its chapters', async () => {
    const buffer = await buildBoxSetEpub(input);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);

    expect(names[0]).toBe('mimetype');
    expect(names).toContain('OEBPS/book-01.xhtml');
    expect(names).toContain('OEBPS/book-01-ch-01.xhtml');
    expect(names).toContain('OEBPS/book-02.xhtml');
    expect(names).toContain('OEBPS/book-02-ch-01.xhtml');
    expect(names).toContain('OEBPS/titlepage.xhtml');

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('idref="book-01"');
    expect(opf).toContain('idref="book-02-ch1"');
  });

  it('nests chapters under their book in the navigation', async () => {
    const buffer = await buildBoxSetEpub(input);
    const zip = await JSZip.loadAsync(buffer);
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');

    expect(nav).toContain('Book 1: The Lantern Machine');
    expect(nav).toContain('Book 2: The Lantern Garden');
    // One outer list plus one nested list per book.
    expect((nav.match(/<ol>/g) ?? []).length).toBe(3);
  });

  it('does not repeat the chapter prefix', async () => {
    const buffer = await buildBoxSetEpub(input);
    const zip = await JSZip.loadAsync(buffer);
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');

    expect(nav).toContain('Chapter 1: The Will');
    expect(nav).not.toContain('Chapter 1: Chapter 1');
  });
});
