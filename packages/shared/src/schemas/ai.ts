/**
 * Zod schemas for every structured AI response (T2.11). These are the contract between the
 * prompts, the JSON repair loop and the pipeline: if the model returns something else, validation
 * fails and the repair call asks for the right shape.
 *
 * Everything that the model may legitimately omit has a default, so a slightly thin response
 * still validates instead of burning a repair round.
 */
import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const characterSchema = z.object({
  name: trimmed(120),
  role: z.string().trim().max(200).default('supporting'),
  age: z.preprocess((v) => (v === null || v === undefined ? undefined : String(v)), z.string().trim().max(60).optional()),
  appearance: z.string().trim().max(1000).optional(),
  personality: z.string().trim().max(1000).optional(),
  backstory: z.string().trim().max(2000).optional(),
  relationships: z.array(z.string().trim().max(200)).default([]),
  secrets: z.array(z.string().trim().max(300)).default([]),
  /** 'active' | 'dead' | 'missing' — free text keeps the model honest about long series. */
  status: z.string().trim().max(300).default('active'),
  /** 'user' entries are never overwritten by the AI merge (ARCH §6). */
  source: z.enum(['ai', 'user']).default('ai'),
});
export type Character = z.infer<typeof characterSchema>;

export const locationSchema = z.object({
  name: trimmed(120),
  description: z.string().trim().max(800).default(''),
  significance: z.string().trim().max(300).optional(),
  source: z.enum(['ai', 'user']).default('ai'),
});
export type Location = z.infer<typeof locationSchema>;

export const timelineEventSchema = z.object({
  order: z.number().int().nonnegative().default(0),
  book: z.number().int().positive().default(1),
  event: z.string().trim().min(1).max(400),
});

export const threadSchema = z.object({
  label: z.string().trim().min(1).max(200),
  // Models answer "ongoing", "OPEN", "closed", "resolved"…; normalise instead of failing the call.
  status: z
    .string()
    .trim()
    .default('open')
    .transform((value) => (/resolv|clos|done|complet/i.test(value) ? 'resolved' : 'open')),
  detail: z.string().trim().max(600).default(''),
  source: z.enum(['ai', 'user']).default('ai'),
});

export const bibleSchema = z.object({
  characters: z.record(z.string(), characterSchema).default({}),
  locations: z.record(z.string(), locationSchema).default({}),
  world: z
    .object({
      setting: z.string().trim().max(1200).default(''),
      rules: z.array(z.string().trim().max(400)).default([]),
      tone: z.string().trim().max(200).default(''),
    })
    .default({ setting: '', rules: [], tone: '' }),
  timeline: z.array(timelineEventSchema).default([]),
  threads: z.array(threadSchema).default([]),
  glossary: z.record(z.string(), z.string()).default({}),
  style: z
    .object({
      pov: z.string().trim().max(200).default('third'),
      tense: z.string().trim().max(200).default('past'),
      voice: z.string().trim().max(400).default(''),
      banned: z.array(z.string()).default([]),
    })
    .default({ pov: 'third', tense: 'past', voice: '', banned: [] }),
  /** Unresolved contradictions raised by the merge step (not by the model). */
  conflicts: z
    .array(z.unknown())
    .default([])
    .transform((list) => list.map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))),
});
export type Bible = z.infer<typeof bibleSchema>;

export const seriesArcSchema = z.object({
  overview: z.string().trim().min(1).max(3000),
  books: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        title: z.string().trim().max(200).default(''),
        premise: z.string().trim().min(1).max(1200),
        question: z.string().trim().max(400).default(''),
        cliffhanger: z.string().trim().max(600).default(''),
      }),
    )
    .min(1),
});
export type SeriesArc = z.infer<typeof seriesArcSchema>;

export const seriesPlanSchema = z.object({
  logline: z.string().trim().max(400).default(''),
  arc: seriesArcSchema,
  bible: bibleSchema,
});
export type SeriesPlan = z.infer<typeof seriesPlanSchema>;

export const bookOutlineSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).optional(),
  premise: z.string().trim().max(1500).default(''),
  chapters: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string().trim().min(1).max(200),
        beats: z.array(z.string().trim().max(500)).default([]),
        pov: z.string().trim().max(80).optional(),
        characters: z.array(z.string().trim().max(120)).default([]),
        targetWords: z.number().int().min(300).max(6000).default(1500),
      }),
    )
    .min(3),
  resolution: z.string().trim().max(1500).default(''),
  cliffhanger: z.string().trim().max(1500).default(''),
});
export type BookOutline = z.infer<typeof bookOutlineSchema>;

export const chapterExtractSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  facts: z
    .object({
      characters: z.array(characterSchema).default([]),
      locations: z.array(locationSchema).default([]),
      timeline: z.array(z.string().trim().max(400)).default([]),
      threads: z.array(threadSchema).default([]),
      glossary: z.record(z.string(), z.string()).default({}),
    })
    .default({ characters: [], locations: [], timeline: [], threads: [], glossary: {} }),
});
export type ChapterExtract = z.infer<typeof chapterExtractSchema>;

export const continuityReportSchema = z.object({
  issues: z
    .array(
      z.object({
        type: z.enum(['name', 'age', 'place', 'date', 'fact', 'other']).default('fact'),
        detail: z.string().trim().min(1).max(800),
        chapterNumber: z.number().int().positive().default(1),
        quote: z.string().trim().max(600).optional(),
        fix: z.string().trim().max(800).optional(),
      }),
    )
    .default([]),
});
export type ContinuityReport = z.infer<typeof continuityReportSchema>;

export const bookMetadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).default(''),
  blurb: z.string().trim().min(50).max(3000),
  keywords: z
    .array(z.string().trim().min(1).max(50))
    .min(1)
    .max(7)
    .default([]),
  categories: z.array(z.string().trim().max(120)).max(3).default([]),
  readNext: z.string().trim().max(1200).default(''),
  authorBio: z.string().trim().max(1200).default(''),
  alsoInSeries: z.array(z.string().trim().max(200)).default([]),
});
export type BookMetadata = z.infer<typeof bookMetadataSchema>;

/** "Enhance with AI" on the Create Series form (T2.18). */
export const enhanceResultSchema = z.object({
  concept: z.string().trim().min(100).max(4000),
  titles: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
  tone: z.string().trim().max(120).default(''),
  audience: z.string().trim().max(120).default(''),
});
export type EnhanceResult = z.infer<typeof enhanceResultSchema>;

/** "Add More Parts" (T3.2): extend the series arc with new book premises. */
export const arcExtendSchema = z.object({
  books: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        premise: z.string().trim().min(1).max(1200),
        question: z.string().trim().max(400).default(''),
        cliffhanger: z.string().trim().max(600).default(''),
      }),
    )
    .min(1)
    .max(30),
});
export type ArcExtend = z.infer<typeof arcExtendSchema>;

/** AI suggestions panel on Create Series (T2.20). */
export const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z.enum(['plot', 'character', 'twist', 'title']).default('plot'),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().min(1).max(800),
      }),
    )
    .min(1)
    .max(8),
});
export type Suggestions = z.infer<typeof suggestionsSchema>;

/** Cover art direction for a series (T4.4/T4.5). */
export const coverBriefSchema = z.object({
  artPrompt: z.string().trim().min(20).max(600),
  palette: z.array(z.string().trim().min(1).max(40)).min(2).max(5),
  scene: z.string().trim().min(10).max(600),
  fontFamily: z.enum(['serif', 'sans', 'display']).default('serif'),
});
export type CoverBrief = z.infer<typeof coverBriefSchema>;