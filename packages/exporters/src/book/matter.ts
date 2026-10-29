/**
 * Front and back matter (T5.2). These pages are generated, not AI-written: title page, copyright
 * (with the series reading order), table of contents, "End of book" page, "Read Next" (with the
 * {{NEXT_BOOK_URL}} placeholder KDP authors replace), About the Author and the series list.
 */
import type { BookMetadata } from '@booksaga/shared';
import { displayTitle, escapeHtml } from '../html/render';

export interface MatterInput {
  seriesTitle: string;
  bookTitle: string;
  subtitle?: string | null;
  partNumber: number;
  author: string;
  year: number;
  metadata: Partial<BookMetadata> | null;
  chapters: { number: number; title: string }[];
  /** Genre line under the title, e.g. "A Psychological Thriller". */
  genreLine?: string | null;
  /** Every book of the series in order, for the Reading Order list. */
  readingOrder?: { partNumber: number; title: string | null }[];
  /** True when this is the last book of the series. */
  isFinalPart?: boolean;
  /** Title of the next book when it already has one. */
  nextTitle?: string | null;
}

export function titlePage(input: MatterInput): string {
  return `<section class="title-page">
  <p class="series-name">${escapeHtml(input.seriesTitle)}</p>
  ${/book\s*\d/i.test(input.subtitle ?? '') ? '' : `<p class="book-part">Book ${input.partNumber}</p>`}
  <h1 class="book-title">${escapeHtml(input.bookTitle)}</h1>
  ${input.subtitle ? `<p class="book-subtitle">${escapeHtml(input.subtitle)}</p>` : ''}
  <p class="author">${escapeHtml(input.author)}</p>
  ${input.genreLine ? `<p class="book-genre">${escapeHtml(input.genreLine)}</p>` : ''}
</section>`;
}

export function readingOrderList(input: MatterInput): string {
  const order = input.readingOrder ?? [];
  if (order.length < 2) return '';
  const items = order
    .map((entry) => {
      const label = `Book ${entry.partNumber}${entry.title ? `: ${escapeHtml(entry.title)}` : ''}`;
      return `<li${entry.partNumber === input.partNumber ? ' class="current"' : ''}>${label}</li>`;
    })
    .join('\n');
  return `<p class="reading-order-label">Reading order</p>
  <ul class="reading-order">${items}</ul>`;
}

export function copyrightPage(input: MatterInput): string {
  return `<section class="copyright-page">
  <p>${escapeHtml(input.bookTitle)}</p>
  <p>Copyright © ${input.year} ${escapeHtml(input.author)}</p>
  <p>First edition, ${input.year}. All rights reserved.</p>
  <p>This book was produced with the assistance of artificial intelligence and edited by the author.
  It is a work of fiction. Names, characters, places and incidents are products of the author's
  imagination or are used fictitiously.</p>
  <p>No part of this publication may be reproduced, distributed or transmitted in any form without
  the prior written permission of the author, except for brief quotations in a review.</p>
  ${readingOrderList(input)}
</section>`;
}

export function tableOfContents(chapters: { number: number; title: string }[]): string {
  const items = chapters
    .map(
      (chapter) =>
        `<li><a href="#ch-${chapter.number}"><span class="toc-num">${String(chapter.number).padStart(2, '0')}</span> ${escapeHtml(displayTitle(chapter.title))}</a></li>`,
    )
    .join('\n');
  return `<nav class="toc" id="toc">
  <h2>Contents</h2>
  <ol>${items}</ol>
</nav>`;
}

/** Closing page after the last chapter: "End of Book N / Continued in …" or "The End". */
export function endOfBookPage(input: MatterInput): string {
  const end = `End of Book ${input.partNumber}`;
  const continued = input.isFinalPart
    ? '<p class="continued">The End</p>'
    : `<p class="continued">Continued in <em>${escapeHtml(
        input.nextTitle?.trim() || `Book ${input.partNumber + 1}`,
      )}</em></p>`;
  return `<section class="back-matter end-of-book">
  <p class="end-mark">${escapeHtml(end)}</p>
  ${continued}
</section>`;
}

export function readNextPage(input: MatterInput, nextTitle?: string | null): string {
  const next =
    input.metadata?.readNext?.trim() || 'The story continues in the next part of the series.';
  return `<section class="back-matter read-next">
  <h2>Read Next</h2>
  ${nextTitle ? `<p class="next-title">${escapeHtml(nextTitle)}</p>` : ''}
  <p>${escapeHtml(next)}</p>
  <p><a href="{{NEXT_BOOK_URL}}">{{NEXT_BOOK_URL}}</a></p>
</section>`;
}

export function aboutAuthorPage(input: MatterInput): string {
  const bio = input.metadata?.authorBio?.trim();
  return `<section class="back-matter about-author">
  <h2>About the Author</h2>
  <p>${escapeHtml(bio || `${input.author} writes ${input.seriesTitle} and other stories.`)}</p>
</section>`;
}

export function alsoInSeriesPage(input: MatterInput, titles: string[]): string {
  if (titles.length === 0) return '';
  const items = titles.map((title) => `<li>${escapeHtml(title)}</li>`).join('\n');
  return `<section class="back-matter also-in-series">
  <h2>Also in this Series</h2>
  <ul>${items}</ul>
</section>`;
}

/** All front matter, in reading order. */
export function frontMatter(input: MatterInput): string {
  return [titlePage(input), copyrightPage(input), tableOfContents(input.chapters)].join('\n');
}

/** All back matter, in reading order. */
export function backMatter(input: MatterInput, alsoTitles: string[]): string {
  return [
    endOfBookPage(input),
    readNextPage(input, input.isFinalPart ? null : input.nextTitle),
    aboutAuthorPage(input),
    alsoInSeriesPage(input, alsoTitles),
  ]
    .filter(Boolean)
    .join('\n');
}
