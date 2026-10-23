/**
 * Length presets (PRD §7.2). This table is the single source of truth for chapter count and
 * words per chapter — prompts, pipeline and UI all read it.
 */
import type { LengthPreset } from './credits';

export interface LengthPresetDefinition {
  key: LengthPreset;
  label: string;
  /** Inclusive range the outline should aim for. */
  chapters: readonly [number, number];
  wordsPerChapter: number;
  approxWords: number;
  description: string;
}

export const LENGTH_PRESETS: Record<LengthPreset, LengthPresetDefinition> = {
  short: {
    key: 'short',
    label: 'Short',
    chapters: [8, 10],
    wordsPerChapter: 1300,
    approxWords: 12000,
    description: '~12k words · 8–10 chapters',
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    chapters: [15, 20],
    wordsPerChapter: 1700,
    approxWords: 30000,
    description: '~30k words · 15–20 chapters',
  },
  full: {
    key: 'full',
    label: 'Full-length',
    chapters: [25, 30],
    wordsPerChapter: 2000,
    approxWords: 55000,
    description: '~55k words · 25–30 chapters',
  },
};

export const LENGTH_PRESET_KEYS = ['short', 'standard', 'full'] as const;

export function isLengthPreset(value: string): value is LengthPreset {
  return (LENGTH_PRESET_KEYS as readonly string[]).includes(value);
}

/** The chapter count used when planning (midpoint of the range). */
export function plannedChapters(preset: LengthPreset): number {
  const [min, max] = LENGTH_PRESETS[preset].chapters;
  return Math.round((min + max) / 2);
}
