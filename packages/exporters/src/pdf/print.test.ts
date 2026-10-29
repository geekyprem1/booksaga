import { describe, expect, it } from 'vitest';
import { buildPrintHtml, cssString, insideMarginFor, printGeometry, TRIM_INCHES } from './print';

describe('print layout', () => {
  it('keeps malicious running heads inside the style element', () => {
    const payload = '</style><script>globalThis.injected=true</script>"\\\n';
    const escaped = cssString(payload);
    expect(escaped).not.toMatch(/[<>\r\n]/);
    expect(escaped).toContain('\\3C /style\\3E ');
    const html = buildPrintHtml({
      title: payload,
      author: payload,
      seriesTitle: 'Series',
      partNumber: 1,
      trim: '6x9',
      bleed: false,
      frontHtml: '',
      backHtml: '',
      chapters: [{ number: 3, title: 'Chapter 3: The Iron Chorus', html: '<p>Safe prose.</p>' }],
    });
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Chapter 3</span>The Iron Chorus');
    expect(html).not.toContain('Chapter 3: The Iron Chorus');
  });

  it('follows the KDP gutter buckets', () => {
    expect(insideMarginFor(24)).toBe(0.375);
    expect(insideMarginFor(150)).toBe(0.375);
    expect(insideMarginFor(151)).toBe(0.5);
    expect(insideMarginFor(300)).toBe(0.5);
    expect(insideMarginFor(301)).toBe(0.625);
    expect(insideMarginFor(501)).toBe(0.75);
    expect(insideMarginFor(701)).toBe(0.875);
  });

  it('adds bleed to the page size', () => {
    const without = printGeometry('6x9', 200, false);
    expect(without.pageWidth).toBe(6);
    expect(without.pageHeight).toBe(9);

    const withBleed = printGeometry('6x9', 200, true);
    expect(withBleed.pageWidth).toBeCloseTo(6.125);
    expect(withBleed.pageHeight).toBeCloseTo(9.25);
  });

  it('knows every trim size', () => {
    expect(TRIM_INCHES['5x8']).toEqual({ width: 5, height: 8 });
    expect(TRIM_INCHES['5.25x8']).toEqual({ width: 5.25, height: 8 });
    expect(TRIM_INCHES['5.5x8.5']).toEqual({ width: 5.5, height: 8.5 });
    expect(TRIM_INCHES['6x9']).toEqual({ width: 6, height: 9 });
  });

  it('emits mirrored margins and recto chapter starts', () => {
    const html = buildPrintHtml({
      title: 'The Lantern Garden',
      author: 'A. Writer',
      seriesTitle: 'The Ledger',
      partNumber: 2,
      trim: '6x9',
      bleed: false,
      pageCount: 200,
      frontHtml: '<section class="title-page">Title</section>',
      chapters: [{ number: 1, title: 'The Will', html: '<p>It began.</p>' }],
      backHtml: '<section class="back-matter">Next</section>',
    });

    expect(html).toContain('@page :left');
    expect(html).toContain('@page :right');
    expect(html).toContain('break-before: right');
    expect(html).toContain('size: 6in 9in');
    // 200 pages -> 0.5in gutter
    expect(html).toContain('margin: 0.75in 0.5in 0.75in 0.5in');
  });
});
