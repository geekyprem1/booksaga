import { describe, expect, it } from 'vitest';
import { markdownToTiptap } from '@booksaga/shared';
import { replaceParagraph } from './book';

describe('replaceParagraph', () => {
  it('replaces the matching paragraph and keeps the rest of the chapter', () => {
    const doc = markdownToTiptap(
      'First paragraph.\n\nThe lantern was already lit.\n\nLast paragraph.',
    );
    const updated = replaceParagraph(doc, 'lantern was already lit', 'The lantern was dark.');

    expect(updated).not.toBeNull();
    expect(updated?.content).toHaveLength(3);
    expect(JSON.stringify(updated?.content[0])).toContain('First paragraph.');
    expect(JSON.stringify(updated?.content[1])).toContain('The lantern was dark.');
    expect(JSON.stringify(updated?.content[2])).toContain('Last paragraph.');
  });

  it('keeps every paragraph the model returned', () => {
    const doc = markdownToTiptap('One.\n\nThe lantern was already lit.');
    const updated = replaceParagraph(
      doc,
      'lantern was already lit',
      'First new line.\n\nSecond new line.',
    );

    expect(updated).not.toBeNull();
    expect(updated?.content).toHaveLength(3);
    expect(JSON.stringify(updated?.content[1])).toContain('First new line.');
    expect(JSON.stringify(updated?.content[2])).toContain('Second new line.');
  });

  it('returns null when the passage is not in the chapter', () => {
    const doc = markdownToTiptap('Only this paragraph.');
    expect(replaceParagraph(doc, 'not here', 'Replacement.')).toBeNull();
  });
});
