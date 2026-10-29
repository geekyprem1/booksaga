import { describe, expect, it } from 'vitest';
import { GENRES, getDfyGenre, getGenre } from './genres';

describe('genre lookup', () => {
  it('accepts the ids used in forms and the labels stored in existing series', () => {
    for (const genre of GENRES) {
      expect(getGenre(genre.id)).toBe(genre);
      expect(getGenre(` ${genre.label.toUpperCase()} `)).toBe(genre);
    }
    expect(getGenre('unknown')).toBeUndefined();
  });

  it.each([
    ['Vampire Romance', 'romance'],
    ['Wolf Shifter', 'romance'],
    ['Dark Academia', 'mystery-thriller'],
    ['Space Opera', 'sci-fi'],
    ['Cozy Witch', 'cozy-mystery'],
    ['LitRPG', 'fantasy'],
    ['Historical Romance', 'romance'],
    ['Fantasy', 'fantasy'],
  ])('maps DFY niche %s to %s', (niche, id) => {
    expect(getDfyGenre(niche)?.id).toBe(id);
  });
});
