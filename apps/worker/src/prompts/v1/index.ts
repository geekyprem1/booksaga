/**
 * Prompt library v1 (T2.10).
 *
 * Layout matters for cost: every prompt puts the *static* block (system + style guide + anti-slop
 * rules) first and the volatile context last, so a provider-side prefix cache can hit across the
 * chapters of one book (ARCH Ãƒâ€šÃ‚Â§5.3).
 *
 * Bump PROMPT_VERSION when the wording changes; it is stored on every generated book.
 */
import type { BookOutline, BookMetadata, Bible, LengthPreset } from '@booksaga/shared';

export const PROMPT_VERSION = 'v1';

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Prompt {
  system: string;
  messages: PromptMessage[];
  maxTokens: number;
  temperature: number;
}

const ANTI_SLOP = [
  'tapestry of', 'testament to', 'delve into', 'in the realm of', 'a shiver ran down',
  'little did they know', 'couldn\'t help but', 'let out a breath they didn\'t know they were holding',
  'the air was thick with', 'a symphony of', 'navigating the complexities',
];

const STYLE_GUIDE = `You are a professional ghostwriter producing commercially viable books for Amazon KDP.

CRAFT RULES
- Concrete over abstract. A specific detail beats three adjectives.
- Vary sentence length; avoid three long sentences in a row.
- Dialogue does work: it reveals character, applies pressure, or moves the plot.
- Every chapter ends on forward motion (a question, a decision, a threat) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never on a moral summary.
- Show the cost of choices. Do not explain the theme to the reader.
- Keep continuity with the supplied bible exactly: names, ages, eye colour, places, dates, injuries.

FORBIDDEN
${ANTI_SLOP.map((p) => `- "${p}"`).join('\n')}
- Em dashes used as a crutch, emoji, markdown headings, bullet lists inside prose, author notes.
- Summarising the previous chapter at the start of a new one.

FORMAT
- Plain prose paragraphs separated by a blank line.
- A scene break is a line containing exactly: * * *
- No chapter title inside the body; the title is supplied separately.
- Dialogue uses double quotes and a new paragraph per speaker.`;

export interface SeriesPlanInput {
  idea: string;
  genre: string;
  isFiction: boolean;
  tone: string;
  audience: string;
  seriesTitle: string;
  penName: string;
  plannedBooks: number;
  lengthPreset: LengthPreset;
}

export function seriesPlanPrompt(input: SeriesPlanInput): Prompt {
  return {
    system: `${STYLE_GUIDE}

TASK: design the foundation of a book SERIES. You return one JSON object matching the SeriesPlan schema:
{ "logline": string, "arc": { "overview": string, "books": [{ "partNumber", "title", "premise", "question", "cliffhanger" }] }, "bible": Bible }

Bible shape:
{ "characters": { "<slug>": { "name", "role", "age", "appearance", "personality", "backstory", "relationships": [], "secrets": [], "status" } },
  "locations": { "<slug>": { "name", "description", "significance" } },
  "world": { "setting", "rules": [], "tone" },
  "timeline": [{ "order", "book", "event" }],
  "threads": [{ "label", "status": "open"|"resolved", "detail" }],
  "glossary": { "<term>": "definition" },
  "style": { "pov", "tense", "voice", "banned": [] },
  "conflicts": [] }

REQUIREMENTS
- Exactly ${input.plannedBooks} books in "arc.books", numbered 1..${input.plannedBooks}.
- Each book premise is 3-4 sentences and states what is newly at risk.
- Each book's cliffhanger must set up the next book, except the last one which closes the arc.
- The bible needs at least 4 named characters with distinct voices, 3 locations, 3 open threads.
- Character and location keys are lowercase slugs (e.g. "mira-vance").
- Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series title: ${input.seriesTitle}`,
          `Author pen name: ${input.penName}`,
          `Genre: ${input.genre} (${input.isFiction ? 'fiction' : 'non-fiction'})`,
          `Tone: ${input.tone}`,
          `Audience: ${input.audience}`,
          `Planned books: ${input.plannedBooks}`,
          `Book length preset: ${input.lengthPreset}`,
          '',
          'Idea from the author:',
          input.idea,
        ].join('\n'),
      },
    ],
    maxTokens: 12000,
    temperature: 0.8,
  };
}

export interface BookOutlineInput {
  seriesTitle: string;
  partNumber: number;
  premise: string;
  lengthPreset: LengthPreset;
  chapters: number;
  wordsPerChapter: number;
  bible: Bible;
  arcOverview: string;
  previousSummaries: string[];
}

export function bookOutlinePrompt(input: BookOutlineInput): Prompt {
  return {
    system: `${STYLE_GUIDE}

TASK: outline one book in an existing series. Return JSON matching BookOutline:
{ "title", "subtitle", "premise", "chapters": [{ "number", "title", "beats": [], "pov", "characters": [], "targetWords" }], "resolution", "cliffhanger" }

REQUIREMENTS
- Exactly ${input.chapters} chapters, numbered 1..${input.chapters}.
- Each chapter: 2-4 beats that escalate; no filler chapters; no two chapters with the same beat.
- The book's own main question must resolve by the final chapter; the cliffhanger sets up the next part.
- Respect the bible's established facts and the previous books' summaries.
- "characters" uses bible keys where possible.
- Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series: ${input.seriesTitle}`,
          `Part: ${input.partNumber}`,
          `Length preset: ${input.lengthPreset} (${input.chapters} chapters, ~${input.wordsPerChapter} words each)`,
          `Series arc: ${input.arcOverview}`,
          input.previousSummaries.length
            ? `Previous parts:\n${input.previousSummaries.map((s, i) => `Part ${i + 1}: ${s}`).join('\n')}`
            : 'This is Part 1.',
          `Book premise: ${input.premise}`,
          '',
          'Series bible:',
          JSON.stringify(input.bible),
        ].join('\n'),
      },
    ],
    maxTokens: 10000,
    temperature: 0.7,
  };
}

export interface ChapterInput {
  seriesTitle: string;
  partNumber: number;
  chapterNumber: number;
  chapterTitle: string;
  beats: string[];
  targetWords: number;
  pov: string;
  tense: string;
  bible: Bible;
  outline: BookOutline;
  previousSummaries: string[];
  previousBookSummaries: string[];
  previousTail: string;
}

export function chapterPrompt(input: ChapterInput): Prompt {
  const compactBible = JSON.stringify(input.bible);
  return {
    system: `${STYLE_GUIDE}

TASK: write one chapter of a novel. Output prose only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no title, no notes, no markdown headings.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series: ${input.seriesTitle} Ãƒâ€šÃ‚Â· Part ${input.partNumber} Ãƒâ€šÃ‚Â· Chapter ${input.chapterNumber}`,
          `Chapter title: ${input.chapterTitle}`,
          `POV: ${input.pov} Ãƒâ€šÃ‚Â· Tense: ${input.tense}`,
          `Target length: ~${input.targetWords} words. Do not stop early; a chapter under ${Math.round(input.targetWords * 0.85)} words is a failure.`,
          `Beats to hit:\n${input.beats.map((b) => `- ${b}`).join('\n')}`,
          '',
          `Book outline (for context only):\n${JSON.stringify(input.outline)}`,
          '',
          input.previousBookSummaries.length
            ? `Earlier books:\n${input.previousBookSummaries.join('\n')}`
            : '',
          input.previousSummaries.length
            ? `Earlier chapters in this book:\n${input.previousSummaries.join('\n')}`
            : 'This is the opening chapter.',
          input.previousTail ? `\nLast lines of the previous chapter:\n${input.previousTail}` : '',
          '',
          `Series bible (canonical facts):\n${compactBible}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    maxTokens: Math.min(16000, Math.round(input.targetWords * 2.2) + 2500),
    temperature: 0.85,
  };
}

export function chapterExtractPrompt(chapterTitle: string, text: string): Prompt {
  return {
    system: `You maintain the continuity bible of a novel series.

TASK: summarise the chapter and extract only NEW or CHANGED facts. Return JSON matching ChapterExtract:
{ "summary": string, "facts": { "characters": [Character], "locations": [Location], "timeline": [string], "threads": [{ "label", "status", "detail" }], "glossary": {} } }

RULES
- summary: 120-180 words, past tense, names every character who acts.
- Only include a character if they are new or something about them changed.
- status: ONE short phrase, max 60 characters (e.g. "alive, hiding in the archive"). Never put plot summary in status.
- Keep every field under 400 characters.
- timeline: events that matter later, one sentence each, in order.
- threads: open a thread when the chapter raises a question; resolve one when it is answered.
- Do not invent facts that are not in the chapter. Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: `Chapter: ${chapterTitle}\n\n${text.slice(0, 60_000)}`,
      },
    ],
    maxTokens: 4000,
    temperature: 0.2,
  };
}

export function continuityPrompt(input: {
  bible: Bible;
  chapterSummaries: { number: number; title: string; summary: string }[];
}): Prompt {
  return {
    system: `You are a continuity editor. Compare the series bible with the chapter summaries and find contradictions only (names, ages, appearance, places, dates, injuries, established facts).

Return JSON matching ContinuityReport: { "issues": [{ "type": "name"|"age"|"place"|"date"|"fact"|"other", "detail", "chapterNumber", "quote", "fix" }] }

RULES
- Report at most 5 issues, most severe first.
- An empty list is a valid and common answer. Do not invent problems.
- Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          'Bible:',
          JSON.stringify(input.bible),
          '',
          'Chapters:',
          input.chapterSummaries.map((c) => `#${c.number} ${c.title}: ${c.summary}`).join('\n'),
        ].join('\n'),
      },
    ],
    maxTokens: 8000,
    temperature: 0.2,
  };
}

export function metadataPrompt(input: {
  seriesTitle: string;
  partNumber: number;
  bookTitle: string;
  genre: string;
  isFiction: boolean;
  penName: string;
  outline: BookOutline;
  bible: Bible;
}): Prompt {
  return {
    system: `You write KDP metadata that converts. Return JSON matching BookMetadata:
{ "title", "subtitle", "blurb", "keywords": [7 strings, each <= 50 chars], "categories": [3 strings], "readNext", "authorBio", "alsoInSeries": [] }

RULES
- Blurb: 150-250 words. Hook in the first sentence, stakes, one line of tension, no spoilers for the ending.
- Keywords: real shopper search phrases, not single words. Each <= 50 characters.
- Categories: KDP-style category paths.
- readNext: 2-3 sentences teasing the next part and containing the literal placeholder {{NEXT_BOOK_URL}}.
- Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series: ${input.seriesTitle} Ãƒâ€šÃ‚Â· Part ${input.partNumber}`,
          `Working title: ${input.bookTitle}`,
          `Genre: ${input.genre} (${input.isFiction ? 'fiction' : 'non-fiction'})`,
          `Pen name: ${input.penName}`,
          '',
          `Outline:\n${JSON.stringify(input.outline)}`,
          '',
          `Bible:\n${JSON.stringify(input.bible)}`,
        ].join('\n'),
      },
    ],
    maxTokens: 5000,
    temperature: 0.7,
  };
}

export function enhancePrompt(input: {
  idea: string;
  genre: string;
  tone: string;
  audience: string;
}): Prompt {
  return {
    system: `You help an author sharpen a book series idea before generating it. Return JSON matching:
{ "concept": string (200-400 words, a rich premise with a protagonist, a pressure, and a hook), "titles": [3 series titles], "tone": string, "audience": string }

RULES
- Keep the author's core idea; make it more specific, not different.
- No spoilers of the ending. No marketing fluff. Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: `Idea: ${input.idea}\nGenre: ${input.genre}\nTone: ${input.tone}\nAudience: ${input.audience}`,
      },
    ],
    maxTokens: 4000,
    temperature: 0.9,
  };
}

export function suggestionsPrompt(input: { idea: string; genre: string }): Prompt {
  return {
    system: `You are a story editor. Return JSON matching:
{ "suggestions": [{ "kind": "plot"|"character"|"twist"|"title", "title", "detail" }] }

Give 3-4 concrete, usable suggestions for THIS idea. No generic advice. Return JSON only.`,
    messages: [{ role: 'user', content: `Idea: ${input.idea}\nGenre: ${input.genre}` }],
    maxTokens: 8000,
    temperature: 0.9,
  };
}

export function paragraphFixPrompt(input: {
  paragraph: string;
  issue: string;
  bible: Bible;
}): Prompt {
  return {
    system: `${STYLE_GUIDE}

TASK: rewrite ONE paragraph so it matches the bible. Keep the same events, POV and approximate length. Output the rewritten paragraph only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Problem: ${input.issue}`,
          '',
          `Paragraph:\n${input.paragraph}`,
          '',
          `Canonical facts:\n${JSON.stringify(input.bible)}`,
        ].join('\n'),
      },
    ],
    maxTokens: 6000,
    temperature: 0.5,
  };
}

export function rewritePrompt(input: {
  text: string;
  instruction: string;
  context?: string;
}): Prompt {
  return {
    system: `${STYLE_GUIDE}

TASK: rewrite the supplied passage following the author's instruction. Preserve facts and POV. Output prose only.`,
    messages: [
      {
        role: 'user',
        content: [
          input.context ? `Context:\n${input.context}\n` : '',
          `Instruction: ${input.instruction}`,
          '',
          input.text,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    maxTokens: 8000,
    temperature: 0.8,
  };
}

export interface ArcExtendInput {
  seriesTitle: string;
  genre: string;
  isFiction: boolean;
  arcOverview: string;
  existingParts: { partNumber: number; title: string; premise: string }[];
  fromPart: number;
  count: number;
  bible: Bible;
}

/** "Add More Parts" (T3.2): continue the arc past the parts the author planned. */
export function arcExtendPrompt(input: ArcExtendInput): Prompt {
  return {
    system: `${STYLE_GUIDE}

TASK: extend an existing series with ${input.count} more book premises. Return JSON matching:
{ "books": [{ "title", "premise", "question", "cliffhanger" }] }

REQUIREMENTS
- Exactly ${input.count} books, continuing from Part ${input.fromPart}.
- Each premise is 3-4 sentences, escalates the existing arc, and does not repeat an earlier premise.
- The last cliffhanger should open a new thread rather than close the series.
- Respect every established fact in the bible.
- Return JSON only.`,
    messages: [
      {
        role: 'user',
        content: [
          `Series: ${input.seriesTitle} (${input.genre}, ${input.isFiction ? 'fiction' : 'non-fiction'})`,
          `Arc so far: ${input.arcOverview}`,
          '',
          'Existing parts:',
          input.existingParts
            .map((p) => `Part ${p.partNumber} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${p.title}: ${p.premise}`)
            .join('\n'),
          '',
          'Bible:',
          JSON.stringify(input.bible),
        ].join('\n'),
      },
    ],
    maxTokens: 6000,
    temperature: 0.8,
  };
}

export type { BookMetadata };
