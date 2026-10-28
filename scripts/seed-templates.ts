/**
 * Seed the Series Templates library (T6.6).
 *
 * Default: 12 categories × 10 templates. --starter: 10 curated, complete lite templates.
 * Idempotent by slug and AI-text cover path. Legacy engine-lettered covers are replaced in place.
 *
 *   pnpm tsx scripts/seed-templates.ts [--starter | --covers=false]
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createAi } from '@booksaga/ai';
import sharp from 'sharp';

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

const ai = createAi({
  mode: (env.AI_MODE as 'mock' | 'live') ?? 'mock',
  baseUrl: env.TEXT_API_BASE_URL || undefined,
  model: env.TEXT_MODEL || 'mock',
  apiKey: env.TEXT_API_KEY,
  replicateToken: env.REPLICATE_API_TOKEN,
  imageModel: env.REPLICATE_IMAGE_MODEL || 'openai/gpt-image-2',
  db: undefined,
});

const withCovers = !process.argv.includes('--covers=false');
const starterMode = process.argv.includes('--starter');

interface Entry {
  title: string;
  premise: string;
  tone: string;
}

interface StarterEntry extends Entry {
  category: string;
  genre: string;
  audience: string;
  length_preset: 'short' | 'standard';
  planned_books: 3 | 4 | 5;
  keywords: string[];
  cover_prompt: string;
  cover_font: 'display' | 'serif' | 'sans';
}

const CATALOG: Record<string, { genre: string; audience: string; entries: Entry[] }> = {
  fantasy: {
    genre: 'Fantasy',
    audience: 'adult',
    entries: [
      { title: 'The Ledger of Small Debts', premise: 'A harbour city where debts are inherited like weather, and one clerk discovers who really owns the city.', tone: 'dark, lyrical' },
      { title: 'The Salt Cartographer', premise: 'A mapmaker who can only draw places that no longer exist is hired to chart a kingdom that has not fallen yet.', tone: 'wonder, melancholy' },
      { title: 'Nine Doors to Hallow', premise: 'Every winter the town grows a door that opens onto a different year, and this year it opened early.', tone: 'eerie, warm' },
      { title: 'The Bell That Remembers', premise: 'A bellringer hears the last words of everyone it has ever rung for, and one of those voices is her own.', tone: 'gothic' },
      { title: 'Ashwright', premise: 'A smith who forges weapons from grief is asked to make the blade that will end a war she started.', tone: 'grim, heroic' },
      { title: 'The Orchard at the End of the World', premise: 'The last orchard grows fruit that shows you the life you did not choose, and the harvest is coming due.', tone: 'gentle apocalypse' },
      { title: 'Crown of Borrowed Names', premise: 'A stablehand wakes wearing the face of a dead prince and must keep the lie long enough to save the kingdom.', tone: 'political' },
      { title: 'The Wound in the Sky', premise: 'A tear in the sky leaks someone else’s memories, and only the village liar can read them.', tone: 'surreal' },
      { title: 'Ironwood Covenant', premise: 'The forest lends its strength to the village each winter, and this year it wants something back.', tone: 'folk horror' },
      { title: 'The Last Cartomancer', premise: 'Every card in her deck predicts a death except one, and the blank card has started appearing in other people’s hands.', tone: 'mystery' },
    ],
  },
  'dark-fantasy': {
    genre: 'Dark Fantasy',
    audience: 'adult',
    entries: [
      { title: 'The Saint of Small Cruelties', premise: 'A disgraced inquisitor hunts a miracle worker whose healings always cost someone else their life.', tone: 'brutal' },
      { title: 'Bone Tithe', premise: 'Every tenth child belongs to the god beneath the city, and the god has started collecting early.', tone: 'bleak' },
      { title: 'The Hollow Choir', premise: 'A choir of the dead sings the names of the living, and whoever hears their own name has one week.', tone: 'horror' },
      { title: 'Gallows Garden', premise: 'A gravedigger grows flowers from the executed, and the flowers are beginning to talk.', tone: 'macabre' },
      { title: 'The Rust Saint', premise: 'A plague of rust eats iron and memory alike, and one knight remembers what the world used to be.', tone: 'apocalyptic' },
      { title: 'Carrion Crown', premise: 'Whoever wears the crown of crows rules the dead, and the current wearer wants to abdicate.', tone: 'dark political' },
      { title: 'The Widow’s War', premise: 'A general’s widow raises an army of the soldiers he sent to die, and they remember exactly who ordered it.', tone: 'revenge' },
      { title: 'Feast of the Unnamed', premise: 'Once a year the village feeds the thing in the lake a name, and this year they fed it hers.', tone: 'folk horror' },
      { title: 'The Penitent Blade', premise: 'A sword that refuses to kill the innocent is passed from murderer to murderer, waiting for one who will listen.', tone: 'sombre' },
      { title: 'Under the Black Bell', premise: 'When the black bell rings, the city forgets a person entirely, and today it rang twice.', tone: 'dread' },
    ],
  },
  romance: {
    genre: 'Romance',
    audience: 'adult',
    entries: [
      { title: 'The Long Way to Harbour Street', premise: 'A chef returns to the town that ruined her reputation and finds the man who believed her still running the bakery.', tone: 'warm, second chance' },
      { title: 'Two Weeks in the Rain', premise: 'A storm traps a wedding planner and the groom’s best friend in a hotel with one room left.', tone: 'sparky' },
      { title: 'The Bookshop Rule', premise: 'The bookshop has one rule: never fall for the customer who reads the last page first.', tone: 'cosy' },
      { title: 'Letters I Never Sent', premise: 'She finds a box of letters her grandmother wrote to a man nobody in the family has ever mentioned.', tone: 'bittersweet' },
      { title: 'Off-Season', premise: 'A burnt-out surgeon takes a winter job at a ski lodge and butts heads with the man who owns the mountain.', tone: 'slow burn' },
      { title: 'The Understudy', premise: 'She finally gets the lead role the same week her ex is cast opposite her.', tone: 'theatre, banter' },
      { title: 'A Season of Small Yeses', premise: 'Two strangers agree to say yes to every invitation for one summer, and then to each other.', tone: 'playful' },
      { title: 'The Lighthouse Keeper’s Daughter', premise: 'She comes home to sell the lighthouse and finds a man restoring it against her wishes.', tone: 'emotional' },
      { title: 'Room for One More', premise: 'A widow rents her spare room to a man who is clearly running from something, and he fixes everything he touches.', tone: 'healing' },
      { title: 'The Wedding Date Pact', premise: 'Best friends fake a relationship for six weddings in one summer, and the pact starts to crack at the third.', tone: 'friends to lovers' },
    ],
  },
  thriller: {
    genre: 'Thriller',
    audience: 'adult',
    entries: [
      { title: 'The Quiet Tenant', premise: 'She rents the flat above a man who never makes a sound, and the silence is the loudest thing in the building.', tone: 'tense' },
      { title: 'Seven Days of Rain', premise: 'A profiler returns to the town where she lost a case, and the killer has been waiting for the rain.', tone: 'procedural' },
      { title: 'The Wrong Passenger', premise: 'A rideshare driver picks up a man who knows her address, her schedule and her daughter’s name.', tone: 'chase' },
      { title: 'Nobody’s Daughter', premise: 'A woman with no past discovers her fingerprints belong to a girl who died twenty years ago.', tone: 'conspiracy' },
      { title: 'The Last Witness', premise: 'The only witness to a murder has been dead for three years, and someone is still paying her rent.', tone: 'noir' },
      { title: 'House of Small Confessions', premise: 'A therapist realises her new patient is describing the murder she committed.', tone: 'psychological' },
      { title: 'The Ferryman', premise: 'Every body found in the river has one thing in common: a ferry ticket with tomorrow’s date.', tone: 'investigation' },
      { title: 'Silent Partner', premise: 'A startup founder discovers her business partner never existed, and the money went somewhere real.', tone: 'corporate' },
      { title: 'The Night Shift', premise: 'A hospital cleaner sees something she shouldn’t, and the cameras were off for exactly nine minutes.', tone: 'claustrophobic' },
      { title: 'One Perfect Alibi', premise: 'Six people have an airtight alibi for the same hour, and only one of them is lying.', tone: 'puzzle' },
    ],
  },
  mystery: {
    genre: 'Mystery',
    audience: 'adult',
    entries: [
      { title: 'The Vicar’s Ledger', premise: 'A village vicar keeps a record of every confession, and the last entry is a murder that has not happened yet.', tone: 'cosy' },
      { title: 'The Library of Unfinished Books', premise: 'Every unfinished manuscript in the library hides a clue to a disappearance, and a new one just arrived.', tone: 'literary' },
      { title: 'Murder at the Winter Ball', premise: 'A locked ballroom, a dead host and eight guests with the same motive.', tone: 'classic' },
      { title: 'The Clockmaker’s Confession', premise: 'Every clock in the shop stopped at the same minute, and the owner has been missing for a week.', tone: 'puzzle' },
      { title: 'A Study in Salt', premise: 'A retired detective moves to a quiet coast town and finds the tide brings in more than seaweed.', tone: 'cosy' },
      { title: 'The Missing Postcard', premise: 'A postcard arrives forty years late, and the message is a confession to a crime nobody reported.', tone: 'cold case' },
      { title: 'The Tea Room Murders', premise: 'Three deaths, one tea room, and a waitress who remembers every order for the wrong reasons.', tone: 'cosy' },
      { title: 'The Archivist', premise: 'A city archivist finds a document that proves a famous case was solved by the wrong person.', tone: 'institutional' },
      { title: 'Death in the Orchard', premise: 'A harvest festival turns into a murder inquiry, and every family in the valley has something buried.', tone: 'village' },
      { title: 'The Second Key', premise: 'A woman inherits a house with two front doors and a key that fits neither.', tone: 'gothic mystery' },
    ],
  },
  'science-fiction': {
    genre: 'Science Fiction',
    audience: 'adult',
    entries: [
      { title: 'The Memory Auction', premise: 'Memories are currency, and a broker buys one that has not been lived yet.', tone: 'cyberpunk' },
      { title: 'Station of Small Mercies', premise: 'A maintenance worker on a dying station is the only one who can hear the ship breathe.', tone: 'quiet sci-fi' },
      { title: 'The Ninth Colony', premise: 'Eight colonies went silent, and the ninth just sent a message in the voice of the first.', tone: 'exploration' },
      { title: 'Hard Light', premise: 'A courier carries a message that can only be read once, and everyone wants to be the one who reads it.', tone: 'space opera' },
      { title: 'The Terraform Wars', premise: 'Two factions fight over a planet that is already inhabited by something that does not want either of them.', tone: 'military' },
      { title: 'Copy of a Copy', premise: 'The third clone of a dead woman starts remembering a life that belongs to none of them.', tone: 'identity' },
      { title: 'The Last Signal', premise: 'A radio astronomer hears a broadcast from Earth dated three hundred years from now.', tone: 'first contact' },
      { title: 'Orbital Decay', premise: 'A salvage crew finds a ship that has been orbiting for a century with the crew still awake.', tone: 'horror sci-fi' },
      { title: 'The Quiet Engine', premise: 'A ship’s engine starts thinking, and it wants to go somewhere nobody agreed to.', tone: 'philosophical' },
      { title: 'Seeds of the Second Earth', premise: 'The generation ship arrives to find the planet already terraformed by the people who left after them.', tone: 'generational' },
    ],
  },
  'post-apocalyptic': {
    genre: 'Post-Apocalyptic',
    audience: 'adult',
    entries: [
      { title: 'The Last Grocer', premise: 'A shopkeeper keeps the only food in the valley, and everyone is polite about it until winter.', tone: 'grounded' },
      { title: 'Ashfall', premise: 'After the volcano, a courier walks north with a letter that must arrive before the snow.', tone: 'survival' },
      { title: 'The Quiet Zone', premise: 'In a world where sound attracts the things outside, a mother must keep a newborn silent.', tone: 'tension' },
      { title: 'Water Rights', premise: 'Two towns share one well, and the treaty that kept the peace has just expired.', tone: 'western' },
      { title: 'The Greenhouse', premise: 'A botanist guards the last seed vault, and a stranger arrives with a seed that should not exist.', tone: 'hopeful' },
      { title: 'Signal Fade', premise: 'A radio operator keeps broadcasting to a city that stopped answering years ago.', tone: 'lonely' },
      { title: 'The Long Winter', premise: 'The sun dimmed, the crops failed, and one family decides to walk to the coast.', tone: 'family' },
      { title: 'Bones of the Old Road', premise: 'A scavenger finds a working car and must decide who deserves to ride.', tone: 'moral' },
      { title: 'The Ferryman of the Flood', premise: 'A boatman carries survivors across a drowned country and charges a story instead of a fare.', tone: 'mythic' },
      { title: 'After the Last Bell', premise: 'The school is the last safe place, and the teacher has to decide who gets in.', tone: 'enclosed' },
    ],
  },
  horror: {
    genre: 'Horror',
    audience: 'adult',
    entries: [
      { title: 'The House That Waits', premise: 'Every family that moves in lasts exactly eleven months, and the new tenants are on month ten.', tone: 'haunted house' },
      { title: 'The Neighbours Below', premise: 'The flat below has been empty for years, but someone keeps paying the electricity.', tone: 'urban' },
      { title: 'The Skin of the Forest', premise: 'Hikers who leave the trail come back changed, and the rangers have stopped filing reports.', tone: 'folk' },
      { title: 'The Long Hallway', premise: 'A night porter counts the doors on his round, and tonight there is one more.', tone: 'liminal' },
      { title: 'The Quiet Ward', premise: 'A nurse takes the night shift in a ward where every patient has the same dream.', tone: 'medical' },
      { title: 'The Photograph', premise: 'Every photo taken in the house shows someone standing behind the subject, and they are getting closer.', tone: 'slow burn' },
      { title: 'The Choir Practice', premise: 'The church choir sings a hymn nobody wrote, and the congregation cannot stop humming it.', tone: 'religious' },
      { title: 'The Weight of Water', premise: 'A diver finds a town under the reservoir that still has its lights on.', tone: 'underwater' },
      { title: 'The Inheritance', premise: 'A family gathers for the reading of a will that names someone none of them recognise.', tone: 'family horror' },
      { title: 'The Neighbour’s Dog', premise: 'The dog next door has not barked in three weeks, and the smell is getting worse.', tone: 'suburban' },
    ],
  },
  'cozy-mystery': {
    genre: 'Cozy Mystery',
    audience: 'adult',
    entries: [
      { title: 'Murder at the Bake-Off', premise: 'The judge dies mid-tasting, and the winner is the only one with flour on her hands.', tone: 'sweet' },
      { title: 'The Knitting Circle', premise: 'The village knitting circle unravels a murder stitch by stitch.', tone: 'charming' },
      { title: 'A Death in the Bookshop', premise: 'The bookshop cat finds the body, and the owner has three days before the shop is closed.', tone: 'bookish' },
      { title: 'The Garden Club Murders', premise: 'Someone is poisoning the prize roses, and then the judge.', tone: 'village' },
      { title: 'Tea and Treachery', premise: 'A tea shop owner with a nose for gossip solves the murder the police have written off.', tone: 'warm' },
      { title: 'The Antique Shop Alibi', premise: 'Every item in the shop has a story, and one of them is a murder weapon.', tone: 'quirky' },
      { title: 'Cake and Consequences', premise: 'A baker’s new recipe is a hit, right up until the food critic drops dead.', tone: 'sweet' },
      { title: 'The Seaside Sleuth', premise: 'A retired teacher moves to the coast and finds the postman knows more than he should.', tone: 'gentle' },
      { title: 'Paws and Prejudice', premise: 'A dog walker sees something in the park that changes the case.', tone: 'cosy' },
      { title: 'The Christmas Market Mystery', premise: 'A body under the mulled wine stand, and only one stallholder saw anything.', tone: 'festive' },
    ],
  },
  'historical-fiction': {
    genre: 'Historical Fiction',
    audience: 'adult',
    entries: [
      { title: 'The Cartographer’s Wife', premise: 'A mapmaker’s wife finishes his last chart and discovers what he was hiding.', tone: 'literary' },
      { title: 'Salt and Silk', premise: 'A merchant’s daughter takes over the family trade in a city that does not allow it.', tone: 'sweeping' },
      { title: 'The Lighthouse Year', premise: 'A keeper’s log records a year that history insists never happened.', tone: 'quiet' },
      { title: 'The Orchard of Forgetting', premise: 'A village hides its past in an orchard, and a new teacher starts asking questions.', tone: 'melancholy' },
      { title: 'A Season of Flames', premise: 'A young nurse works through a siege and writes letters she can never send.', tone: 'war' },
      { title: 'The Clockmaker’s Daughter', premise: 'She inherits a workshop and a debt to a guild that does not officially exist.', tone: 'craft' },
      { title: 'The Last Train from Berlin', premise: 'A conductor hides a family in the luggage car and keeps the timetable running.', tone: 'tense' },
      { title: 'The Widow’s Ledger', premise: 'A merchant’s widow audits the estate and finds her husband’s second life.', tone: 'domestic' },
      { title: 'Beneath the Silk Road', premise: 'A caravan guide carries a secret across a desert that has swallowed better men.', tone: 'adventure' },
      { title: 'The River Between Us', premise: 'Two families on opposite banks share a ferry, a feud and a secret.', tone: 'generational' },
    ],
  },
  'young-adult': {
    genre: 'Young Adult',
    audience: 'young adult',
    entries: [
      { title: 'The Scholarship', premise: 'A scholarship to an elite school comes with a contract nobody read.', tone: 'academy' },
      { title: 'After the Fireworks', premise: 'The summer after graduation, four friends make a promise that one of them breaks.', tone: 'contemporary' },
      { title: 'The Ninth House', premise: 'Every student is sorted into a house, except her, and the ninth house is not on the map.', tone: 'fantasy' },
      { title: 'Signal Lost', premise: 'A hiking trip goes wrong, and the group chat keeps receiving messages from the missing girl.', tone: 'thriller' },
      { title: 'The Understudy Society', premise: 'Five students who never get picked form a secret club that starts getting picked.', tone: 'drama' },
      { title: 'Wildflower Season', premise: 'A small-town girl and the new boy agree to fake a romance to survive the summer.', tone: 'romance' },
      { title: 'The Last Rehearsal', premise: 'The school play is cursed, and the lead has been cast for the third year running.', tone: 'supernatural' },
      { title: 'Paper Kingdom', premise: 'She inherits her brother’s comic and the world inside it starts changing.', tone: 'speculative' },
      { title: 'The Distance Between Us', premise: 'Two pen pals meet for the first time at a concert that changes everything.', tone: 'sweet' },
      { title: 'Night School', premise: 'Detention becomes a hunt when the school locks down with something inside.', tone: 'horror' },
    ],
  },
  'literary-fiction': {
    genre: 'Literary Fiction',
    audience: 'adult',
    entries: [
      { title: 'The Weight of Ordinary Days', premise: 'A family chronicle told through the objects left behind in one house.', tone: 'quiet' },
      { title: 'A Brief History of Rain', premise: 'A meteorologist returns to the island where her mother disappeared and charts the weather instead of the grief.', tone: 'lyrical' },
      { title: 'The Museum of Us', premise: 'A marriage ends, and both partners catalogue what they kept.', tone: 'intimate' },
      { title: 'Small Hours', premise: 'A night-shift nurse writes down the things she cannot say to the people she saves.', tone: 'spare' },
      { title: 'The Orchard Keepers', premise: 'Three siblings inherit an orchard and the argument their parents never finished.', tone: 'family' },
      { title: 'Salt Water, Paper Sky', premise: 'A translator loses the words for her own life while translating someone else’s.', tone: 'reflective' },
      { title: 'The Last Good Year', premise: 'A town remembers the summer everything changed, one voice at a time.', tone: 'choral' },
      { title: 'Everything We Left in the Attic', premise: 'A daughter clears her mother’s house and finds the version of her she never met.', tone: 'tender' },
      { title: 'The Shape of a Name', premise: 'An immigrant family changes their name and spends three generations changing it back.', tone: 'sweeping' },
      { title: 'A Room Facing North', premise: 'A painter loses her sight and starts describing the world to the woman who once loved her.', tone: 'elegiac' },
    ],
  },
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function main() {
  if (starterMode && !withCovers) {
    throw new Error('--starter requires actual covers; --covers=false is only supported for the full catalog.');
  }
  if (withCovers && env.AI_MODE !== 'live') {
    throw new Error('Template AI-text covers require AI_MODE=live; use --covers=false only for the full catalog.');
  }
  if (withCovers && !env.REPLICATE_API_TOKEN) {
    throw new Error('Template AI-text covers require REPLICATE_API_TOKEN; mock artwork cannot render the cover title.');
  }

  const catalog: [string, { genre: string; audience: string; entries: Entry[] }][] = starterMode
    ? (JSON.parse(readFileSync(new URL('./data/starter-templates.json', import.meta.url), 'utf8')) as StarterEntry[])
        .map((entry) => [entry.category, { genre: entry.genre, audience: entry.audience, entries: [entry] }])
    : Object.entries(CATALOG);
  const count = catalog.reduce((total, [, config]) => total + config.entries.length, 0);
  const mode = starterMode ? 'starter' : 'full-catalog';
  console.log(`[seed-templates] mode=${mode}, templates=${count}, covers=${withCovers}, quality=low, text=ai`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let covers = 0;

  for (const [category, config] of catalog) {
    for (const [index, entry] of config.entries.entries()) {
      const starter = starterMode ? entry as StarterEntry : undefined;
      const slug = `${category}-${slugify(entry.title)}`;
      const { data: existing, error: lookupError } = await db
        .from('templates')
        .select('id, cover_path, is_published')
        .eq('slug', slug)
        .maybeSingle();

      if (lookupError && starterMode) {
        throw new Error(`[seed-templates] lookup failed for ${slug}: ${lookupError.message}`);
      }
      if (starterMode && existing && !existing.is_published) {
        throw new Error(`[seed-templates] existing starter ${slug} is unpublished. Resolve it before rerunning.`);
      }
      if (existing && (!withCovers || existing.cover_path === `templates/${slug}-ai-text.jpg`)) {
        skipped += 1;
        console.log(`[seed-templates] skipped existing AI-text ${slug}`);
        continue;
      }

      const tier = starterMode || index < 4 ? 'lite' : 'full';
      let coverPath: string | null = null;

      if (withCovers) {
        try {
          const font = starter?.cover_font ?? (index % 3 === 0 ? 'display' : index % 3 === 1 ? 'serif' : 'sans');
          const typography = font === 'display' ? 'dramatic, elegant display lettering' : font === 'serif' ? 'refined literary serif lettering' : 'bold contemporary sans-serif lettering';
          const art = await ai.image({
            prompt: [
              'Generate a complete, flat front book cover with AI-rendered typography integrated into the artwork. This is the finished cover, not a textless background or a physical book mockup.',
              starter?.cover_prompt ?? `Illustrate this premise: ${entry.premise} Genre: ${config.genre}. Moody, cinematic, painterly.`,
              `Render the exact title ${JSON.stringify(entry.title)} as the dominant, clearly readable text, using ${typography} appropriate to the genre.`,
              'Render the exact author/publisher credit "BookSaga" discreetly at the bottom. No other words, invented taglines, logos or watermarks.',
              'Spell every title word exactly. Compose the lettering professionally, with strong contrast and generous spacing so it remains readable at thumbnail size.',
              'Keep all lettering at least 12 percent inside every image edge, with the title in the upper third and the publisher credit above the bottom safe margin. Do not crop any letter.',
            ].join('\n'),
            aspectRatio: '1024x1536',
            quality: 'low',
            usage: { userId: '00000000-0000-0000-0000-000000000000', jobId: 'seed-templates', purpose: 'template_cover' },
          });

          // Resize/encode only: all visible lettering comes from the AI image, never an engine overlay.
          const composed = await sharp(art.buffer)
            .resize(1600, 2560, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 92 })
            .toBuffer();

          coverPath = `templates/${slug}-ai-text.jpg`;
          const upload = await db.storage
            .from('covers')
            .upload(coverPath, composed, { contentType: 'image/jpeg', upsert: true });
          if (upload.error) {
            if (starterMode) throw new Error(`Cover upload failed: ${upload.error.message}`);
            coverPath = null;
          } else {
            covers += 1;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (starterMode) throw new Error(`[seed-templates] cover failed for ${slug}: ${message}`);
          console.warn(`[seed-templates] cover failed for ${slug}: ${message}`);
        }
      }
      if (existing) {
        if (!coverPath) continue;
        const { error } = await db.from('templates').update({ cover_path: coverPath }).eq('id', existing.id);
        if (error) throw new Error(`[seed-templates] cover update failed for ${slug}: ${error.message}`);
        updated += 1;
        console.log(`[seed-templates] updated AI-text cover ${slug}, cover=${coverPath}`);
        continue;
      }


      const { error } = await db.from('templates').insert({
        slug,
        category,
        title: entry.title,
        subtitle: null,
        premise: entry.premise,
        genre: config.genre,
        tone: entry.tone,
        audience: config.audience,
        length_preset: starter?.length_preset ?? (index % 5 === 0 ? 'full' : index % 3 === 0 ? 'short' : 'standard'),
        planned_books: starter?.planned_books ?? [6, 9, 6, 12][index % 4],
        keywords: starter?.keywords ?? [config.genre.toLowerCase(), entry.tone.split(',')[0]!.trim(), 'series'],
        cover_path: coverPath,
        tier,
        ...(starterMode ? { is_published: true } : {}),
        sort_order: starterMode ? created + updated + skipped : index,
      });

      if (error) {
        if (starterMode) throw new Error(`[seed-templates] insert failed for ${slug}: ${error.message}`);
        console.error(`[seed-templates] insert failed for ${slug}: ${error.message}`);
        continue;
      }
      created += 1;
      console.log(`[seed-templates] created ${slug} (${entry.title}), tier=${tier}, cover=${coverPath ?? 'none'}`);
    }
  }

  console.log(`[seed-templates] done — mode=${mode}, templates=${count}, created ${created}, updated ${updated}, skipped ${skipped}, covers ${covers}, text=ai`);
}

await main();
