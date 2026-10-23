/**
 * Create Series form contract (shared by the client form and the Server Action).
 * Kept out of the `'use server'` module because those may only export async functions.
 */
import { z } from 'zod';
import { GENRES } from '@booksaga/shared';

export const TONES = [
  'Engaging & Cinematic',
  'Dark & Gritty',
  'Cozy & Warm',
  'Humorous',
  'Literary',
  'Inspirational',
  'Professional & Instructional',
] as const;

export const AUDIENCES = [
  'Children 6–8',
  'Middle Grade',
  'Young Adult',
  'New Adult',
  'Adults',
  'Professionals',
] as const;

const GENRE_IDS = new Set(GENRES.map((g) => g.id));

export const seriesSettingsSchema = z.object({
  trim: z.enum(['5x8', '5.25x8', '5.5x8.5', '6x9']).default('6x9'),
  paper: z.enum(['white', 'cream']).default('white'),
  bleed: z.boolean().default(false),
  pov: z.enum(['first', 'third']).default('third'),
  tense: z.enum(['past', 'present']).default('past'),
  autoCovers: z.boolean().default(false),
});

export type SeriesSettings = z.infer<typeof seriesSettingsSchema>;

export const DEFAULT_SERIES_SETTINGS: SeriesSettings = {
  trim: '6x9',
  paper: 'white',
  bleed: false,
  pov: 'third',
  tense: 'past',
  autoCovers: false,
};

export const createSeriesSchema = z.object({
  idea: z.string().trim().min(40, 'Describe your idea in at least 40 characters.').max(2000),
  title: z.string().trim().min(2, 'Give the series a working title.').max(200),
  penName: z.string().trim().min(1, 'Choose an author name.').max(120),
  genre: z.string().refine((g) => GENRE_IDS.has(g), 'Choose a genre from the list.'),
  tone: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(80),
  plannedBooks: z.coerce.number().int().min(3).max(30),
  lengthPreset: z.enum(['short', 'standard', 'full']),
  bookTitle: z.string().trim().max(200).optional(),
  settings: seriesSettingsSchema,
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;

export const enhanceSchema = z.object({
  idea: z.string().trim().min(20, 'Write a little more first.').max(2000),
  genre: z.string().trim().min(1).max(80),
  tone: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(80),
});

export type EnhanceInput = z.infer<typeof enhanceSchema>;

export const suggestionsSchemaInput = z.object({
  idea: z.string().trim().min(10).max(2000),
  genre: z.string().trim().min(1).max(80),
});

export type SuggestionsInput = z.infer<typeof suggestionsSchemaInput>;

export interface CreateSeriesResult {
  seriesId: string;
  bookId: string;
  jobId: string;
}

export interface JobSnapshot {
  id: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stepLabel: string | null;
  error: string | null;
  refId: string | null;
  meta: Record<string, unknown>;
}
