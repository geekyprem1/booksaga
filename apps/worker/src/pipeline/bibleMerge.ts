/**
 * Series-bible merge (T2.13).
 *
 * The AI may add entries and update its own entries. Anything the author edited (`source: 'user'`)
 * is frozen: the proposed change is recorded in `conflicts[]` instead of applied, which is what the
 * Continuity Report shows. Stable slug ids keep the same character across chapters even when the
 * model writes "Mira" one time and "Mira Vance" the next.
 */
import type { Bible, ChapterExtract, Character, Location } from '@booksaga/shared';

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface MergeDiff {
  added: string[];
  updated: string[];
  conflicts: string[];
}

export interface MergeResult {
  bible: Bible;
  diff: MergeDiff;
}

type Facts = ChapterExtract['facts'];

function meaningfulChange(existing: Character, next: Character): boolean {
  return (
    existing.name !== next.name ||
    (next.status !== 'active' && existing.status !== next.status) ||
    (!!next.appearance && existing.appearance !== next.appearance) ||
    (!!next.personality && existing.personality !== next.personality)
  );
}

function mergeCharacter(existing: Character, next: Character): Character {
  // A chapter extract often uses the first name only ("Mara"); never let it shorten "Mara Vell".
  const keepFullName =
    next.name.length < existing.name.length &&
    existing.name.toLowerCase().startsWith(next.name.toLowerCase());

  return {
    ...existing,
    ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== undefined)),
    name: keepFullName ? existing.name : next.name,
    source: 'ai',
  } as Character;
}

function firstToken(name: string): string {
  return slugify(name).split('-')[0] ?? '';
}

/**
 * Match an incoming character to an existing one. Exact slug first, then a unique first-name match,
 * so "Mara" from a chapter extract updates "Mara Vell" from the series plan instead of creating a
 * second, empty character.
 */
function findCharacterKey(characters: Bible['characters'], name: string): string | null {
  const key = slugify(name);
  if (characters[key]) return key;

  const token = firstToken(name);
  if (!token) return null;

  const candidates = Object.keys(characters).filter(
    (k) => firstToken(characters[k]?.name ?? k) === token,
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/** A character with nothing but a name is not worth a bible entry. */
function hasSubstance(character: Character): boolean {
  return Boolean(
    character.appearance ||
      character.personality ||
      character.backstory ||
      (character.secrets?.length ?? 0) > 0 ||
      (character.role && character.role !== 'supporting'),
  );
}

function mergeLocation(existing: Location, next: Location): Location {
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== undefined)),
    source: 'ai',
  } as Location;
}

export function mergeBible(
  current: Bible,
  facts: Facts,
  options: { chapterNumber?: number; bookNumber?: number } = {},
): MergeResult {
  const bible: Bible = {
    ...current,
    characters: { ...current.characters },
    locations: { ...current.locations },
    world: { ...current.world, rules: [...current.world.rules] },
    timeline: [...current.timeline],
    threads: [...current.threads],
    glossary: { ...current.glossary },
    style: { ...current.style },
    conflicts: [...current.conflicts],
  };

  const diff: MergeDiff = { added: [], updated: [], conflicts: [] };

  for (const character of facts.characters) {
    const key = findCharacterKey(bible.characters, character.name);
    const existing = key ? bible.characters[key] : undefined;
    const targetKey = key ?? slugify(character.name);

    if (!existing) {
      // The extract only reports "new or changed" characters, often by first name only. A bare
      // name with no substance would just add an empty card to the bible, so it is ignored.
      if (!hasSubstance(character)) continue;
      bible.characters[targetKey] = { ...character, source: 'ai' };
      diff.added.push(targetKey);
      continue;
    }

    if (existing.source === 'user') {
      if (meaningfulChange(existing, character)) {
        const conflict = `Character "${existing.name}": the AI proposed changes that were not applied because you locked this entry.`;
        diff.conflicts.push(conflict);
        bible.conflicts.push(conflict);
      }
      continue;
    }

    bible.characters[targetKey] = mergeCharacter(existing, character);
    diff.updated.push(targetKey);
  }

  for (const location of facts.locations) {
    const key = slugify(location.name);
    const existing = bible.locations[key];

    if (!existing) {
      bible.locations[key] = { ...location, source: 'ai' };
      diff.added.push(`location:${key}`);
      continue;
    }

    if (existing.source === 'user') {
      if (location.description && location.description !== existing.description) {
        const conflict = `Location "${existing.name}": the AI proposed a different description that was not applied because you locked this entry.`;
        diff.conflicts.push(conflict);
        bible.conflicts.push(conflict);
      }
      continue;
    }

    bible.locations[key] = mergeLocation(existing, location);
    diff.updated.push(`location:${key}`);
  }

  for (const event of facts.timeline) {
    const text = event.trim();
    if (!text) continue;
    const exists = bible.timeline.some((t) => t.event.toLowerCase() === text.toLowerCase());
    if (exists) continue;
    bible.timeline.push({
      order: bible.timeline.length + 1,
      book: options.bookNumber ?? 1,
      event: text,
    });
  }

  for (const thread of facts.threads) {
    const key = slugify(thread.label);
    const index = bible.threads.findIndex((t) => slugify(t.label) === key);

    if (index === -1) {
      bible.threads.push({ ...thread, source: 'ai' });
      diff.added.push(`thread:${key}`);
      continue;
    }

    const existing = bible.threads[index];
    if (!existing) continue;

    if (existing.source === 'user') {
      if (existing.status !== thread.status) {
        const conflict = `Thread "${existing.label}": the AI wanted to mark it ${thread.status}, but you locked it as ${existing.status}.`;
        diff.conflicts.push(conflict);
        bible.conflicts.push(conflict);
      }
      continue;
    }

    bible.threads[index] = { ...existing, ...thread, source: 'ai' };
    diff.updated.push(`thread:${key}`);
  }

  for (const [term, definition] of Object.entries(facts.glossary)) {
    if (term in bible.glossary) continue;
    bible.glossary[term] = definition;
    diff.added.push(`term:${slugify(term)}`);
  }

  return { bible, diff };
}
