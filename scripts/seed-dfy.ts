/**
 * Seed the Done-For-You library (T6.7): 20 niches × 25 series ideas = 500, plus one keyword/blurb
 * pack per genre. Idempotent by slug.
 *
 *   pnpm tsx scripts/seed-dfy.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const NICHES: { niche: string; genre: string; heroes: string[]; hooks: string[] }[] = [
  { niche: 'Vampire Romance', genre: 'Paranormal Romance', heroes: ['vampire lord', 'blood-bound knight', 'night court prince', 'undying surgeon'], hooks: ['a blood debt', 'a forbidden bond', 'a city that never sees dawn', 'an ancient oath'] },
  { niche: 'Wolf Shifter', genre: 'Paranormal Romance', heroes: ['alpha outcast', 'lone wolf', 'pack healer', 'rival alpha'], hooks: ['a mating bond', 'a territory war', 'a moon curse', 'a pack betrayal'] },
  { niche: 'Fae Court', genre: 'Fantasy Romance', heroes: ['seelie spy', 'unseelie prince', 'bargain-maker', 'thornsinger'], hooks: ['a faerie bargain', 'a stolen name', 'a court of lies', 'a tithe of years'] },
  { niche: 'Dark Academia', genre: 'Dark Academia', heroes: ['scholarship student', 'rival scholar', 'secret society heir', 'disgraced professor'], hooks: ['a locked archive', 'a dead classmate', 'a forbidden thesis', 'a campus cult'] },
  { niche: 'Mafia Romance', genre: 'Romantic Suspense', heroes: ['capo', 'consigliere', 'enforcer', 'rival heir'], hooks: ['an arranged marriage', 'a blood contract', 'a witness to protect', 'a family debt'] },
  { niche: 'Alien Romance', genre: 'Sci-Fi Romance', heroes: ['stranded pilot', 'alien commander', 'xeno-linguist', 'colony medic'], hooks: ['a first-contact pact', 'a broken translator', 'a shared oxygen supply', 'a forbidden signal'] },
  { niche: 'Monster Romance', genre: 'Paranormal Romance', heroes: ['cursed gardener', 'stitched soldier', 'lake dweller', 'storm keeper'], hooks: ['a village sacrifice', 'a monster bargain', 'a haunted manor', 'a curse to break'] },
  { niche: 'Reverse Harem', genre: 'Romance', heroes: ['four brothers', 'rival guild', 'royal guard', 'childhood friends'], hooks: ['a shared inheritance', 'a trial of worth', 'a single winter', 'a pact with four'] },
  { niche: 'Billionaire', genre: 'Contemporary Romance', heroes: ['tech founder', 'hotel heir', 'venture capitalist', 'reclusive author'], hooks: ['a fake engagement', 'a merger clause', 'a NDA romance', 'a small-town buyout'] },
  { niche: 'Small Town', genre: 'Contemporary Romance', heroes: ['firefighter', 'veterinarian', 'baker', 'single dad'], hooks: ['a returning ex', 'a storm season', 'a shared business', 'a town secret'] },
  { niche: 'Second Chance', genre: 'Contemporary Romance', heroes: ['first love', 'widowed architect', 'country singer', 'ER nurse'], hooks: ['a wedding invitation', 'a decade apart', 'a letter never sent', 'a reunion tour'] },
  { niche: 'Romantic Suspense', genre: 'Romantic Suspense', heroes: ['bodyguard', 'FBI analyst', 'forensic artist', 'undercover agent'], hooks: ['a stalker', 'a witness protection', 'a cold case reopened', 'a false identity'] },
  { niche: 'Cozy Witch', genre: 'Cozy Mystery', heroes: ['tea-shop witch', 'hedge witch', 'retired familiar', 'coven librarian'], hooks: ['a cursed bake sale', 'a missing spellbook', 'a poisoned potion', 'a talking cat'] },
  { niche: 'Culinary Cozy', genre: 'Cozy Mystery', heroes: ['food truck owner', 'pastry chef', 'soup kitchen volunteer', 'wine buyer'], hooks: ['a poisoned dish', 'a rival chef', 'a stolen recipe', 'a food festival'] },
  { niche: 'Bookshop Mystery', genre: 'Cozy Mystery', heroes: ['bookshop owner', 'rare book dealer', 'library volunteer', 'book club host'], hooks: ['a forged first edition', 'a dead author', 'a hidden manuscript', 'a missing patron'] },
  { niche: 'Space Opera', genre: 'Science Fiction', heroes: ['smuggler captain', 'fleet deserter', 'diplomat', 'salvage pilot'], hooks: ['a stolen dreadnought', 'a dying empire', 'a treaty breach', 'a jump route secret'] },
  { niche: 'Cyberpunk', genre: 'Science Fiction', heroes: ['street samurai', 'data broker', 'ripperdoc', 'corporate whistleblower'], hooks: ['a stolen identity', 'a citywide blackout', 'a memory heist', 'an AI uprising'] },
  { niche: 'LitRPG', genre: 'LitRPG', heroes: ['level-zero player', 'NPC with a glitch', 'guild strategist', 'tank main'], hooks: ['a broken patch', 'a permadeath server', 'a hidden quest line', 'a guild betrayal'] },
  { niche: 'Epic Fantasy', genre: 'Fantasy', heroes: ['oathbreaker knight', 'runaway heir', 'stormcaller', 'archive thief'], hooks: ['a fallen god', 'a broken oath', 'a stolen crown', 'a prophecy rewritten'] },
  { niche: 'Historical Romance', genre: 'Historical Romance', heroes: ['naval captain', 'duke in hiding', 'widowed countess', 'stablemaster'], hooks: ['a scandal sheet', 'a marriage of convenience', 'a season in Bath', 'a shipwreck'] },
];

const TITLES = [
  'The Last {noun}', 'A Court of {noun}', 'The {adj} {noun}', '{noun} of Ash', 'The {noun} Keeper',
  'Beneath the {noun}', 'The {adj} Bargain', 'Every {noun} a Promise', 'The {noun} Between Us',
  'Where the {noun} Ends', 'The {adj} Inheritance', 'A Season of {noun}', 'The {noun} Problem',
  'No One Owns a {noun}', 'The {adj} Truth About {noun}', 'The {noun} Club', 'The {adj} Hour',
  'The {noun} That Waited', 'One {adj} Summer', 'The {noun} Ledger', 'A Very {adj} {noun}',
  'The {noun} War', 'The {adj} Deal', 'The {noun} Arrangement', 'The {adj} Ruin of {noun}',
];

const NOUNS = ['Lantern', 'Tide', 'Crown', 'Garden', 'Ledger', 'Oath', 'Harbour', 'Winter', 'Hollow', 'Ember'];
const ADJS = ['Quiet', 'Broken', 'Borrowed', 'Hidden', 'Golden', 'Bitter', 'Restless', 'Last', 'Secret', 'Patient'];

function titleFor(nicheIndex: number, ideaIndex: number): string {
  const template = TITLES[ideaIndex % TITLES.length]!;
  const noun = NOUNS[(nicheIndex + ideaIndex) % NOUNS.length]!;
  const adj = ADJS[(nicheIndex * 3 + ideaIndex) % ADJS.length]!;
  return template.replace('{noun}', noun).replace('{adj}', adj);
}

async function main() {
  let ideas = 0;
  let skipped = 0;

  for (const [nicheIndex, entry] of NICHES.entries()) {
    for (let ideaIndex = 0; ideaIndex < 25; ideaIndex++) {
      const title = titleFor(nicheIndex, ideaIndex);
      const slug = `${slugify(entry.niche)}-${slugify(title)}`;

      const { data: existing } = await db.from('dfy_ideas').select('id').eq('slug', slug).maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }

      const hero = entry.heroes[ideaIndex % entry.heroes.length]!;
      const hook = entry.hooks[(ideaIndex * 3) % entry.hooks.length]!;

      const { error } = await db.from('dfy_ideas').insert({
        slug,
        niche: entry.niche,
        title,
        premise: `A ${hero} is bound by ${hook} and has one season to break it before the whole town pays the price.`,
        hook: `Reader promise: ${hook}, slow-burn tension, and a choice that costs everything.`,
        keywords: [entry.niche.toLowerCase(), entry.genre.toLowerCase(), 'series starter'],
        tier: ideaIndex < 8 ? 'lite' : 'full',
        sort_order: ideaIndex,
      });

      if (error) {
        console.error(`[seed-dfy] idea failed ${slug}: ${error.message}`);
        continue;
      }
      ideas += 1;
    }
    if ((nicheIndex + 1) % 5 === 0) console.log(`[seed-dfy] ${ideas} ideas…`);
  }

  let packs = 0;
  for (const [index, entry] of NICHES.entries()) {
    const slug = `${slugify(entry.genre)}-pack`;
    const { data: existing } = await db.from('dfy_packs').select('id').eq('slug', slug).maybeSingle();
    if (existing) continue;

    const { error } = await db.from('dfy_packs').insert({
      slug,
      title: `${entry.genre} keyword pack`,
      description: `Seven keywords, three categories and five blurb openers tuned for ${entry.genre}.`,
      genre: entry.genre,
      contents: {
        keywords: [
          `${entry.genre.toLowerCase()} series`,
          `${entry.niche.toLowerCase()} romance`,
          'book tok picks',
          'slow burn',
          'forced proximity',
          'found family',
          'series starter',
        ],
        categories: [entry.genre, 'Fiction > Romance', 'Fiction > Series'],
        blurbs: [
          `Some doors only open once. This one opened for her.`,
          `He promised one season. She needed a lifetime.`,
          `Every family keeps one secret too many.`,
          `The town forgave him years ago. She never did.`,
          `The last thing she expected was to stay.`,
        ],
      },
      tier: index < 6 ? 'lite' : 'full',
      sort_order: index,
    });

    if (error) {
      console.error(`[seed-dfy] pack failed ${slug}: ${error.message}`);
      continue;
    }
    packs += 1;
  }

  console.log(`[seed-dfy] done — ideas ${ideas} (skipped ${skipped}), packs ${packs}`);
}

await main();
