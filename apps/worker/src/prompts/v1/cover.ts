/**
 * Cover prompts (T4.4/T4.5).
 *
 * The first cover of a series also produces the **series cover style** (art direction + palette +
 * font), which is stored on `series.cover_style` and reused by every later part so the shelf looks
 * like one set. Each book only changes the scene.
 */
import type { Bible, BookMetadata } from '@booksaga/shared';
import type { Prompt } from './index';

export interface CoverBriefInput {
  seriesTitle: string;
  genre: string;
  tone: string;
  isFiction: boolean;
  partNumber: number;
  bookTitle: string;
  premise: string;
  bible: Bible;
}

export interface CoverBrief {
  artPrompt: string;
  palette: string[];
  scene: string;
  fontFamily: 'serif' | 'sans' | 'display';
}

/** One cheap structured call that decides the series' visual identity. */
export function coverBriefPrompt(input: CoverBriefInput): Prompt {
  return {
    system: `You art-direct book covers for Amazon KDP. Return JSON matching:
{ "artPrompt": string, "palette": [3-4 colour words], "scene": string, "fontFamily": string }

RULES
- artPrompt: a reusable art-direction sentence for the whole series (medium, lighting, texture, composition). No book-specific content.
- palette: 3-4 evocative colour names that fit the genre and tone.
- scene: ONE concrete visual scene for THIS book Ã¢â‚¬â€ a place and a figure or object, no plot summary, no text.
- fontFamily: one of "serif" | "sans" | "display".
- Never include text, letters, titles or logos in any field. Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series: ${input.seriesTitle} (${input.genre}, ${input.isFiction ? 'fiction' : 'non-fiction'})`,
          `Tone: ${input.tone}`,
          `Book ${input.partNumber}: ${input.bookTitle}`,
          `Premise: ${input.premise}`,
          '',
          `Cast (for visual reference): ${Object.values(input.bible.characters ?? {})
            .slice(0, 4)
            .map((c) => `${c.name} (${c.role})`)
            .join(', ')}`,
          `Setting: ${input.bible.world?.setting ?? ''}`,
        ].join('\n'),
      },
    ],
    maxTokens: 1200,
    temperature: 0.8,
  };
}

/** The actual image prompt: series art direction + this book's scene + hard "no text" rules. */
export function coverImagePrompt(input: {
  artPrompt: string;
  palette: string[];
  scene: string;
  genre: string;
  title: string;
  author: string;
}): string {
  return [
    input.scene,
    '',
    input.artPrompt,
    '',
    `Colour palette: ${input.palette.join(', ')}.`,
    `Genre: ${input.genre}.`,
    'Portrait book cover artwork, cinematic lighting, rich texture, high detail, professional illustration.',
    'Composition: single clear subject, generous negative space at the top and bottom for a title and author name later.',
    'ABSOLUTELY NO text, no letters, no words, no typography, no logos, no watermarks, no borders.',
  ].join('\n');
}

/** Fallback when the model returns something unusable. */
export function fallbackBrief(input: CoverBriefInput): CoverBrief {
  return {
    artPrompt: `Moody ${input.genre.toLowerCase()} cover art, painterly digital illustration, dramatic light, atmospheric depth.`,
    palette: ['deep teal', 'amber', 'charcoal'],
    scene: `A lone figure standing at the edge of ${input.bible.world?.setting || 'a windswept harbour'}, seen from behind.`,
    fontFamily: 'serif',
  };
}

export type { BookMetadata };
