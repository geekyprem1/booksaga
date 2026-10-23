/**
 * Front and back matter (T5.2). These pages are generated, not AI-written: title page, copyright,
 * table of contents, "Read Next" (with the {{NEXT_BOOK_URL}} placeholder KDP authors replace),
 * About the Author and the series list.
 */
import type { BookMetadata } from '@booksaga/shared';
import { escapeHtml } from '../html/render';

export interface MatterInput {
  seriesTitle: string;
  bookTitle: string;
  subtitle?: string | null;
  partNumber: number;
  author: string;
  year: number;
  metadata: Partial<BookMetadata> | null;
  chapters: { number: number; title: string }[];
}

export function titlePage(input: MatterInput): string {
  return `<section class="title-page">
  <p class="series-name">${escapeHtml(input.seriesTitle)}</p>
  <h1 class="book-title">${escapeHtml(input.bookTitle)}</h1>
  ${input.subtitle ? `<p class="book-subtitle">${escapeHtml(input.subtitle)}</p>` : ''}
  <p class="book-part">Book ${input.partNumber}</p>
  <p class="author">${escapeHtml(input.author)}</p>
</section>`;
}

export function copyrightPage(input: MatterInput): string {
  return `<section class="copyright-page">
  <p>${escapeHtml(input.bookTitle)}</p>
  <p>Copyright © ${input.year} ${escapeHtml(input.author)}</p>
  <p>All rights reserved.</p>
  <p>This book was produced with the assistance of artificial intelligence and edited by the author.
  It is a work of fiction. Names, characters, places and incidents are products of the author's
  imagination or are used fictitiously.</p>
  <p>No part of this publication may be reproduced, distributed or transmitted in any form without
  the prior written permission of the author, except for brief quotations in a review.</p>
</section>`;
}

export function tableOfContents(chapters: { number: number; title: string }[]): string {
  const items = chapters
    .map(
      (chapter) =>
        `<li><a href="#ch-${chapter.number}">Chapter ${chapter.number} · ${escapeHtml(chapter.title)}</a></li>`,
    )
    .join('\n');
  return `<nav class="toc" id="toc">
  <h2>Contents</h2>
  <ol>${items}</ol>
</nav>`;
}

export function readNextPage(input: MatterInput, nextTitle?: string | null): string {
  const next = input.metadata?.readNext?.trim() || 'The story continues in the next part of the series.';
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
  return [
    titlePage(input),
    copyrightPage(input),
    tableOfContents(input.chapters),
  ].join('\n');
}

/** All back matter, in reading order. */
export function backMatter(input: MatterInput, alsoTitles: string[]): string {
  return [
    readNextPage(input),
    aboutAuthorPage(input),
    alsoInSeriesPage(input, alsoTitles),
  ]
    .filter(Boolean)
    .join('\n');
}
