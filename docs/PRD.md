# BookSaga — Product Requirements Document (PRD)

Version: 1.2 · Date: 23 Oct 2026 · Status: Approved for build (changes: §20)

---

## 1. Product Overview

**BookSaga** ek AI web app hai jo **ek idea se poori connected book series** (Book 1, 2, 3 … N) generate karta hai, jo Amazon KDP pe publish karne ke liye ready ho: same characters, same world, har book ke end pe cliffhanger, matching covers, aur saath me KDP-ready files.

- **Category:** JV launch product (FE + 5 OTO, aur har OTO ka downsell)
- **Inspiration:** BookSeries AI (bookseriesai.com). Workflow same rahega, lekin branding, colors aur code BookSaga ke apne honge.
- **Core USP:** "One Idea → A Whole Series." Single book nahi, connected series, kyunki read-through se royalties multiply hoti hain.
- **One-liner:** _Type one idea. Get a complete, KDP-ready book series tonight._

### 1.1 Goals

1. User ek idea se series plan kare, phir Book 1 → Book N step-by-step generate kare, aur continuity 100% bani rahe.
2. Har book ke saath matching cover, title, blurb, keywords, categories aur KDP-ready files (EPUB / Print PDF / DOCX) mile.
3. Lifetime-deal economics safe rahe. Iske liye one-time credits (koi monthly refill nahi), plan limits aur sasti AI models use honge.
4. Launch-day pe hazaron users ko handle kar sake: queue-based generation, retries, aur kisi bhi job ke fail hone pe auto-refund.

### 1.2 Non-Goals (v1)

- Direct KDP auto-publishing (KDP ka koi public API nahi hai, user files download karke khud upload karega)
- Multi-language books / multi-language UI (sirf English; code me `language` field future ke liye rahega)
- Mobile app (sirf responsive web)
- Real-time collaborative editing

---

## 2. Target Users

| Persona                       | Need                                             |
| ----------------------------- | ------------------------------------------------ |
| KDP beginner                  | Pehli series bina likhe publish karni hai        |
| Existing KDP publisher        | Standalone books nahi bik rahi, series chahiye   |
| Faceless / pen-name publisher | Kai genres me kai pen names se publish karna hai |
| Agency / freelancer (OTO4)    | Clients ke liye series likh ke bechni hai        |
| Reseller (OTO5)               | BookSaga ke licenses resell karne hain           |

---

## 3. Funnel, Plans & Entitlements

### 3.1 Funnel

| Level | Offer                      | Price | Downsell       | DS Price |
| ----- | -------------------------- | ----- | -------------- | -------- |
| FE    | **BookSaga Basic**         | $17   | —              | —        |
| OTO 1 | **Unlimited**              | $47   | Unlimited Lite | $27      |
| OTO 2 | **Done-For-You**           | $37   | DFY Lite       | $17      |
| OTO 3 | **Audiobook**              | $47   | Audiobook Lite | $27      |
| OTO 4 | **Agency**                 | $67   | Agency Lite    | $47      |
| OTO 5 | **Reseller (+ Franchise)** | $97   | Reseller Lite  | $67      |

### 3.2 Entitlement Matrix

Legend: **✅** = milta hai · **❌** = nahi milta · **–** = ye plan is feature ko change nahi karta (add-on hai; value baaki plans se aati hai).

| Feature                                        | FE                       | U-Lite | U (OTO1) | DFY-Lite  | DFY (OTO2) | AB-Lite | AB (OTO3) | Ag-Lite | Ag (OTO4) | Res-Lite | Res (OTO5) |
| ---------------------------------------------- | ------------------------ | ------ | -------- | --------- | ---------- | ------- | --------- | ------- | --------- | -------- | ---------- |
| One-time credits (main pool)                   | 300                      | +1,000 | +3,000   | –         | –          | –       | –         | –       | –         | –        | –          |
| Series limit                                   | 3 active                 | 25     | ∞        | –         | –          | –       | –         | –       | –         | –        | –          |
| Books per series                               | 5                        | 30     | 30       | –         | –          | –       | –         | –       | –         | –        | –          |
| Short + Standard length                        | ✅                       | ✅     | ✅       | –         | –          | –       | –         | –       | –         | –        | –          |
| Full-length books                              | ❌                       | ✅     | ✅       | –         | –          | –       | –         | –       | –         | –        | –          |
| Paperback full-wrap cover PDF                  | ❌                       | ✅     | ✅       | –         | –          | –       | –         | –       | –         | –        | –          |
| Box Set Builder                                | ❌                       | ✅     | ✅       | –         | –          | –       | –         | –       | –         | –        | –          |
| Series Templates (`templatesTier`)             | ❌ none (locked preview) | –      | –        | lite (40) | full (120) | –       | –         | –       | –         | –        | –          |
| DFY series ideas, blurb/keyword packs          | ❌                       | –      | –        | lite      | full       | –       | –         | –       | –         | –        | –          |
| One-time audiobook credits (audio pool)        | ❌ 0                     | –      | –        | –         | –          | +300    | +1,000    | –       | –         | –        | –          |
| Client accounts                                | ❌ 0                     | –      | –        | –         | –          | –       | –         | 25      | 100       | –        | –          |
| One-time agency pool credits (clients ke liye) | ❌ 0                     | –      | –        | –         | –          | –       | –         | +2,000  | +5,000    | –        | –          |
| Resell licenses                                | ❌ 0                     | –      | –        | –         | –          | –       | –         | –       | –         | 50       | 100        |
| Franchise kit (promo pages, swipes)            | ❌                       | –      | –        | –         | –          | –       | –         | –       | –         | ✅       | ✅         |

"3 active" = archived/deleted (trash) series count nahi hoti. Books per series ki hard max 30 hai (system limit, sab plans ke liye).

Rules:

- **Credits one-time hain, monthly nahi.** Plan grant hote hi us plan ke credits ek baar pool me **add** ho jaate hain. Koi monthly refill, reset ya expiry nahi; credits tab tak rehte hain jab tak use na hon. Har plan ka credit grant sirf ek baar hota hai (same plan dobara grant karne se double credits nahi milte).
- **Credits stack hote hain:** jaise FE + U-Lite + U = 300 + 1,000 + 3,000 = 4,300 main credits. (Downsell aur full OTO dono kharide hon toh dono ke credits judte hain, kyunki dono ka paisa diya gaya hai.)
- Teen alag credit pools hain: **main** (books, covers, AI tools), **audio** (audiobooks), **agency** (agency clients ke jobs).
- **Features/limits** (length presets, series limit, box sets, templates tier, etc.) ke liye effective entitlement = sab active plans ka **max/union**. Downsell aur full OTO dono hon toh features full OTO ke milte hain.
- **Credit packs nahi hain.** Credits khatam hone pe user ko "Not enough credits" + Upgrade CTA (OTO sales page) dikhega. Admin panel se manually bonus/support credits bhi de sakte hain.
- **Agency clients:** client accounts ko owner ke plan ke **features/limits** milte hain (length presets, series limit, box sets, etc.), lekin unka **apna koi credit pool nahi hota**. Client ke saare jobs owner ke **agency pool** se katte hain. Owner har client ko ek **allotment** deta hai (default 100 credits; owner kabhi bhi badha/ghata sakta hai, total pool se zyada nahi). Admin owner ke liye limits override kar sakta hai.
- **Reseller customers:** FE features milte hain, lekin one-time main credits **100** (normal FE buyer ko 300). Ye `profiles.reseller_owner_id` set hone se automatically apply hota hai.
- Sidebar me locked modules dikhenge, lock icon + "Upgrade" CTA ke saath. Upgrade URL admin settings me set hoga. Credits khatam hone ke baad bhi upgrade ka raasta rahe, isliye OTO sales pages launch ke baad bhi live rakhne honge (marketing team ka kaam).

---

## 4. Credit System

### 4.1 Credit Costs (admin-configurable, `credit_costs` table)

| Action key (`credit_costs.action`) | Kya hai                                              | Credits                           | Pool  |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------- | ----- |
| `book_short`                       | Short book (~12k words, 8–10 ch)                     | 10                                | main  |
| `book_standard`                    | Standard book (~30k words, 15–20 ch)                 | 20                                | main  |
| `book_full`                        | Full-length book (~55k words, 25–30 ch)              | 35                                | main  |
| `cover`                            | Cover generate / regenerate                          | 2                                 | main  |
| `enhance`                          | Enhance with AI / AI Suggestions                     | 1                                 | main  |
| `rewrite`                          | Chapter rewrite / expand / shorten / regenerate (AI) | 1                                 | main  |
| `metadata`                         | Metadata (title/blurb/keywords) regenerate           | 1                                 | main  |
| `arc_extend`                       | Add More Parts (series arc extend)                   | 1                                 | main  |
| `audiobook`                        | Audiobook (per book)                                 | 15                                | audio |
| —                                  | Series plan / Series Bible creation                  | 0 (Book 1 generation me included) | —     |
| —                                  | Exports / re-exports                                 | 0                                 | —     |

Agency client ke jobs me pool hamesha **agency** (owner ka) hota hai, `audiobook` ko chhod ke (wo owner ke audio pool se).

Ye numbers abhi provisional hain. T2.21 me real AI cost measure karke final honge.

### 4.2 Behaviour

- **One-time grant:** plan grant hote hi us plan ke credits (§3.2) ek baar pool me add hote hain (`credit_ledger` status `grant`, `user_plan_id` ke saath). Koi monthly reset, refill, anchor day ya expiry nahi.
  - Grant idempotent hai: ek `user_plans` row ke credits sirf ek baar milte hain (unique `(user_plan_id)` grant entry). Same plan revoke karke dobara grant karne pe admin ko explicit "re-grant credits" choose karna padta hai.
- **Refund / chargeback / revoke:** jis plan ka refund hua, uske diye credits pool se wapas kat jaate hain, lekin balance 0 se neeche nahi jaata (`revoked` ledger entry). Formula: `deduct = min(balance, granted_by_that_plan)`. Jo credits user pehle hi use kar chuka, wo kharch maane jaate hain.
- **Reserve → Commit → Refund** model:
  1. Job enqueue hote hi credits _reserve_ ho jate hain (`credit_ledger` entry, status `reserved`).
  2. Job success hone pe entry `committed` ho jati hai.
  3. Job fail hone pe (saare retries ke baad) entry `refunded` ho jati hai aur user ko notification jati hai.
  4. Agar reserve ke baad queue me job daalna hi fail ho jaye, toh turant refund + job `cancelled`.
- **Cancel (user):** generating book ko user cancel kar sakta hai. Jo chapters ban chuke wo rehte hain. Agar < 20% chapters bane the toh poora refund, warna koi refund nahi. Ye rule Cancel confirm dialog me clearly dikhega.
- Agar balance kam hai toh action button disable rahega, saath me "Not enough credits" aur Upgrade CTA (OTO sales page) dikhega.
- Admin kisi bhi user ko manually credits add/deduct kar sakta hai, kisi bhi pool me (reason mandatory, ledger me log hoga). Bonus/support credits isi se diye jaate hain.
- **Credit packs nahi hain.** Credits sirf FE/OTO/downsell purchase ya admin grant se aate hain.
- Credits pill (topbar) aur Dashboard pe teeno pools ka current balance dikhega (sirf jo pools user ke paas hain).

### 4.3 Cost Guardrails

- Per-user concurrency: ek waqt pe max 1 book generation job (DB unique index se enforce, taaki do parallel clicks se do jobs na banein), aur max 3 cover jobs.
- Global concurrency worker config se control hogi (`WORKER_TEXT_CONCURRENCY`, `WORKER_IMAGE_CONCURRENCY`, …). AI calls I/O-bound hain, isliye text concurrency default 50 hai. Asli limit OpenRouter rate limit hai.
- Daily hard cap per user (admin-configurable, default: 10 books/day), taaki koi abuse na kar sake.
- Har AI call ka token usage aur cost `ai_usage_log` me record hoga, aur admin dashboard pe cost dikhega.
- **Prompt caching:** har chapter call me static hissa (system prompt, style guide, Series Bible) prompt ke shuru me rakha jayega, taaki provider-side cache hits ka fayda mile (OpenRouter pe V4.1 Flash ke liye support M2 me verify karna hai).

---

## 5. Tech Stack

| Layer                    | Choice                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Frontend + API           | **Next.js** (App Router, TypeScript, Server Actions + Route Handlers). Exact version M1 (T1.1) me pin hoga |
| UI                       | Tailwind CSS + shadcn/ui + lucide-react icons; dark neon theme (Section 8.0)                               |
| Rich text editor         | TipTap                                                                                                     |
| Cover editor             | Konva.js (react-konva) canvas                                                                              |
| PDF viewer (KDP Preview) | pdf.js                                                                                                     |
| DB / Auth / Storage      | **Supabase** (Postgres + RLS, Auth, Storage)                                                               |
| Job queue                | **BullMQ + Redis**                                                                                         |
| Worker                   | Node.js TypeScript worker (alag container), same repo ke andar                                             |
| Text AI                  | **OpenRouter → `deepseek/deepseek-v4.1-flash-1017`** (1M context)                                          |
| Image AI                 | **Replicate → `openai/gpt-image-2`**, `quality: "low"`                                                     |
| TTS                      | **Replicate → `jaaari/kokoro-82m`**                                                                        |
| EPUB                     | Custom EPUB3 builder (JSZip + XHTML templates)                                                             |
| Print PDF                | HTML + Paged.js → Playwright (Chromium) PDF render                                                         |
| DOCX                     | `docx` npm package                                                                                         |
| Audio post-process       | ffmpeg (concat, loudness normalize, MP3 192kbps CBR)                                                       |
| Email                    | Nodemailer (SMTP), default **OFF**                                                                         |
| Validation               | Zod                                                                                                        |
| Hosting                  | **VPS + Docker Compose** (Next.js app, worker, Redis); DB = Supabase cloud                                 |

Saari dependencies **exact pinned versions** pe rahengi (`package.json` me `^`/`~` nahi).

### 5.1 AI Model Config (env + admin overridable)

```env
OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4.1-flash-1017
REPLICATE_API_TOKEN=
REPLICATE_IMAGE_MODEL=openai/gpt-image-2
REPLICATE_IMAGE_QUALITY=low
REPLICATE_TTS_MODEL=jaaari/kokoro-82m
```

Model names code me hardcode nahi honge. Saari AI calls ek `ai/` provider layer se jayengi, taaki model badalna ho toh sirf config badle.

---

## 6. System Architecture

```
                ┌────────────────────────── VPS (Docker Compose) ──────────────────────────┐
 Browser ──────►│  Next.js app (web)  ──enqueue──►  Redis (BullMQ)  ◄──consume──  Worker   │
   ▲            │     │   ▲                                                       │  │  │   │
   │ realtime   │     │   │ read/write                                            │  │  │   │
   │            └─────┼───┼───────────────────────────────────────────────────────┼──┼──┼───┘
   │                  ▼   │                                                       │  │  │
   └──────────── Supabase (Postgres + Auth + Storage + Realtime) ◄────────────────┘  │  │
                                                                                     │  │
                                         OpenRouter (DeepSeek V4.1 Flash) ◄──────────┘  │
                                         Replicate (gpt-image-2, Kokoro)  ◄─────────────┘
```

- **Web (Next.js):** UI, auth, CRUD, enqueue jobs, webhooks (W+/JVZoo), admin panel.
- **Worker:** generation pipelines (book, cover, export, audiobook, templates seed), cron jobs (export cleanup, stuck-job reaper).
- **Progress updates:** Worker `jobs` table update karega, aur frontend Supabase Realtime pe us row ko subscribe karega. Isse live progress bar dikhega ("Writing Chapter 7 of 20…"). Iske liye `jobs`, `books` aur `notifications` tables ko migration me `supabase_realtime` publication me add karna zaroori hai.
- **Storage buckets:** `cover-art` (text-less artwork), `covers`, `exports`, `audio`, `uploads` (user images), `avatars`, `template-assets`, `branding`. Saare buckets M1 ki migration me hi ban jayenge. Sab private rahenge aur files signed URLs se serve hongi. Sirf `template-assets` aur `branding` public read honge.

### 6.1 Environments

| Env            | Supabase                                                                                               | App / Worker / Redis                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Local**      | `supabase start` (Supabase CLI, Docker): Postgres, Auth, Storage, Studio, Inbucket (local email inbox) | `docker compose -f docker/docker-compose.dev.yml up -d redis`, phir `pnpm dev` + `pnpm worker:dev` |
| **Production** | **Supabase Cloud** project (online)                                                                    | VPS pe `docker compose -f docker/docker-compose.prod.yml up -d` (caddy, web, worker, redis)        |

Go-live steps:

1. Supabase cloud project create karo.
2. `supabase link --project-ref <ref>`, phir `supabase db push` (saari migrations push).
3. Seed run karo (`pnpm seed:prod`: plans, credit costs, admin user, templates).
4. VPS pe `.env.production` me cloud Supabase ke keys daalo aur containers up karo.

DB schema ka har change sirf `supabase/migrations/*.sql` se hoga. Production Studio me manual edit nahi karna.

---

## 7. AI Generation Pipeline

### 7.1 Overview

```
Idea + settings
   │
   ▼
[1] Series Plan ──► Series Bible v1 (characters, world, timeline, arc, threads)
   │
   ▼  (per book, user "Generate Part N" click kare)
[2] Book Outline (chapter-by-chapter beats, book's own resolution + cliffhanger)
   │
   ▼
[3] Chapter loop:  write chapter ─► summarize ─► extract new facts ─► update Bible delta
   │
   ▼
[4] Continuity Check pass (Bible vs book; fix contradictions)
   │
   ▼
[5] Metadata: title (confirm), subtitle, blurb, 7 keywords, 3 categories, "Read Next" page
   │
   ▼
[6] Cover (series style locked) ──► [7] Export files (EPUB / PDF / DOCX / Metadata)
```

### 7.2 Step Details

**[1] Series Plan** (sirf Book 1 se pehle ek baar chalega)

- Input: idea, genre, tone, audience, author/pen name, series title, planned books count (default 5), book length.
- Output (JSON, Zod-validated):
  - `series_arc`: overall story arc, aur har book ka role in the arc
  - `books[]`: working title + 3–4 line premise + har book ki main question + cliffhanger seed
  - `bible`: characters (name, age, appearance, personality, backstory, relationships, secrets), locations, world rules, timeline events, open threads
- Non-fiction ke liye: `books[]` = volumes (topic progression), aur bible = glossary, frameworks, author voice, cross-references.

**[2] Book Outline**

- Input: Series Bible (latest), series arc, pichhli books ke summaries, is book ka premise, length preset.
- Output: chapters[] (title, beats, POV, characters involved, target words), book resolution, aur ending cliffhanger (jo next book ke premise se linked ho).

**[3] Chapter Loop** (per chapter ek LLM call; target words length preset table se, neeche dekho)

- Context jo har call me jayega:
  - Series Bible (compact: is chapter ke characters/locations ka full data, baaki cast one-liner; ARCH §5.3 token budget)
  - Book outline
  - Saare pichhle chapters ke short summaries (is book ke) + pichhli books ke book-level summaries
  - Last chapter ke aakhri ~1,500 words, taaki flow continue rahe
  - Style guide (tone, POV, tense, genre conventions, banned phrases / anti-AI-cliché list)
- Chapter likhne ke baad ek chhoti call:
  - Chapter summary (150 words)
  - `facts_delta` (naye characters/places/facts/timeline events/thread changes), jo `series_bible` me merge hoga aur `bible_versions` me history ke saath save hoga
- Chapter DB me save hote hi user ko live dikhega. Agar beech me job fail ho, toh resume wahin se hoga jahan ruka tha (completed chapters skip).

**[4] Continuity Check**

- Book poori hone ke baad ek pass: bible + chapter summaries + key passages compare karke contradictions detect karega (names, ages, eye colour, places, dates).
- Issues mile toh affected paragraphs ka targeted rewrite hoga (max 1 auto-fix round). Bache hue issues "Continuity Report" me dikhenge, aur user khud fix kar sakta hai.

**[5] Metadata**

- Title (series pattern ke hisaab se), subtitle, "Book N of {Series}" line
- Blurb (150–250 words, hook + stakes + cliffhanger tease)
- 7 KDP keywords (har ek ≤ 50 characters), 3 category suggestions
- Front matter: title page, copyright page (pen name, year, "All rights reserved"), TOC
- Back matter: "Read Next" page (next book ka title + teaser + link placeholder `{{NEXT_BOOK_URL}}`, jise user KDP ASIN/URL se replace karega), "About the Author" (pen name bio), "Also in this Series" list

**Length presets** (ye table hi chapter count aur words/chapter ka single source hai):

| Preset      | Chapters | Words/chapter | Total |
| ----------- | -------- | ------------- | ----- |
| Short       | 8–10     | ~1,300        | ~12k  |
| Standard    | 15–20    | ~1,700        | ~30k  |
| Full-length | 25–30    | ~2,000        | ~55k  |

### 7.3 Prompt & Quality Rules

- Saare prompts `worker/src/prompts/*.ts` me versioned rahenge, aur har generated record pe `prompt_version` save hoga.
- Structured outputs JSON mode me aayenge aur Zod se validate honge. Invalid JSON aaye toh 2 retries "repair" prompt ke saath.
- Anti-slop list: "tapestry", "testament to", "delve", "a shiver ran down", repetitive openings, aur har chapter ke end pe moral summary nahi hona chahiye.
- Har chapter ka end forward-pointing hona chahiye (hook). Book ka end clearly cliffhanger ho, lekin book ki apni main question resolve honi chahiye.
- Kids/children's genre me content safety rules alag honge (age-appropriate, no violence/romance).

### 7.4 Retries & Errors

- OpenRouter/Replicate calls pe 3 retries with exponential backoff (429/5xx). Timeout per call: 180s text, 120s image.
- Job level pe BullMQ `attempts: 3` (export jobs: 2, kyunki Chromium render deterministic hai aur baar-baar retry se fayda nahi). Final fail hone pe credits refund, job `failed` status ke saath, aur user ko "Retry" button milega.
- Rate limit errors aaye toh global limiter queue ko slow kar dega.

---

## 8. Feature Specifications

### 8.0 Design System (UI Option A)

- Screenshots jaisa vibe: dark navy background (`#0B1023`-ish), cards `#121937` jinke borders subtle hon, aur neon gradients (blue → purple → pink).
- BookSaga ki apni identity: logo (open book + saga/flame mark), primary gradient `#3B82F6 → #8B5CF6 → #EC4899`, aur accent colors amber/teal/emerald (tool cards ke liye).
- Fonts: UI ke liye Inter ya Plus Jakarta Sans, aur hero headings ke liye bold display.
- Layout: left sidebar (icons + labels, active item gradient pill), top search bar (⌘K), user menu. Hero banners fantasy-books artwork wale (gpt-image-2 se banenge, ek baar, static assets).
- Accessibility: WCAG AA contrast, keyboard navigation, focus rings, aria labels, aur reduced-motion support.

Sidebar: Dashboard · Create Series · My Series · Series Templates · Cover Studio · KDP Preview · KDP Publishing (Exports) · Audiobook Series · Agency · Reseller & Franchise · Image Editor · Training · (Admin, sirf admin ko dikhega)

### 8.1 Auth

- Supabase Auth: email + password. Public signup **disabled** hoga, accounts sirf admin, CSV import ya webhook se banenge.
- Login page, aur "Forgot password" (sirf tab dikhega jab email ON ho; email OFF ho toh message aayega "Contact support").
- Profile: name, avatar, password change, default pen names list.

### 8.2 Dashboard

- Hero: "Welcome back, {name}", CTAs: Create New Series, Browse Templates.
- Stat cards: Total Series, Total Books, Completed Books, In Progress, Continuity Ready, aur **Credits Left** (main pool; audio/agency pools bhi agar user ke paas hon).
- Your Recent Series: cover, genre tag, parts count, progress bar, part chips (1 ✓, 2 ✓, 3 🔒), aur "Continue Writing" button.
- Quick Actions: Create New Series, Browse Templates, Design Covers, Preview for KDP, Export Files.
- Recommended Templates (agar DFY hai, warna locked teaser).

### 8.3 Create Series

Form fields:

- Series Idea / Concept* (textarea, max 2,000 characters)
- Author / Pen Name* (dropdown me saved pen names + naya add karne ka option)
- Series Title* (khud likho, ya AI suggest kare)
- Genre* (dropdown: canonical list `packages/shared/genres.ts` se, jo template categories ke saath mapped hai)
  - Fiction: Fantasy, Romance, Mystery & Thriller, Cozy Mystery, Sci-Fi, Horror, Paranormal & Urban Fantasy, Historical Fiction, Young Adult, Children's & Middle Grade
  - Non-fiction: Self-Help, Business & Money, Health, Diet & Cookbooks, Faith & Spirituality / Devotional, How-To & Hobbies (gardening, crafts…)
- Tone / Writing Style (Engaging & Cinematic, Dark & Gritty, Cozy & Warm, Humorous, Literary, Inspirational, Professional/Instructional…)
- Target Audience (Children 6–8, Middle Grade, Young Adult, New Adult, Adults, Professionals)
- Planned books (initial plan: 3–12, default 5; FE max 5). Baad me "Add More Parts" se 30 tak badha sakte hain (plan limit ke hisaab se)
- Fiction / Non-Fiction toggle (genre se auto)
- **Book 1 & Publishing Settings** (collapsible): book length (Short / Standard / Full, aur Full locked hoga agar plan me nahi), POV (1st/3rd), tense, trim size (5×8, 5.25×8, 5.5×8.5, 6×9), paper (white/cream), bleed (no/yes), language (English, locked), Book 1 title/brief override.

Actions:

- **Enhance with AI** (1 credit): idea ko rich concept me expand karta hai, aur title + tone suggestions bhi deta hai.
- **Use Template Instead**: Templates page kholta hai.
- **Generate Part 1** (book cost): Series Plan + Bible + Book 1 ka poora pipeline chalata hai.
- Generation ke baad modal aata hai: "Series Foundation Saved", jisme buttons hain: Continue This Series / View Series.

Right panel, **AI Assistant & Tools**:

- AI Suggestions (plot ideas, characters), Auto-Generate Covers toggle (ON/OFF; value `series.settings.autoCovers` me save hoti hai), Series Continuity (bible kholta hai), Publishing Structure (settings carry-forward). Cover source tabs: **Auto / Library / Upload**.

### 8.4 Series Roadmap (Series detail page)

- Horizontal cards Part 1…N. Har card ka status ye hoga:
  - `generated` (cover thumbnail, "Open Part N", "Continue Editing")
  - `ready` (pichhla part complete ho chuka hai, "Generate Part N" button active)
  - `locked` ("Complete Part N-1 to unlock")
  - `generating` (live progress %, current chapter, aur **Cancel** button; refund rule §4.2)
  - `failed` (Retry button)
- Rule: Part N tab hi generate ho sakta hai jab Part N-1 `generated` ho. Reason: continuity bible sequentially update hoti hai.
- **Add More Parts** (`arc_extend`, 1 credit): series ko planned count se aage badhao (plan limit tak, hard max 30 books). Isse AI arc extend hota hai aur nayi book premises banti hain.
- Har part ka length preset alag choose ho sakta hai.
- Tabs: Roadmap · Series Bible · Covers · Exports · Box Set · Audiobook · Settings.
- **Settings tab:** series title/pen name/tone edit, planned books edit (generated parts se kam nahi), default publishing settings (trim, paper, bleed), Auto-Generate Covers toggle, cover style unlock, Archive/Delete.
- `series.status` values: `draft` (Part 1 abhi generate nahi hua) · `active` · `completed` (saare planned parts generated) · `archived`.

### 8.5 My Series

- Grid/list toggle, search, filters (genre, status, pen name), sort (recent, name).
- Card actions: Open, Duplicate (sirf settings + bible copy honge, books nahi), Archive, Delete (confirm dialog, soft delete ke saath 30 din tak restore).

### 8.6 Series Bible

- Sections: Characters, Locations, World Rules, Timeline, Open Threads, Glossary (non-fiction), Style Guide.
- Har entry editable (form + rich text). Manual edits `source: user` mark honge, aur AI unhe kabhi overwrite nahi karega.
- Version history: kis book/chapter ne kya add kiya, diff view, aur restore option.
- Next book generation hamesha latest bible use karega.
- "Export Bible" PDF/DOCX me (author ke apne reference ke liye).

### 8.7 Book View & Chapter Editor

- Left me chapter list (drag-drop reorder, add/delete chapter), center me TipTap editor, right me tools.
- Toolbar: headings, bold/italic, scene break (`* * *`), quote, undo/redo. Autosave har 3 second pe, aur version snapshots bhi bante rahenge.
- AI tools (1 credit each):
  - **Rewrite with AI** (selection ya poora chapter; instructions: "more tension", "shorter", custom)
  - Expand / Shorten selection
  - Regenerate chapter (outline ke hisaab se)
- Continuity Report panel: detected issues aur unke "Go to paragraph" links.
- Metadata tab: title, subtitle, blurb, keywords, categories (edit + regenerate).
- Word count, estimated page count (trim size ke hisaab se), reading time.

### 8.8 Series Templates (OTO2 / DFY Lite)

- Hero banner, category tabs (All, Fantasy, Romance, Mystery & Thriller, Historical Fiction, Young Adult, Children's, Sci-Fi, Horror, Business & Money, Health & Wellness, Faith & Spirituality, Self-Help), search.
- Card: sample cover, badge (Bestseller/Popular/New), genre, name, short description, aur "Suggested 5 Parts".
- Template detail: concept, characters, 5-book arc, tone, audience, aur "Use This Template" button. Ye Create Series form ko prefill karta hai (sab editable rehta hai), aur user apna author name daalta hai.
- DFY Lite: sirf `tier = 'lite'` wale 40 templates unlocked; baaki cards locked (blur + Upgrade).
- **Seeding:** admin script `pnpm seed:templates`: DeepSeek se exactly 120 templates (12 categories × 10) + gpt-image-2 se sample covers. Idempotent hai (slug unique), toh dobara chalane pe duplicate nahi banenge. Admin panel se CRUD bhi milega (isliye count baad me 120 se zyada ho sakta hai).
- Unlimited (OTO1) se templates nahi milte. Templates sirf DFY-Lite (40) aur DFY (sab) me hain.
- DFY extras (OTO2): "DFY Series Ideas" (500+ one-line ideas by niche, seed se banenge), blurb templates, keyword packs by genre.

### 8.9 Cover Studio + Image Editor (Cover Option C)

**Default mode: Overlay (B)**

1. AI **text-less artwork** banata hai (gpt-image-2, `quality: low`, prompt me "no text, no letters"). Art **1856×2784** pe generate hota hai (dono sides 16 ke multiple), taaki paperback front (6×9 + bleed @ 300 DPI ≈ 1838×2775 px) ke liye bhi resolution kaafi ho. Ebook cover iska 1600×2560 crop/downscale hai. Exact supported sizes M4 (T4.2) me Replicate schema se verify karne hain.
2. Konva editor me text layers aate hain: Series name, Title, "Book N", Author name, aur optional tagline.
3. **Series Cover Style** (series level pe lock hota hai): art style prompt, color palette, font family/weights, text positions, effects (shadow, gradient, stroke). Ye Book 1 ke cover se set hota hai.
4. Book 2…N ke covers same style prompt + same layout se bante hain, sirf scene/subject aur ek accent color badalta hai. Isi se matched shelf banta hai.
5. Final cover flattened JPG ban ke `covers` bucket me save hota hai.

**AI Text Mode (A, optional toggle):** title + author prompt me jaate hain aur gpt-image-2 khud text render karta hai. UI me warning dikhegi: "Spelling check karlo".

**Cover sources:** Auto (AI), Library (user ki pichhli images + preset backgrounds), Upload (apni image, JPG/PNG, max 10MB).

**Image Editor** (same Konva engine): crop, brightness/contrast, text, shapes, layers, Google-font picker (~30 curated fonts, self-hosted), aur export PNG/JPG.

**Specs:**

- Ebook cover: 1600×2560 px JPG, RGB, < 5MB
- Paperback full-wrap (OTO1): PDF, 300 DPI. Width = bleed 0.125" + back + spine + front + bleed 0.125". Height = trim + 0.25".
  - Spine width = page count × 0.002252" (white) / 0.0025" (cream).
  - Spine pe text tabhi aayega jab page count ≥ 79 ho (KDP rule).
  - Back cover pe blurb + barcode safe area (2"×1.2" blank, bottom-right).
  - Wrap cover **sirf** print interior PDF render hone ke baad banta hai (actual page count chahiye). Agar baad me book edit hone se page count badal jaye, toh wrap `stale` mark hota hai aur pre-flight warning ke saath regenerate karna padta hai.
  - Server-side compose (worker) ka output hi canonical hai. Browser (Konva) preview sirf approximate hai.

### 8.10 KDP Preview

- pdf.js based viewer (screenshot 1 jaisa): left me page thumbnails, center me page, top bar me page X / N, zoom, fit, aur download.
- Do modes: **Ebook preview** (reflowable HTML render) aur **Print preview** (generated print PDF).
- Checks panel (pre-flight): page count, trim size, margins ok, cover dimensions ok, missing metadata, aur unresolved `{{NEXT_BOOK_URL}}` warning.

### 8.11 KDP Publishing (Exports)

Har book ke liye "Export" button ek `export` job chalata hai, aur saare files ek ZIP me milte hain + individual downloads bhi.

| File                          | FE  | OTO1 | Spec                                                                                                                                                                                         |
| ----------------------------- | --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EPUB3                         | ✅  | ✅   | Valid EPUB3 (epubcheck clean), NCX + nav TOC, embedded CSS, cover image, front/back matter                                                                                                   |
| Print interior PDF            | ✅  | ✅   | Selected trim size, mirrored margins (inside 0.375"–0.875" page count ke hisaab se, outside ≥ 0.25", bleed hai toh +0.125"), page numbers, running headers, chapter openings, embedded fonts |
| DOCX                          | ✅  | ✅   | Headings styles, page breaks per chapter, TOC field                                                                                                                                          |
| Ebook cover JPG               | ✅  | ✅   | 1600×2560                                                                                                                                                                                    |
| Metadata TXT + CSV            | ✅  | ✅   | Title, subtitle, series name, book number, author, blurb (HTML-safe), 7 keywords, categories, aur AI-disclosure note                                                                         |
| Paperback full-wrap cover PDF | ❌  | ✅   | 8.9 specs                                                                                                                                                                                    |
| Box Set EPUB + cover          | ❌  | ✅   | 8.12                                                                                                                                                                                         |

- **Series Export:** poori series ek ZIP me (har book ka folder).
- Exports `exports` bucket me 30 din rahenge (signed URL). Uske baad cleanup job delete kar degi, lekin re-export hamesha free rahega (0 credits).
- **KDP Upload Guide** page: step-by-step (ebook create, series linking, paperback, KDP Select/KU), aur "AI-generated content" disclosure kaise bharna hai, wo bhi.

### 8.12 Box Set Builder (OTO1 / U-Lite)

- Series ki 2+ generated books select karo, phir ek box set title, combined TOC, har book ke beech divider pages, aur ek box set cover (3D stacked-books style ya flat collection) banta hai.
- Output: Box Set EPUB + cover JPG + metadata (description AI se). Cost: cover ke 2 credits, EPUB free.

### 8.13 Audiobook Series (OTO3 / AB-Lite)

- Book select karo, phir voice choose karo (Kokoro voices; English US/UK ki curated list: `af_bella`, `af_nicole`, `bf_emma`, `am_fenrir`, `am_michael`, `am_puck`, etc., har voice ka preview sample ke saath), aur speed (0.8–1.2).
- Pipeline: chapter text clean ho (markdown hatao, scene breaks pe pause), chunks ~1,000 characters me bantega, Kokoro calls (parallel, limit ke saath), ffmpeg concat, loudness normalize, aur MP3 output.
- Output **ACX-compatible** hoga: har chapter ki alag MP3, 192 kbps CBR, 44.1 kHz, mono, RMS −23 to −18 dB, peak ≤ −3 dB, noise floor ≤ −60 dB, shuru me 0.5–1s aur end me 1–5s room tone. Saath me opening/closing credits files aur 2400×2400 square cover bhi.
- Har chapter ka in-app audio player + ZIP download.
- AB-Lite: +300 one-time audiobook credits; AB: +1,000 (dono kharide toh 1,300). 15 credits per book.

### 8.14 Agency (OTO4 / Ag-Lite)

- "Clients" page: client account create karo (name, email, password auto-generate), aur "Copy Login Details" button.
- Limits: Ag-Lite 25 clients, Ag 100 clients.
- Client account ek normal user hota hai, jiske `parent_agency_id` set hota hai. Use owner ke plan ke features/limits milte hain (admin override kar sakta hai).
- **Credits (agency pool):** owner ko clients ke liye alag **one-time** pool milta hai: Ag-Lite +2,000, Ag +5,000 (dono kharide toh 7,000). Clients ka apna pool nahi hota; unke jobs owner ke agency pool se katte hain. Owner ke apne (main) credits isse alag aur safe rehte hain.
  - Owner har client ko ek **allotment** deta hai (default 100 credits). Owner allotment kabhi bhi badha/ghata sakta hai. Client allotment ya pool khatam hone pe "Not enough credits, contact your agency" dikhega.
  - Clients page pe pool balance, har client ka allotment, used aur remaining dikhega.
- Owner client ko suspend/activate kar sakta hai aur uski series read-only dekh sakta hai.
- Client commercial license page (PDF), jo owner apne clients ko de sake.

### 8.15 Reseller & Franchise (OTO5 / Res-Lite)

- Reseller dashboard: "Create Customer License", jisse BookSaga FE account banta hai aur ek license consume hota hai. Res-Lite me 50 licenses, Res me 100.
- License list: customer email, created date, status, aur revoke (revoke karne se license wapas milta hai).
- **Franchise kit** (screenshot wala Franchise module yahin merge hai): ready sales page template (HTML download), promo swipes (emails, social posts), banners, aur demo video link. Saare assets admin panel se upload/manage honge.
- Reseller customers FE features hi paate hain (koi OTO nahi), lekin unhe one-time **100 credits** milte hain (normal FE buyer ko 300).

### 8.16 Training

- Module list → lessons (title, description, YouTube/Vimeo embed URL, order, optional "required plan").
- Lesson pe "Mark complete", aur har module ka progress.
- Admin CRUD.

### 8.17 Notifications

- In-app bell: "Part 3 is ready", "Export ready", "Generation failed — credits refunded", "Credits low" (balance kisi bhi pool me 10% se kam ho).
- Supabase Realtime se live, read/unread ke saath.
- Email ON ho toh important notifications email pe bhi jayengi (user preference se).

### 8.18 Global Search (⌘K)

- Series, books, chapters (title match), exports aur pages (navigation) me search. Postgres full-text (`tsvector`) se.

### 8.19 Legal Pages

- Public pages: Terms of Service, Privacy Policy, Refund Policy, aur AI Content Disclosure (KDP pe AI-generated content disclose karne ki zimmedari user ki hai).
- Content admin panel (Settings) se editable markdown. Login page aur app footer se link.
- Legal text tu/teri team final karegi; app sirf pages aur placeholders deta hai.

---

## 9. Admin Panel (`/admin`, role = admin)

| Section         | Features                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview        | Total users, active today, books generated (today/7d/30d), queue depth, failed jobs, **AI cost** (today/30d, provider-wise)                                                                                                                                                                                                                                                                                                      |
| Users           | Search/filter, create user (name, email, plans; password auto-generate), **Copy Login Details**, edit, reset password (naya password set + copy), suspend/activate, delete, impersonate (read-only "view as"), grant/revoke plans, credits add/deduct (reason ke saath). **"Pending credentials" tab**: jo users bane lekin unke login details abhi copy/send nahi hue (webhook se bane users, email OFF); "Mark as sent" action |
| Credit Ledger   | Har user ka poora credit history (grant/reserve/commit/refund/adjust/revoked), job link ke saath, filters. Refund/chargeback disputes debug karne ke liye                                                                                                                                                                                                                                                                        |
| Bulk Import     | CSV upload (`email,name,plans` jahan plans = `fe;oto1;oto2_lite`), dry-run preview, phir import. Result CSV download hoga jisme generated passwords honge                                                                                                                                                                                                                                                                        |
| Plans & Credits | Plan definitions (limits, credits), credit costs table, daily caps                                                                                                                                                                                                                                                                                                                                                               |
| Purchases       | Saari purchases ka log (source: manual / csv / warriorplus / jvzoo), refunds, chargebacks                                                                                                                                                                                                                                                                                                                                        |
| Integrations    | **WarriorPlus** & **JVZoo** toggles (default OFF), secret keys, product-ID → plan mapping table, webhook URLs (copy), test event button, webhook event log                                                                                                                                                                                                                                                                       |
| Email           | SMTP toggle (default OFF), host/port/user/pass/from, test email, templates editor (welcome, reset, notification)                                                                                                                                                                                                                                                                                                                 |
| Templates       | Series templates CRUD, seed script status, DFY ideas/packs CRUD                                                                                                                                                                                                                                                                                                                                                                  |
| Training        | Modules/lessons CRUD                                                                                                                                                                                                                                                                                                                                                                                                             |
| Franchise Kit   | Reseller assets upload                                                                                                                                                                                                                                                                                                                                                                                                           |
| Jobs            | Queue monitor (waiting/active/failed), job detail (logs, error), retry/cancel                                                                                                                                                                                                                                                                                                                                                    |
| Settings        | App name, logo, support email/URL, upgrade URLs per OTO, AI model overrides, maintenance mode banner                                                                                                                                                                                                                                                                                                                             |
| Audit Log       | Har admin action (kisne kya kab kiya)                                                                                                                                                                                                                                                                                                                                                                                            |

---

## 10. Sales / Provisioning

### 10.1 Current: Launchpad (Manual)

- Buyer ka data aane pe admin **Users → Create** ya **Bulk Import CSV** se account banata hai, aur FE/OTO plans assign karta hai.
- **Login details buyer tak pahunchana app ke scope ke bahar hai.** Ye kaam BookSaga ki team apne alag **thank-you page** se karegi. App me koi claim page ya auto-email flow launch ke liye nahi banega.
- Admin ke paas "Copy Login Details" (single user) aur CSV import ka result file (email + generated password, ek baar download) rahega, taaki team wo details apne thank-you/delivery process me use kar sake.
- Har grant ka `purchases` me record banta hai (`source = manual` / `csv`), taaki history bani rahe.

### 10.2 Ready (OFF): WarriorPlus & JVZoo

- Endpoints: `POST /api/webhooks/warriorplus`, `POST /api/webhooks/jvzoo`
- Common `ProvisioningService`, jiske platform adapters hain:
  - Payload ko verify kare (W+: IPN secret key / signature; JVZoo: JVZIPN secret se `cverify` hash).
  - Normalize karke ek common event banaye: `{ platform, txn_id, product_id, email, name, event: sale|refund|chargeback|cancel }`.
- Flow:
  - **Sale:** product-ID se plan map hota hai. User exist nahi karta toh create hota hai (password auto-generate), plan grant hota hai, aur welcome email jati hai (agar email ON hai; warna admin "Pending credentials" list me dikhta hai).
  - **Refund/Chargeback:** us transaction ka plan revoke ho jata hai aur credit pools naye limit tak cap ho jaate hain (§4.2). Agar koi active plan nahi bachta toh account suspend.
- **Idempotent:** `(platform, txn_id, event)` unique hai, toh duplicate webhooks ignore hote hain.
- Toggle OFF ho toh endpoint 404 return karta hai aur payload log nahi hota.
- Saare raw events `webhook_events` me log hote hain (debug + replay ke liye).

---

## 11. Email System (Feature built, default OFF)

- Admin → Email: SMTP config + ON/OFF toggle.
- **OFF:** koi email nahi jati. Admin ko credentials copy karke dene hote hain, Forgot Password link UI me hide rehta hai, aur notifications sirf in-app.
- **ON:** welcome email (login URL + email + temp password), password reset (Supabase Auth custom SMTP), aur notifications (user preference ke hisaab se).
- Templates: HTML + text, variables `{{name}}`, `{{email}}`, `{{password}}`, `{{login_url}}`, `{{app_name}}`.
- Local testing: Supabase Inbucket (`http://localhost:54324`) me saari emails dikhengi.

---

## 12. Data Model (Supabase Postgres)

`id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` saari entity tables pe honge, aur RLS sab pe ON rahega. Exception: config/key-value tables (`plans` → pk `code`, `credit_costs` → pk `action`, `app_settings` → pk `key`).

| Table                                                         | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                                    | `id (= auth.users.id)`, `name`, `email`, `role (user/admin)`, `status (active/suspended)`, `parent_agency_id`, `reseller_owner_id`, `avatar_url`, `last_active_at` (sirf analytics), `credentials_pending bool`                                                                                                                                                                                                                                                                                                                                                                          |
| `plans`                                                       | `code pk (fe, oto1, oto1_lite, oto2, oto2_lite, oto3, oto3_lite, oto4, oto4_lite, oto5, oto5_lite)`, `name`, `limits jsonb`, `grant_main_credits`, `grant_audio_credits`, `grant_agency_credits` (one-time grant amounts)                                                                                                                                                                                                                                                                                                                                                                |
| `user_plans`                                                  | `user_id`, `plan_code`, `source`, `purchase_id`, `granted_by`, `status (active/revoked)`, `granted_at`, `revoked_at`, `credits_granted jsonb` (`{main, audio, agency}`, jo is grant pe diye gaye; refund pe yahi wapas katte hain)                                                                                                                                                                                                                                                                                                                                                       |
| `purchases`                                                   | `user_id`, `platform (manual/csv/warriorplus/jvzoo/launchpad)`, `txn_id`, `product_id`, `amount`, `status`, `raw jsonb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `webhook_events`                                              | `platform`, `event`, `txn_id`, `payload jsonb`, `processed`, `error`; unique `(platform, txn_id, event)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `credit_balances`                                             | `user_id`, `pool (main/audio/agency)`, `balance`; unique `(user_id, pool)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `credit_ledger`                                               | `user_id` (jiska pool), `acting_user_id` (jisne job chalaya; agency client case me alag), `pool`, `amount (+/−)`, `status (grant/reserved/committed/refunded/adjust/revoked)`, `user_plan_id` (grant/revoked entries ke liye; unique `(user_plan_id, pool) where status='grant'`), `job_id`, `reason`, `actor_id`                                                                                                                                                                                                                                                                        |
| `credit_costs`                                                | `action pk` (§4.1 keys), `credits`, `pool`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pen_names`                                                   | `user_id`, `name`, `bio`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `series`                                                      | `user_id`, `title`, `idea`, `genre`, `is_fiction`, `tone`, `audience`, `pen_name`, `planned_books`, `language ('en')`, `settings jsonb (trim, paper, bleed, pov, tense, autoCovers)`, `arc jsonb`, `cover_style jsonb`, `template_id`, `status (draft/active/completed/archived)`, `deleted_at`                                                                                                                                                                                                                                                                                          |
| `series_bible`                                                | `series_id`, `data jsonb` (characters, locations, world, timeline, threads, glossary, style), `version`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bible_versions`                                              | `series_id`, `version`, `data jsonb`, `source (ai/user)`, `book_id`, `chapter_id`, `diff jsonb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `books`                                                       | `series_id`, `part_number`, `title`, `subtitle`, `premise`, `length_preset`, `status (locked/ready/generating/generated/failed)`, `outline jsonb`, `summary`, `word_count`, `metadata jsonb (blurb, keywords[], categories[])`, `continuity_report jsonb`, `prompt_version`                                                                                                                                                                                                                                                                                                              |
| `chapters`                                                    | `book_id`, `number`, `title`, `content (TipTap JSON)`, `content_text`, `summary`, `word_count`, `status`, `search tsvector`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `chapter_versions`                                            | `chapter_id`, `content`, `source (ai/user/rewrite)`, `created_by`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `covers`                                                      | `book_id` (ya `box_set_id`), `type (ebook/paperback/audiobook/boxset)`, `art_path`, `final_path`, `layers jsonb`, `mode (overlay/ai_text)`, `is_active`, `page_count` (paperback wrap ke liye), `stale bool`                                                                                                                                                                                                                                                                                                                                                                             |
| `images`                                                      | `user_id`, `path`, `source (ai/upload)`, `prompt` (Library ke liye)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `exports`                                                     | `book_id`/`series_id`/`box_set_id`, `formats[]`, `files jsonb`, `status`, `expires_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `box_sets`                                                    | `series_id`, `title`, `book_ids[]`, `description`, `cover_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `audiobooks`                                                  | `book_id`, `voice`, `speed`, `status`, `chapters jsonb (path, duration)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `jobs`                                                        | `user_id` (jisne chalaya), `type (series_plan/book/chapter_rewrite/cover/export/audiobook/boxset/enhance/arc_extend/seed)`, `ref_id`, `status (queued/active/completed/failed/cancelled)`, `progress (0–100)`, `step_label`, `meta jsonb`, `error`, `attempts`, `credits_reserved`, `ledger_id`, `idempotency_key text unique` (format `book-{id}-v{n}`; `:` allowed nahi, BullMQ restriction), `heartbeat_at`, `cancel_requested bool default false`, `queued_at`, `started_at`, `finished_at`. Partial unique index: `(user_id) where type = 'book' and status in ('queued','active')` |
| `ai_usage_log`                                                | `user_id`, `job_id`, `provider`, `model`, `input_tokens`, `output_tokens`, `images`, `audio_seconds`, `cost_usd`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `templates`                                                   | `slug (unique)`, `category`, `name`, `badge`, `tier (lite/full)`, `description`, `concept`, `characters jsonb`, `arc jsonb`, `tone`, `audience`, `suggested_parts`, `cover_path`, `is_active`, `sort`                                                                                                                                                                                                                                                                                                                                                                                    |
| `dfy_ideas` / `dfy_packs`                                     | `niche`, `content`, `tier`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `agency_clients`                                              | `owner_id`, `client_id`, `status`, `allotment int default 100`, `used int default 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `reseller_licenses`                                           | `owner_id`, `customer_id`, `status`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `training_modules` / `training_lessons` / `training_progress` | standard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `franchise_assets`                                            | `title`, `type`, `path`, `sort`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `notifications`                                               | `user_id`, `type`, `title`, `body`, `link`, `read_at`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `app_settings`                                                | `key`, `value jsonb` (email, integrations, upgrade URLs, model overrides, maintenance); secrets server-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `audit_log`                                                   | `actor_id`, `action`, `target`, `meta jsonb`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**RLS rules (summary):**

- User sirf apni rows dekh/edit kar sakta hai (`user_id = auth.uid()`). Child tables (books, chapters, etc.) series ownership ke through check hoti hain.
- Agency owner apne clients ki series read-only dekh sakta hai.
- `templates`, `training_*`, `franchise_assets`: authenticated users read kar sakte hain (entitlement check app layer me).
- `app_settings`, `webhook_events`, `audit_log`, `ai_usage_log`: koi user-level policy nahi. Admin panel inhe server side pe `requireAdmin()` ke baad service role se padhta hai. Secrets (SMTP password, webhook secrets) `pgcrypto` se encrypted rehte hain aur kabhi client ko nahi bheje jaate.
- Credits ke saare changes sirf server-side Postgres functions se honge (`grant_plan_credits`, `reserve_credits`, `commit_credits`, `refund_credits`, `adjust_credits`, `revoke_plan_credits`) jo `SECURITY DEFINER` + row lock (`FOR UPDATE`) use karte hain, taaki race condition na ho.
- **Realtime:** `jobs`, `books`, `notifications` tables `supabase_realtime` publication me add hongi. Realtime RLS respect karta hai, toh user ko sirf apni rows ke events milenge.

---

## 13. Job Queue Design (BullMQ)

| Queue    | Jobs                                                                       | Concurrency (default)                            |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `text`   | series_plan, book (chapters loop), enhance, rewrite, metadata, arc_extend  | 50 (I/O-bound; asli limit OpenRouter rate limit) |
| `image`  | cover, template cover                                                      | 5                                                |
| `export` | epub/pdf/docx/zip, box set                                                 | 2 (Chromium heavy)                               |
| `audio`  | audiobook                                                                  | 3                                                |
| `system` | export cleanup (daily), trash purge (daily), stuck-job reaper (har 10 min) | 1                                                |

- Book job ek **parent job** hai. Har chapter ka progress `jobs.progress` me jata hai, aur resume ke liye checkpoint `chapters.status` me rehta hai.
- Har job ka **idempotency key** hota hai (`book-{id}-v{n}`; BullMQ custom job IDs me `:` allowed nahi), toh double-click se duplicate job nahi banta.
- Stuck-job reaper (har 10 min): worker har 15s heartbeat bhejta hai. Jis `active` job ki heartbeat 5 min se nahi aayi, use re-queue kiya jata hai (max 2 baar), uske baad fail + refund. Jo `queued` job 10 min se BullMQ me exist hi nahi karti (enqueue beech me fail hua), use re-add ya cancel + refund kiya jata hai.
- Graceful shutdown: worker SIGTERM pe current chapter khatam karke rukta hai.

---

## 14. Security

- Saari secrets (`OPENROUTER_API_KEY`, `REPLICATE_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, SMTP pass, webhook secrets) sirf server/worker env me rahengi, client bundle me kabhi nahi.
- Supabase RLS sab tables pe ON. Service role sirf worker aur server routes use karenge.
- Admin routes pe middleware role check + server-side re-check.
- Webhooks: signature/secret verify, idempotency, aur toggle OFF hone pe 404.
- Rate limiting (Redis): login 10/min/IP, AI actions 30/min/user, webhooks 100/min/IP.
- Uploads: MIME + size validation (images ≤ 10MB), aur filenames server-side regenerate honge.
- User input jo prompts me jata hai, wo delimited blocks me jayega (prompt-injection mitigation), aur output Zod se validate hoga.
- TipTap content render karte waqt sanitize hoga (XSS se bachne ke liye). Exports bhi sanitized HTML se banenge.
- Passwords: auto-generated 14 chars. Admin ko sirf create/reset ke waqt ek baar dikhta hai, plain text DB me store nahi hota.
- HTTPS (Caddy auto-TLS), secure cookies, CSP headers.
- Daily DB backups (Supabase cloud plan ke hisaab se) + Storage lifecycle rules.

---

## 15. Non-Functional Requirements

| Area                     | Target                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Book generation time     | Short ~3–5 min, Standard ~8–12 min, Full ~15–25 min                                                                                                                                                                                                                                  |
| Cover generation         | < 60s                                                                                                                                                                                                                                                                                |
| Export (EPUB+PDF+DOCX)   | < 2 min per book                                                                                                                                                                                                                                                                     |
| UI                       | Dashboard load < 2s, Lighthouse perf ≥ 85                                                                                                                                                                                                                                            |
| Concurrency (launch day) | 1,000+ accounts provision (admin CSV import, 500 rows < 5 min). 200+ book jobs queue me: text concurrency 50 pe ~1 ghante me clear hona chahiye (estimate; T8.4 load test se verify). VPS: 8 vCPU / 16 GB recommended; worker horizontally scale ho sakta hai                        |
| Reliability              | Job failure pe auto-retry, auto-refund, aur resume                                                                                                                                                                                                                                   |
| AI cost                  | Provisional estimate: Standard book (text + cover) ≈ $0.07–0.15 (V4 Flash ki listed pricing aur ARCH §5.3 context budget se; V4.1 Flash pricing abhi verify nahi). Real number T2.21 me measure hoga, aur credit costs usi pe tune honge. Real costs `ai_usage_log` se monitor honge |

---

## 16. Repository Structure

```
booksaga/
├─ apps/
│  ├─ web/                 # Next.js app (UI, API routes, admin, webhooks)
│  └─ worker/              # BullMQ worker (pipelines, prompts, exporters, cron)
├─ packages/
│  ├─ shared/              # Zod schemas, types, entitlements, credit costs, constants
│  ├─ ai/                  # OpenRouter + Replicate clients, retries, usage logging
│  └─ exporters/           # epub, pdf (paged.js), docx, cover-wrap, audio (ffmpeg)
├─ supabase/
│  ├─ migrations/          # SQL migrations (single source of truth)
│  ├─ seed.sql             # plans, credit costs, local admin
│  └─ config.toml
├─ scripts/                # seed-templates.ts, seed-dfy.ts, create-admin.ts
├─ docker/                 # Dockerfiles (web, worker), Caddyfile, docker-compose.dev.yml, docker-compose.prod.yml
└─ docs/                   # PRD.md, ARCHITECTURE.md, TASKS.md, REVIEW.md
```

Package manager: pnpm workspaces.

---

## 17. Milestones

| #   | Milestone            | Deliverables                                                                                                                                                                                                                    |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Foundation           | Monorepo, local Supabase (Docker), migrations, auth (no public signup), roles, design system + sidebar layout, admin: create user / copy credentials / grant plans / credits                                                    |
| M2  | Core Generation      | Create Series form, Enhance with AI, Series Plan + Bible, Book pipeline (chapter loop, bible updates, continuity check, metadata), BullMQ worker, realtime progress, credit reserve/commit/refund                               |
| M3  | Roadmap & Editing    | Series Roadmap (lock/unlock, add parts), My Series, Series Bible editor + history, TipTap chapter editor + AI rewrite, Dashboard stats, notifications                                                                           |
| M4  | Covers               | gpt-image-2 integration, overlay Cover Studio (Konva), series style lock, AI Text Mode, Library/Upload, Image Editor                                                                                                            |
| M5  | Exports & Preview    | EPUB3, Print PDF (trim sizes, margins), DOCX, Metadata, ZIP, KDP Preview (pdf.js) + pre-flight checks, KDP Upload Guide                                                                                                         |
| M6  | OTO Features         | Entitlement gating + upgrade CTAs, Full-length preset, Paperback full-wrap, Box Set Builder, Templates (seed script + CRUD + UI), DFY ideas/packs, Audiobook (Kokoro + ffmpeg, ACX), Agency, Reseller + Franchise kit, Training |
| M7  | Admin & Integrations | Full admin panel (Section 9), CSV bulk import, W+/JVZoo adapters (OFF), SMTP email system (OFF), audit log, AI cost dashboard, job monitor                                                                                      |
| M8  | Hardening & Launch   | Rate limits, security review, load test (queue), epubcheck validation, prod Docker + Caddy on VPS, `supabase db push` to cloud, prod seed, backups, smoke tests                                                                 |

---

## 18. Risks & Compliance Notes

| Risk                                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **KDP AI-content policy:** KDP pe AI-generated content disclose karna mandatory hai, aur naye titles per day ki limit bhi hai | KDP Upload Guide + metadata file me disclosure reminder. UI me "Publish responsibly" note, aur auto-publish scheduler ke docs me ye limit mention hogi                                                                                                                                                                         |
| Low-quality/repetitive AI text, jisse returns aur bad reviews aayenge                                                         | Chapter-wise generation, anti-slop rules, continuity pass, editor + rewrite tools                                                                                                                                                                                                                                              |
| Lifetime deal pe AI cost                                                                                                      | **One-time credits** (koi monthly refill nahi), isliye har buyer ka max AI cost fix hai: FE 300 credits ≈ $1.5–2.5. Reseller customers 100 credits. Agency clients ek fixed one-time agency pool share karte hain. Daily caps + concurrency limits + cost dashboard. T2.21 ke real cost numbers ke baad credit amounts re-tune |
| Credits khatam, packs nahi                                                                                                    | Upgrade CTA OTO sales pages pe le jaata hai (pages launch ke baad bhi live rakhne honge), aur admin manually bonus credits de sakta hai. FE ke credits thode generous rakhe (300) taaki buyer ko value mile                                                                                                                    |
| Launch-day load                                                                                                               | Queue-based architecture, text concurrency 50 (I/O-bound), worker horizontally scale, Redis rate limiting. T8.4 load test se actual queue wait measure                                                                                                                                                                         |
| Launch-day credential delivery                                                                                                | App ke scope ke bahar: team ka apna thank-you page. App sirf admin create/CSV import + credentials copy/download deta hai                                                                                                                                                                                                      |
| Model availability/price change (OpenRouter/Replicate)                                                                        | Provider layer + config se model swap, aur admin override                                                                                                                                                                                                                                                                      |
| gpt-image-2 text spelling errors                                                                                              | Default overlay mode (Option C)                                                                                                                                                                                                                                                                                                |
| Sales copy me earnings claims ("$427/day") se FTC/affiliate-platform compliance risk                                          | BookSaga ki sales page me income claims ke saath disclaimer, ya unhe avoid karna (marketing team decide karegi; app scope ke bahar)                                                                                                                                                                                            |
| Trademark/brand                                                                                                               | "BookSaga" name ka domain + trademark check launch se pehle                                                                                                                                                                                                                                                                    |

---

## 19. Open Items (build ke dauran confirm karne hain)

1. Exact OpenRouter pricing (DeepSeek V4.1 Flash) aur Replicate pricing (gpt-image-2 low, Kokoro) pe actual cost measure karke credit costs fine-tune karna (T2.21).
2. OpenRouter pe V4.1 Flash ke liye prompt caching support aur uska discount verify karna (M2).
3. gpt-image-2 (Replicate) ke exact input schema verify karna: supported sizes (1856×2784), quality values, reference-image input (M4, T4.2).
4. Kokoro voice list aur quality final karna (M6).
5. WarriorPlus / JVZoo payload formats aur verification method unke current docs se verify karna (T7.5).
6. BookSaga logo + brand colors final karna (design system Section 8.0 ke hisaab se).
7. Upgrade/OTO sales page URLs (admin settings me daalne hain).
8. Production domain aur VPS provider.
9. Legal pages ka final text (Terms, Privacy, Refund, AI disclosure).

## 20. Change Log

- **v1.2 (23 Oct 2026):** Credits **one-time** kar diye (monthly reset, anchor day, 60-din inactivity pause sab hata diye). Amounts: FE 300, U-Lite +1,000, U +3,000, AB-Lite +300 / AB +1,000 audio, Ag-Lite +2,000 / Ag +5,000 agency pool, reseller customer 100. Credits stack hote hain. Credit packs feature poora hata diya (pure JV: FE + OTOs + downsells). Agency client monthly cap → one-time allotment. Refund pe us plan ke diye credits wapas katte hain (0 se neeche nahi).
- **v1.1 (23 Oct 2026):** REVIEW.md ke valid points + 3 decisions apply kiye: (1) credits lifetime monthly, reseller customers 50/month, 60-din inactivity pause; (2) agency clients ke liye alag agency pool (1,000 / 3,000); (3) launch credential delivery team ke thank-you page se (app scope ke bahar). Saath me: entitlement matrix legend, jobs schema columns, anchor day rule, refund cap, cancel policy, BullMQ key format, concurrency/reaper values, buckets, realtime publication, art resolution, legal pages, series settings tab.
