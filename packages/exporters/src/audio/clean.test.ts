import { describe, expect, it } from 'vitest';
import { chunkForSpeech, cleanForSpeech, MAX_CHUNK_CHARS, narrationSeconds } from './clean';

describe('speech text preparation', () => {
  it('strips markdown and normalises typography', () => {
    const input = '# Chapter 1\n\nShe said \u201Cwait\u201D \u2014 then **ran**.\n\n* * *\n\nHe followed.';
    const cleaned = cleanForSpeech(input);

    expect(cleaned).not.toContain('#');
    expect(cleaned).not.toContain('**');
    expect(cleaned).toContain('"wait"');
    expect(cleaned).toContain('...');
    expect(cleaned).not.toContain('\u2014');
  });

  it('keeps chunks under the limit and never splits mid-sentence', () => {
    const paragraph = 'The road narrowed where the pines closed in. She counted the windows twice. ';
    const chunks = chunkForSpeech(paragraph.repeat(40), 400);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400);
      expect(chunk.trim()).toBe(chunk);
    }
    // Every chunk ends a sentence (or is a hard split at a space).
    expect(chunks.every((chunk) => /[.!?]$/.test(chunk) || chunk.length > 300)).toBe(true);
  });

  it('hard-splits a sentence longer than the limit', () => {
    const monster = 'word '.repeat(600).trim();
    const chunks = chunkForSpeech(monster, MAX_CHUNK_CHARS);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= MAX_CHUNK_CHARS)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(monster);
  });

  it('estimates narration length', () => {
    expect(narrationSeconds('one two three four five', 60)).toBe(5);
  });
});
