/**
 * Context budgeting for chapter calls (T2.12, ARCH §5.3).
 *
 * The bible grows with every chapter, so it is compacted per call: the characters and locations
 * that actually appear in this chapter keep their full record, everyone else collapses to a
 * one-liner. Summaries and the previous chapter's tail are trimmed until the whole input fits the
 * budget (~40k tokens), which keeps cost and latency flat across a long series.
 */
import type { Bible, BookOutline, Character } from '@booksaga/shared';

/** Roughly 4 characters per token — good enough to keep us inside the budget. */
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

const MAX_INPUT_TOKENS = 40_000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function focusSet(names: readonly string[]): Set<string> {
  return new Set(names.flatMap((n) => [n, slugify(n)]).filter(Boolean));
}

function shortCharacter(c: Character): Character {
  return { ...c, appearance: undefined, personality: undefined, backstory: undefined };
}

/** Keep full data for the cast in this chapter, one-liners for the rest. */
export function compactBible(bible: Bible, focus: readonly string[] = []): Bible {
  const focusKeys = focusSet(focus);

  const characters: Bible['characters'] = {};
  for (const [key, character] of Object.entries(bible.characters)) {
    const isFocus = focusKeys.has(key) || focusKeys.has(character.name);
    characters[key] = isFocus ? character : shortCharacter(character);
  }

  const locations: Bible['locations'] = {};
  for (const [key, location] of Object.entries(bible.locations)) {
    locations[key] = focusKeys.has(key) || focusKeys.has(location.name)
      ? location
      : { ...location, description: '' };
  }

  const openThreads = bible.threads.filter((t) => t.status === 'open');
  const resolved = bible.threads.filter((t) => t.status !== 'open').slice(-5);

  const glossaryEntries = Object.entries(bible.glossary).slice(0, 50);

  return {
    ...bible,
    characters,
    locations,
    timeline: bible.timeline.slice(-40),
    threads: [...openThreads.slice(-20), ...resolved],
    glossary: Object.fromEntries(glossaryEntries),
    conflicts: bible.conflicts.slice(-10),
  };
}

export interface ChapterContextInput {
  bible: Bible;
  outline: BookOutline;
  /** Summaries of the chapters already written in this book. */
  chapterSummaries: { number: number; title: string; summary: string }[];
  /** Book-level summaries of the earlier parts. */
  previousBookSummaries: string[];
  /** Plain text of the previous chapter (tail is used). */
  previousText?: string;
  /** Names/keys that appear in this chapter (from the outline). */
  focus?: readonly string[];
}

export interface ChapterContext {
  bible: Bible;
  outline: BookOutline;
  previousSummaries: string[];
  previousBookSummaries: string[];
  previousTail: string;
  estimatedTokens: number;
}

function tailWords(text: string, words: number): string {
  const parts = text.trim().split(/\s+/);
  return parts.length <= words ? text.trim() : parts.slice(-words).join(' ');
}

export function buildChapterContext(input: ChapterContextInput): ChapterContext {
  const bible = compactBible(input.bible, input.focus);
  // The outline only needs the current book's chapter list; drop nothing else.
  const outline = input.outline;

  let summaries = input.chapterSummaries.map((c) => `Ch ${c.number} (${c.title}): ${c.summary}`);
  let bookSummaries = [...input.previousBookSummaries];
  let previousTail = input.previousText ? tailWords(input.previousText, 1500) : '';

  const measure = () =>
    estimateTokens({ bible, outline, summaries, bookSummaries, previousTail });

  // 1) Trim the oldest chapter summaries first.
  while (measure() > MAX_INPUT_TOKENS && summaries.length > 3) summaries = summaries.slice(1);

  // 2) Shorten every remaining summary.
  if (measure() > MAX_INPUT_TOKENS) {
    summaries = summaries.map((s) => (s.length > 400 ? `${s.slice(0, 400)}…` : s));
  }

  // 3) Drop the previous tail, then the earlier books' summaries.
  if (measure() > MAX_INPUT_TOKENS) previousTail = previousTail.split(/\s+/).slice(-400).join(' ');
  if (measure() > MAX_INPUT_TOKENS) bookSummaries = bookSummaries.slice(-2);
  if (measure() > MAX_INPUT_TOKENS) {
    bookSummaries = bookSummaries.map((s) => (s.length > 400 ? `${s.slice(0, 400)}…` : s));
  }

  return {
    bible,
    outline,
    previousSummaries: summaries,
    previousBookSummaries: bookSummaries,
    previousTail,
    estimatedTokens: measure(),
  };
}
