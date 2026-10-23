import { describe, expect, it } from 'vitest';
import type { Bible, Character, ChapterExtract } from '@booksaga/shared';
import { mergeBible } from './bibleMerge';

function emptyBible(): Bible {
  return {
    characters: {},
    locations: {},
    world: { setting: '', rules: [], tone: '' },
    timeline: [],
    threads: [],
    glossary: {},
    style: { pov: 'third', tense: 'past', voice: '', banned: [] },
    conflicts: [],
  };
}

function character(overrides: Partial<Character>): Character {
  return {
    name: 'Mara Vell',
    role: 'protagonist',
    relationships: [],
    secrets: [],
    status: 'active',
    source: 'ai',
    ...overrides,
  };
}

function facts(characters: Character[]): ChapterExtract['facts'] {
  return { characters, locations: [], timeline: [], threads: [], glossary: {} };
}

describe('mergeBible characters', () => {
  it('adds a new character with substance', () => {
    const bible = emptyBible();
    const result = mergeBible(
      bible,
      facts([character({ name: 'Mara Vell', appearance: 'Tall, weathered hands.' })]),
    );
    expect(result.bible.characters['mara-vell']?.name).toBe('Mara Vell');
    expect(result.diff.added).toContain('mara-vell');
  });

  it('matches a first name from an extract to the full name in the plan', () => {
    const bible = emptyBible();
    bible.characters['mara-vell'] = character({ name: 'Mara Vell' });

    const result = mergeBible(
      bible,
      facts([character({ name: 'Mara', personality: 'Patient, watchful.' })]),
    );

    const keys = Object.keys(result.bible.characters);
    expect(keys).toEqual(['mara-vell']);
    expect(result.bible.characters['mara-vell']?.name).toBe('Mara Vell');
    expect(result.bible.characters['mara-vell']?.personality).toBe('Patient, watchful.');
    expect(result.diff.added).toHaveLength(0);
  });

  it('does not shorten a full name when a shorter one is merged in', () => {
    const bible = emptyBible();
    bible.characters['mara-vell'] = character({ name: 'Mara Vell' });

    const result = mergeBible(bible, facts([character({ name: 'Mara', status: 'injured' })]));
    expect(result.bible.characters['mara-vell']?.name).toBe('Mara Vell');
  });

  it('ignores a bare name with no substance', () => {
    const bible = emptyBible();
    const result = mergeBible(
      bible,
      facts([character({ name: 'Bell', role: 'supporting', status: 'alive, fishmonger' })]),
    );
    expect(Object.keys(result.bible.characters)).toHaveLength(0);
    expect(result.diff.added).toHaveLength(0);
  });

  it('never overwrites a character the author locked', () => {
    const bible = emptyBible();
    bible.characters['mara-vell'] = character({
      name: 'Mara Vell',
      source: 'user',
      personality: 'Author wrote this.',
    });

    const result = mergeBible(
      bible,
      facts([character({ name: 'Mara Vell', personality: 'AI wants this.' })]),
    );

    expect(result.bible.characters['mara-vell']?.personality).toBe('Author wrote this.');
    expect(result.diff.conflicts).toHaveLength(1);
    expect(result.bible.conflicts[0]).toContain('locked');
  });
});
