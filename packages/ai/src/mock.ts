/**
 * Deterministic mock provider (T2.5). `AI_MODE=mock` runs the whole pipeline with zero network and
 * zero cost: fixtures are derived from a hash of the prompt, so a re-run produces the same book.
 *
 * The shapes must match `packages/shared/src/schemas/ai.ts` — a mismatch shows up immediately as a
 * schema error, which is exactly the safety net the repair loop would exercise in live mode.
 */
import type { MockHints, TextRequest, TextResult } from './types';

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLE_WORDS = [
  'Ember', 'Crown', 'Hollow', 'Tide', 'Ash', 'Lantern', 'Vow', 'Storm', 'Glass', 'Thorn',
  'Midnight', 'Iron', 'Wild', 'Silent', 'Broken', 'Golden', 'Frost', 'Echo', 'Crimson', 'Veil',
];
const TITLE_NOUNS = [
  'Kingdom', 'Archive', 'Garden', 'Machine', 'River', 'Prophecy', 'Ledger', 'Compass',
  'Orchard', 'Covenant', 'Harbor', 'Labyrinth', 'Chorus', 'Harvest', 'Signal', 'Bridge',
];

function titleFrom(rand: () => number): string {
  const a = TITLE_WORDS[Math.floor(rand() * TITLE_WORDS.length)] ?? 'Ember';
  const b = TITLE_NOUNS[Math.floor(rand() * TITLE_NOUNS.length)] ?? 'Kingdom';
  return `The ${a} ${b}`;
}

const CHARACTER_NAMES = [
  'Mira Vance', 'Dorian Hale', 'Sable Quinn', 'Ilya Rook', 'Nadia Cole', 'Tomas Reed',
  'Wren Adair', 'Cass Merrow', 'Oren Pike', 'Lena Frost',
];

const SENTENCES = [
  'The road narrowed where the pines closed in, and the wind carried the smell of wet stone.',
  'She counted the windows twice, but the third one was still dark.',
  'He had learned long ago that a promise is only as good as the person who can afford to keep it.',
  'Rain moved across the valley in slow grey sheets, erasing the far hills one by one.',
  'The letter had no signature, only a pressed leaf folded into the crease.',
  'Nobody in the market would meet her eyes, which told her everything she needed to know.',
  'A bell rang somewhere below the cliff, thin and patient, like a reminder no one wanted.',
  'The door opened before he knocked, and the man behind it was already wearing his coat.',
  'They walked until the lantern guttered, then walked a little further out of stubbornness.',
  'Every family keeps one story it tells in whispers and one it refuses to tell at all.',
  'The map was wrong about the river, which meant it was probably wrong about everything else.',
  'She set the cup down carefully, as though the table might take offence.',
  'There is a particular silence that follows a lie, and they both sat inside it for a while.',
  'The horses would not cross the bridge, so they led them through the shallows instead.',
  'He remembered the smell of the workshop: oil, sawdust, and something faintly sweet.',
  'By morning the snow had filled the tracks, and the search became a formality.',
  'The magistrate listened without interrupting, which was somehow worse than shouting.',
  'She had rehearsed the words for three days and forgot all of them at the threshold.',
  'Somewhere in the house a clock disagreed with another clock, and neither would concede.',
  'The fire had taken the east wing but left the portrait, which everyone found funny and no one said so.',
  'He counted the coins into three piles, then swept one pile back into the purse.',
  'The child asked the question twice, and the second time nobody had an answer ready.',
  'Beyond the wall the fields were already gold, though the season had barely turned.',
  'A gull landed on the mast and stayed there through the whole argument, unimpressed.',
  'The archive smelled of dust and vinegar, and the archivist apologised for neither.',
  'They had agreed to meet at noon, which in that town meant whenever the bell felt like it.',
  'Her hands were steady until the moment the seal broke, and then they were not.',
  'The road forked at a stone marker worn smooth by a century of hesitant travellers.',
  'He said he was not afraid, and the way he said it made it true for everyone else.',
  'The tide came in faster than the story, and the story had been going for hours.',
];

/** Deterministic prose of roughly `words` words, with one scene break. */
function prose(rand: () => number, words: number): string {
  const paragraphs: string[] = [];
  let written = 0;
  let index = 0;
  const target = Math.max(200, words);

  while (written < target) {
    const sentences: string[] = [];
    const length = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < length; i++) {
      const sentence = SENTENCES[(index + Math.floor(rand() * SENTENCES.length)) % SENTENCES.length];
      if (sentence) sentences.push(sentence);
      index++;
    }
    const paragraph = sentences.join(' ');
    paragraphs.push(paragraph);
    written += paragraph.split(/\s+/).length;

    // A scene break roughly in the middle keeps the markdown -> TipTap converter exercised.
    if (written > target / 2 && !paragraphs.includes('* * *')) paragraphs.push('* * *');
  }
  return paragraphs.join('\n\n');
}

function seriesPlan(hints: MockHints, rand: () => number) {
  const books = Math.min(Math.max(hints.books ?? 5, 1), 30);
  const seriesTitle = hints.seriesTitle?.trim() || titleFrom(rand);
  const hero = CHARACTER_NAMES[Math.floor(rand() * CHARACTER_NAMES.length)] ?? 'Mira Vance';
  const rival = CHARACTER_NAMES[Math.floor(rand() * CHARACTER_NAMES.length)] ?? 'Dorian Hale';

  return {
    logline: `${hero} inherits a debt that can only be paid in secrets, and every answer opens a worse door.`,
    arc: {
      overview: `${seriesTitle} follows ${hero} from reluctant inheritor to the person who has to decide what the truth is worth. Each book closes one question and opens a larger one, until the final choice costs the thing the hero swore to protect.`,
      books: Array.from({ length: books }, (_, i) => ({
        partNumber: i + 1,
        title: titleFrom(rand),
        premise: `Part ${i + 1}: ${hero} is pushed one step further from the life they planned, and the cost of turning back doubles.`,
        question: `Can ${hero} keep the promise made in part ${Math.max(i, 1)} without becoming the thing they are running from?`,
        cliffhanger: `A witness who should be dead leaves a message that only ${rival} can read.`,
      })),
    },
    bible: {
      characters: {
        [hero.toLowerCase().replace(/\s+/g, '-')]: {
          name: hero,
          role: 'protagonist',
          age: '34',
          appearance: 'Tall, weathered hands, a coat that has outlived two winters.',
          personality: 'Patient with strangers, ruthless with herself.',
          backstory: 'Left home at seventeen and has been paying for it ever since.',
          relationships: [`rival: ${rival}`],
          secrets: ['Signed a document she never read.'],
          status: 'active',
        },
        [rival.toLowerCase().replace(/\s+/g, '-')]: {
          name: rival,
          role: 'antagonist',
          age: '41',
          appearance: 'Immaculate, tired eyes, always the same grey gloves.',
          personality: 'Charming in rooms, cold in corridors.',
          backstory: 'Built an empire out of other people’s mistakes.',
          relationships: [`protagonist: ${hero}`],
          secrets: ['Keeps a second set of ledgers.'],
          status: 'active',
        },
      },
      locations: {
        'the-quay': {
          name: 'The Quay',
          description: 'A working harbour where the tide decides the schedule and nobody asks questions.',
          significance: 'Where the first bargain was struck.',
        },
        'the-archive': {
          name: 'The Archive',
          description: 'A warehouse of paper that officially burned down nine years ago.',
          significance: 'Holds the proof everyone wants destroyed.',
        },
      },
      world: {
        setting: 'A harbour city run by guilds that tax memory as much as cargo.',
        rules: [
          'Every contract must be witnessed by two people who are not related.',
          'Debts pass to the next of kin unless publicly refused within a year.',
        ],
        tone: 'Grounded, tense, quietly hopeful.',
      },
      timeline: [
        { order: 1, book: 1, event: 'The inheritance is read aloud in the guild hall.' },
        { order: 2, book: 1, event: 'The archive is reopened under guard.' },
      ],
      threads: [
        { label: 'Who signed the original contract', status: 'open', detail: 'The signature is in a hand nobody recognises.' },
        { label: 'The missing witness', status: 'open', detail: 'Declared dead, still sending letters.' },
      ],
      glossary: { 'quay-tithe': 'A fee paid in labour rather than coin.' },
      style: { pov: 'third', tense: 'past', voice: 'Close third person, dry humour, no melodrama.', banned: [] },
      conflicts: [],
    },
  };
}

function bookOutline(hints: MockHints, rand: () => number) {
  const chapters = Math.min(Math.max(hints.chapters ?? 15, 3), 40);
  const words = hints.words ?? 1700;
  return {
    title: titleFrom(rand),
    subtitle: `Book ${hints.part ?? 1}`,
    premise: 'A debt comes due and the only way to pay it is to reopen a case the city buried.',
    chapters: Array.from({ length: chapters }, (_, i) => ({
      number: i + 1,
      title: `Chapter ${i + 1}: ${titleFrom(rand)}`,
      beats: [
        'Open on a concrete problem, not a summary of the last chapter.',
        'Escalate with one new obstacle the protagonist cannot buy their way out of.',
        'Close on a decision that makes the next chapter necessary.',
      ],
      characters: ['protagonist'],
      targetWords: words,
    })),
    resolution: 'The immediate debt is settled, but the settlement names a larger creditor.',
    cliffhanger: 'A letter arrives with tomorrow’s date on it.',
  };
}

const ROLES = ['witness', 'rival', 'ally', 'informant', 'official'];
const LOOKS = [
  'Narrow face, ink-stained fingers.',
  'Broad shoulders, a scar through one eyebrow.',
  'Grey braid, rings on every finger.',
  'Young, sunburnt, always slightly out of breath.',
  'Immaculate coat, worn boots.',
];
const TRAITS = [
  'Careful, evasive, kind to strangers.',
  'Blunt to the point of rudeness, and usually right.',
  'Charming in company, calculating alone.',
  'Anxious, meticulous, surprisingly brave.',
  'Patient, watchful, slow to forgive.',
];

function chapterExtract(rand: () => number) {
  const name = CHARACTER_NAMES[Math.floor(rand() * CHARACTER_NAMES.length)] ?? 'Mira Vance';
  const pick = <T,>(list: T[], fallback: T): T => list[Math.floor(rand() * list.length)] ?? fallback;
  return {
    summary: `The protagonist follows a lead to the harbour and learns that the witness is alive, but the meeting is a trap. ${name} escapes with a torn page that names a second creditor.`,
    facts: {
      characters: [
        {
          name,
          role: pick(ROLES, 'witness'),
          appearance: pick(LOOKS, LOOKS[0] as string),
          personality: pick(TRAITS, TRAITS[0] as string),
          relationships: [],
          secrets: ['Has been copying the ledgers for years.'],
          status: 'active',
        },
      ],
      locations: [
        { name: 'The Quay', description: 'Fog, ropes, a locked boathouse.', significance: 'Meeting point.' },
      ],
      timeline: ['The witness is confirmed alive.'],
      threads: [{ label: 'Second creditor', status: 'open', detail: 'Named on the torn page.' }],
      glossary: { 'torn-page': 'Half of a contract, still legally binding.' },
    },
  };
}

function metadata(hints: MockHints, rand: () => number) {
  const title = titleFrom(rand);
  return {
    title,
    subtitle: `Book ${hints.part ?? 1} of ${hints.seriesTitle ?? 'the series'}`,
    blurb:
      'One signature. Two witnesses. Nine years of silence. When the debt is finally called in, the only person who can prove what really happened is the one everyone believes is dead. ' +
      'A slow-burn mystery about inheritance, paperwork, and the people who mistake loyalty for leverage. Perfect for readers who like their twists earned and their heroes tired.',
    keywords: [
      'harbor city mystery',
      'inheritance thriller',
      'slow burn suspense',
      'family secret novel',
      'guild fantasy',
      'amateur sleuth series',
      'book club fiction',
    ],
    categories: ['Mystery, Thriller & Suspense', 'Fantasy', 'Literature & Fiction'],
    readNext:
      'The story continues in the next part. Replace {{NEXT_BOOK_URL}} with your book’s Amazon link before uploading.',
    authorBio: 'The author writes quiet, tense stories about people who should have asked more questions.',
    alsoInSeries: [`Book ${Math.max((hints.part ?? 1) - 1, 1)}`, `Book ${(hints.part ?? 1) + 1}`],
  };
}

function enhance() {
  return {
    concept:
      'A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her estranged niece inherits a ledger that proves half the city’s founding families bought their reputations. ' +
      'The catch: the ledger is legally a confession, and whoever holds it is liable for the fraud inside. She has one season to decide whether to burn it, sell it, or read it out loud in the guild hall.',
    titles: ['The Ledger of Small Debts', 'A Debt of Salt', 'The Quiet Creditor'],
    tone: 'Engaging & Cinematic',
    audience: 'Adults',
  };
}

function suggestions() {
  return {
    suggestions: [
      { kind: 'plot', title: 'Make the debt physical', detail: 'The protagonist must pay in labour at the harbour, which puts her inside the world she is investigating.' },
      { kind: 'character', title: 'A rival who is right', detail: 'The antagonist’s position should be defensible: burning the ledger protects three hundred jobs.' },
      { kind: 'twist', title: 'The witness signed it too', detail: 'The person who could clear the protagonist is also on the document, which raises the stakes of trusting them.' },
    ],
  };
}

export function mockComplete(req: TextRequest & { json?: boolean }): TextResult {
  const seed = hashString(
    `${req.usage.purpose}|${req.messages.map((m) => m.content).join('|').slice(0, 2000)}`,
  );
  const rand = mulberry32(seed);
  const hints = req.mock ?? {};

  let output: string;
  switch (req.usage.purpose) {
    case 'series_plan':
      output = JSON.stringify(seriesPlan(hints, rand));
      break;
    case 'book_outline':
      output = JSON.stringify(bookOutline(hints, rand));
      break;
    case 'chapter_extract':
      output = JSON.stringify(chapterExtract(rand));
      break;
    case 'continuity':
      output = JSON.stringify({ issues: [] });
      break;
    case 'metadata':
      output = JSON.stringify(metadata(hints, rand));
      break;
    case 'enhance':
      output = JSON.stringify(enhance());
      break;
    case 'suggestions':
      output = JSON.stringify(suggestions());
      break;
    case 'arc_extend': {
      const count = Math.max(1, Math.min(hints.books ?? 2, 10));
      output = JSON.stringify({
        books: Array.from({ length: count }, (_, i) => ({
          title: titleFrom(rand),
          premise: `Part ${(hints.part ?? 1) + i}: the debt is called in from a direction nobody was watching, and the cost of refusing doubles again.`,
          question: 'Who pays for the truth this time?',
          cliffhanger: 'A name appears on the ledger that should not exist.',
        })),
      });
      break;
    }
    case 'chapter':
    case 'rewrite':
    default:
      output = prose(rand, hints.words ?? 1300);
      break;
  }

  const inputChars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  return {
    text: output,
    inputTokens: Math.ceil(inputChars / 4),
    cachedInputTokens: 0,
    outputTokens: Math.ceil(output.length / 4),
    // Mock calls never cost money — that is the point of AI_MODE=mock.
    costUsd: 0,
    model: 'mock',
  };
}
