/**
 * Print PDF layout (T5.4).
 *
 * A print-ready HTML document: exact trim size (plus bleed), mirrored inside/outside margins by
 * page count (KDP rules), running heads, page numbers and recto chapter starts. Chromium's print
 * pipeline renders it, which covers the same features Paged.js would polyfill — with fewer moving
 * parts in the worker.
 */
import { escapeHtml } from '../html/render';

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

export function buildPrintHtml(input: PrintInput): string {
  const geometry = printGeometry(input.trim, input.pageCount ?? 200, input.bleed);

  // Odd pages are recto: the gutter sits on the left; even pages mirror it.
  const css = `
@page {
  size: ${geometry.pageWidth}in ${geometry.pageHeight}in;
  margin: ${geometry.top}in ${geometry.outside}in ${geometry.bottom}in ${geometry.inside}in;
}
@page :left {
  margin-left: ${geometry.outside}in;
  margin-right: ${geometry.inside}in;
}
@page :right {
  margin-left: ${geometry.inside}in;
  margin-right: ${geometry.outside}in;
}
html, body { margin: 0; padding: 0; }
body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.5;
  text-align: justify;
  hyphens: auto;
}
h1, h2 { font-family: Georgia, serif; page-break-after: avoid; }
p { margin: 0 0 0.35em; text-indent: 1.2em; orphans: 3; widows: 3; }
p:first-of-type, h1 + p, h2 + p { text-indent: 0; }
hr.scene-break { border: 0; margin: 1.2em 0; text-align: center; }
hr.scene-break::after { content: '* * *'; letter-spacing: 0.5em; }
.chapter { page-break-before: right; }
.chapter h1 { font-size: 18pt; margin: 2.2in 0 0.6em; text-align: center; }
.chapter h1 .chapter-number { display: block; font-size: 9pt; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 0.5em; }
.title-page { page-break-after: always; text-align: center; padding-top: 2.5in; }
.title-page .series-name { font-size: 9pt; letter-spacing: 0.25em; text-transform: uppercase; }
.title-page .book-title { font-size: 28pt; margin: 0.6em 0; }
.title-page .author { margin-top: 2em; font-size: 13pt; }
.copyright-page { page-break-after: always; font-size: 8.5pt; padding-top: 3in; }
.copyright-page p { text-indent: 0; }
.toc { page-break-after: always; }
.toc ol { list-style: none; padding: 0; }
.toc li { margin: 0.25em 0; }
.back-matter { page-break-before: right; }
.back-matter p { text-indent: 0; }
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.title)}</title>
<style>${css}</style>
</head>
<body>
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
