/**
 * Text preparation for narration (T6.13).
 *
 * Kokoro reads ~1000 characters per call, so a chapter is cleaned (markdown removed, quotes and
 * dashes normalised, scene breaks turned into a spoken pause) and then split on sentence
 * boundaries — never mid-sentence, so the concatenated audio sounds continuous.
 */
export const MAX_CHUNK_CHARS = 1000;

/** Spoken pause inserted where the manuscript has a scene break. */
export const SCENE_BREAK = ' ... ';

export function cleanForSpeech(text: string): string {
  return text
    // Markdown emphasis, headings, links and code fences.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Scene breaks become a pause (must run before the emphasis characters are stripped).
    .replace(/^\s*(?:\*\s*){3,}$/gm, SCENE_BREAK)
    .replace(/^\s*---+\s*$/gm, SCENE_BREAK)
    .replace(/[*_~`#>]+/g, ' ')
    // Typography the TTS reads badly.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, ', ')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chunkForSpeech(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const clean = cleanForSpeech(text);
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // A single monster sentence: hard-split on spaces so nothing is dropped.
      if (current) {
        chunks.push(current);
        current = '';
      }
      let rest = sentence;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(' ', maxChars);
        const at = cut > maxChars * 0.5 ? cut : maxChars;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) current = rest;
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Word count used for the rough narration length estimate. */
export function narrationSeconds(text: string, wpm = 155): number {
  const words = cleanForSpeech(text).split(/\s+/).filter(Boolean).length;
  return Math.round((words / wpm) * 60);
}
