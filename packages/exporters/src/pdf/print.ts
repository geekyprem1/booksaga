/**
 * Print PDF layout (T5.4).
 *
 * A print-ready HTML document: exact trim size (plus bleed), mirrored inside/outside margins by
 * page count (KDP rules), running heads, page numbers and recto chapter starts. Chromium's print
 * pipeline renders it, which covers the same features Paged.js would polyfill — with fewer moving
 * parts in the worker.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../html/render';

// Keep filesystem paths out of new URL(..., import.meta.url), which Turbopack treats as assets.
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../fonts');

let fontCss: string | null = null;

/**
 * Embedded book fonts (EB Garamond, OFL). The print page is loaded with `setContent`, so there is
 * no file origin to link to: the fonts travel inside the HTML as data URIs. This also makes the
 * PDF identical on Windows and in the Linux worker image, which has no Georgia.
 */
export function printFontCss(): string {
  if (fontCss !== null) return fontCss;
  try {
    const face = (file: string, style: 'normal' | 'italic') =>
      `@font-face { font-family: 'EB Garamond'; font-style: ${style}; font-weight: 400 800; src: url(data:font/ttf;base64,${readFileSync(join(FONT_DIR, file)).toString('base64')}) format('truetype'); }`;
    fontCss = `${face('EBGaramond-VF.ttf', 'normal')}\n${face('EBGaramond-Italic-VF.ttf', 'italic')}`;
  } catch {
    // Missing font files must not fail an export: fall back to the system serif.
    fontCss = '';
  }
  return fontCss;
}

export type TrimSize = '5x8' | '5.25x8' | '5.5x8.5' | '6x9';

export const TRIM_INCHES: Record<TrimSize, { width: number; height: number }> = {
  '5x8': { width: 5, height: 8 },
  '5.25x8': { width: 5.25, height: 8 },
  '5.5x8.5': { width: 5.5, height: 8.5 },
  '6x9': { width: 6, height: 9 },
};

export const BLEED_INCHES = 0.125;

/** KDP inside (gutter) margin by page count. */
export function insideMarginFor(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export const OUTSIDE_MARGIN = 0.5;
export const TOP_MARGIN = 0.75;
export const BOTTOM_MARGIN = 0.75;

export interface PrintInput {
  title: string;
  author: string;
  seriesTitle: string;
  partNumber: number;
  trim: TrimSize;
  bleed: boolean;
  /** Front matter and chapters already rendered to HTML. */
  frontHtml: string;
  chapters: { number: number; title: string; html: string }[];
  backHtml: string;
  /** `#rrggbb` accent for chapter labels and the part line. Pick one that reads on white. */
  accent?: string;
  /**
   * Reader PDF only: a finished cover placed as a full-bleed first page. KDP interiors must NOT
   * have one, so the print PDF never sets this. Printed page numbers match the viewer's page index.
   */
  coverImage?: { buffer: Buffer; mime: string };
  /** Used for the first pass; the renderer re-runs once the real count is known. */
  pageCount?: number;
}

export interface PrintGeometry {
  pageWidth: number;
  pageHeight: number;
  inside: number;
  outside: number;
  top: number;
  bottom: number;
}

export function printGeometry(trim: TrimSize, pageCount: number, bleed: boolean): PrintGeometry {
  const { width, height } = TRIM_INCHES[trim];
  const inside = insideMarginFor(pageCount);
  return {
    pageWidth: width + (bleed ? BLEED_INCHES : 0),
    pageHeight: height + (bleed ? BLEED_INCHES * 2 : 0),
    inside,
    outside: OUTSIDE_MARGIN,
    top: TOP_MARGIN,
    bottom: BOTTOM_MARGIN,
  };
}

/** Escape text for a CSS string literal (used in `content:` of the running heads). */
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
}

export function buildPrintHtml(input: PrintInput): string {
  const geometry = printGeometry(input.trim, input.pageCount ?? 200, input.bleed);
  const accent = input.accent ?? '#5b4636';
  const headStyle = `font-family: 'EB Garamond', Georgia, serif; font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: #555;`;

  // Odd pages are recto: the gutter sits on the left; even pages mirror it.
  // Running heads: book title on recto (right) pages, author on verso (left) pages, with the page
  // number centred at the foot. Front and back matter use the `plain` page and stay clean.
  const css = `
${printFontCss()}
@page {
  size: ${geometry.pageWidth}in ${geometry.pageHeight}in;
  margin: ${geometry.top}in ${geometry.outside}in ${geometry.bottom}in ${geometry.inside}in;
}
@page :left {
  margin-left: ${geometry.outside}in;
  margin-right: ${geometry.inside}in;
  @top-center { content: ${cssString(input.author)}; ${headStyle} }
  @bottom-center { content: counter(page); ${headStyle} }
}
@page :right {
  margin-left: ${geometry.inside}in;
  margin-right: ${geometry.outside}in;
  @top-center { content: ${cssString(input.title)}; ${headStyle} }
  @bottom-center { content: counter(page); ${headStyle} }
}
@page plain { @top-center { content: none; } @bottom-center { content: none; } }
@page cover { margin: 0; @top-center { content: none; } @bottom-center { content: none; } }
.reader-cover { page: cover; break-after: page; margin: 0; padding: 0; }
.reader-cover img { display: block; width: ${geometry.pageWidth}in; height: ${geometry.pageHeight}in; object-fit: cover; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
  font-size: 12pt;
  line-height: 1.38;
  text-align: justify;
  hyphens: auto;
}
h1, h2 { font-family: 'EB Garamond', Georgia, serif; break-after: avoid; }
p { margin: 0 0 0.35em; text-indent: 1.2em; orphans: 3; widows: 3; text-align-last: left; }
p:first-of-type { text-indent: 0; }
hr.scene-break { border: 0; margin: 1.2em 0; text-align: center; }
hr.scene-break::after { content: '* * *'; letter-spacing: 0.5em; }
.chapter { page: chapter; break-before: right; }
.chapter .chapter { break-before: auto; }
@page chapter:first { @top-center { content: none; } @bottom-center { content: none; } }
@page :blank { @top-center { content: none; } @bottom-center { content: none; } }
.chapter h1 { font-size: 18pt; margin: 2.2in 0 0.6em; text-align: center; }
.chapter h1 .chapter-number { display: block; font-size: 9pt; letter-spacing: 0.25em; text-transform: uppercase; color: ${accent}; margin-bottom: 0.5em; }
.title-page { page: plain; break-after: page; text-align: center; padding-top: 2.2in; }
.title-page .series-name { font-size: 9pt; letter-spacing: 0.25em; text-transform: uppercase; }
.title-page .book-part { text-indent: 0; font-size: 9pt; letter-spacing: 0.3em; text-transform: uppercase; color: ${accent}; margin-top: 0.5em; }
.title-page .book-title { font-size: 30pt; line-height: 1.1; margin: 0.5em 0; }
.title-page .book-subtitle { text-indent: 0; font-style: italic; }
.title-page .author { text-indent: 0; margin-top: 2em; font-size: 13pt; letter-spacing: 0.15em; text-transform: uppercase; }
.title-page .book-genre { text-indent: 0; font-style: italic; margin-top: 2.4em; color: #444; }
.copyright-page { page: plain; break-after: page; font-size: 8.5pt; padding-top: 2.4in; }
.copyright-page p { text-indent: 0; }
.copyright-page .reading-order-label { letter-spacing: 0.2em; text-transform: uppercase; color: ${accent}; margin-top: 1.6em; font-weight: bold; }
.copyright-page .reading-order { list-style: none; padding: 0; margin: 0.4em 0 0; }
.copyright-page .reading-order li { margin: 0.15em 0; }
.copyright-page .reading-order li.current { font-weight: bold; }
.toc { page: plain; break-after: page; }
.toc ol { list-style: none; padding: 0; }
.toc li { margin: 0.25em 0; }
.toc .toc-num { color: ${accent}; font-weight: bold; margin-right: 0.6em; }
.toc a { color: inherit; text-decoration: none; display: block; overflow: hidden; }
.toc a::after { content: target-counter(attr(href), page); float: right; }
.back-matter { page: plain; break-before: page; }
.back-matter.end-of-book { break-before: right; }
.back-matter p { text-indent: 0; }
.title-page p, .end-of-book p { text-indent: 0; }
.end-of-book { text-align: center; padding-top: 3in; }
.end-of-book .end-mark { letter-spacing: 0.3em; text-transform: uppercase; color: ${accent}; font-weight: bold; }
.end-of-book .continued { font-style: italic; }
`;

  const coverPage = input.coverImage
    ? `<section class="reader-cover"><img alt="" src="data:${input.coverImage.mime};base64,${input.coverImage.buffer.toString('base64')}" /></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.title)}</title>
<style>${css}</style>
</head>
<body>
${coverPage}
${input.frontHtml}
${input.chapters
  .map(
    (chapter) =>
      `<section class="chapter" id="ch-${chapter.number}"><h1><span class="chapter-number">Chapter ${chapter.number}</span>${escapeHtml(chapter.title)}</h1>${chapter.html}</section>`,
  )
  .join('\n')}
${input.backHtml}
</body>
</html>`;
}
