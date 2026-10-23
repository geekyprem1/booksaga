# BookSaga — Implementation Tasks

Reference: [`PRD.md`](./PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) (dono v1.2; changes PRD §20)

Format: `- [ ] ID — Task` ke neeche _Done when_ (acceptance criteria) aur _Depends_ (dependencies). Har milestone ke end me ek **Exit check** hai, jo pass hone pe hi agla milestone shuru hoga.

Legend: 🧱 infra · 🗄️ DB · 🎨 UI · ⚙️ worker/backend · 🤖 AI · 🧪 test

---

## M1 — Foundation

### 1.1 Repo & Tooling

- [x] **T1.1** 🧱 pnpm monorepo setup (`apps/web`, `apps/worker`, `packages/{shared,ai,exporters,db-types,config}`), turbo, TypeScript strict, ESLint, Prettier, exact-pinned deps (`.npmrc save-exact=true`)
  - _Done when:_ `pnpm build`, `pnpm lint` aur `pnpm typecheck` root se pass hon.
- [x] **T1.2** 🧱 `.env.example` (ARCH §12.3), env loader with zod validation (`packages/shared/env.ts`), aur app start pe fail-fast
  - _Done when:_ koi required env missing ho toh clear error message aaye.
  - _Depends:_ T1.1
- [x] **T1.3** 🧱 `docker/docker-compose.dev.yml` (redis + optional worker profile), README me local setup steps
  - _Done when:_ `supabase start` + `docker compose up redis` + `pnpm dev` se app localhost:3000 pe khule.
  - _Depends:_ T1.1
- [x] **T1.4** 🧪 Vitest setup (root + packages), Playwright setup (`apps/web/e2e`)
  - _Done when:_ sample unit test aur sample e2e test pass hon.
  - _Depends:_ T1.1

### 1.2 Database Foundation

- [x] **T1.5** 🗄️ Supabase init (`supabase/config.toml`: signup disabled, site URL, Inbucket)
  - _Done when:_ `supabase start` chale, aur Studio me signup OFF dikhe.
- [x] **T1.6** 🗄️ Migration `0001_init.sql`: `profiles` (incl. `last_active_at`, `credentials_pending`), `plans` (pk `code`, `grant_main_credits`, `grant_audio_credits`, `grant_agency_credits`), `user_plans` (`credits_granted jsonb`), `purchases`, `credit_balances` (pools main/audio/agency, unique `(user_id, pool)`, koi period columns nahi), `credit_ledger` (`acting_user_id`, `user_plan_id`, status `grant/reserved/committed/refunded/adjust/revoked`, unique grant per `(user_plan_id, pool)`), `credit_costs` (pk `action`, `pool`), `app_settings` (pk `key`), `audit_log`, `notifications`, `jobs` (PRD §12 ke saare columns: `idempotency_key unique`, `ledger_id`, `heartbeat_at`, `cancel_requested`, `meta`, timestamps), `ai_usage_log` (`cached_input_tokens` ke saath) + indexes (incl. book-job partial unique index) + `moddatetime` triggers + auth trigger (`auth.users` insert → `profiles`) + **saare 8 storage buckets** + storage policies
  - _Done when:_ `supabase db reset` clean chale, aur Storage me 8 buckets dikhen.
  - _Depends:_ T1.5
- [x] **T1.7** 🗄️ Migration `0002_rls.sql`: helper functions (`is_admin`, etc.) + RLS policies (M1 tables) + `alter publication supabase_realtime add table jobs, notifications` (`books` table M2 me banti hai, uska add T2.1 ki migration me)
  - _Done when:_ RLS test (T1.10) pass ho, aur local Realtime pe `jobs` update event client tak aaye.
  - _Depends:_ T1.6
- [x] **T1.8** 🗄️ Migration `0003_credits_fns.sql`: `grant_plan_credits` (one-time, idempotent; reseller customer → main 100), `reserve_credits` (agency client allotment ke saath), `commit_credits`, `refund_credits`, `adjust_credits`, `revoke_plan_credits` (SECURITY DEFINER, sirf service_role ko execute). Koi reset function ya cron nahi
  - _Done when:_ T1.11 pass ho.
  - _Depends:_ T1.6
- [x] **T1.9** 🗄️ `packages/shared/plans.ts` (11 plans ka matrix, PRD §3.2, legend ke hisaab se har cell filled), `packages/shared/credits.ts` (`CreditAction` union = PRD §4.1 keys), `packages/shared/genres.ts` (PRD §8.3 canonical list + template category mapping) + `seed.sql` (plans, credit_costs, default app_settings) + `pnpm gen:types` script
  - _Done when:_ seed ke baad DB me 11 plans aur saare credit costs hon, aur `packages/db-types` generate ho.
  - _Depends:_ T1.6
- [x] **T1.10** 🧪 RLS tests: user A user B ka koi data read/write na kar sake, non-admin admin tables na padh sake
  - _Depends:_ T1.7
- [x] **T1.11** 🧪 Credit function tests: 20 parallel `reserve_credits` pe overspend na ho, commit/refund idempotent hon, insufficient balance pe exception, same `user_plan` pe `grant_plan_credits` do baar chalane se credits double na hon, FE + U-Lite + U = 4,300 stack ho, agency client allotment enforce ho, `revoke_plan_credits` us plan ke credits kaate aur balance 0 se neeche na jaye
  - _Depends:_ T1.8

### 1.3 Shared Logic

- [x] **T1.12** ⚙️ `resolveEntitlements()` + `resolveCreditSource()` + `assertCan()` + `AppError` codes (ARCH §3.3, §9.1)
  - _Done when:_ unit tests me har plan combination (FE only, FE+OTO1, FE+OTO1_lite+OTO1, agency client → owner ka agency pool, reseller customer → FE features) ka expected output aaye.
  - _Depends:_ T1.9

### 1.4 Auth & Shell

- [x] **T1.13** 🎨 Theme tokens (Tailwind preset), shadcn install + theming, fonts, BookSaga logo placeholder
  - _Done when:_ dark neon theme (PRD §8.0) sample page pe sahi dikhe.
  - _Depends:_ T1.1
- [x] **T1.14** ⚙️ `@supabase/ssr` clients (server/client/admin server-only), `requireUser`, `requireAdmin`, middleware (session refresh, `/admin` guard, suspended → sign out, maintenance mode, throttled `last_active_at` touch (analytics only))
  - _Depends:_ T1.6
- [x] **T1.15** 🎨 Login page (email + password), logout, "Forgot password" link sirf jab email ON ho
  - _Done when:_ seeded user login kar sake, aur suspended user login na kar paye.
  - _Depends:_ T1.14
- [x] **T1.16** 🎨 App shell: Sidebar (PRD §8.0 order, lock icons via entitlements), Topbar (⌘K placeholder, CreditsPill, NotificationBell placeholder, user menu), responsive (mobile drawer)
  - _Depends:_ T1.12, T1.13
- [x] **T1.17** ⚙️ `scripts/create-admin.ts` (CLI: email, name, password generate, role=admin)
  - _Done when:_ script chalane ke baad admin `/admin` khol sake.
  - _Depends:_ T1.14

### 1.5 Admin Basics

- [x] **T1.18** ⚙️ `ProvisioningService` core: `upsertUser`, `grantPlan` (+ `grant_plan_credits`), `revokePlan` (+ `revoke_plan_credits`), password generator (14 chars), `credentials_pending` flag, audit logging
  - _Done when:_ unit/integration tests me plan grant hone pe us plan ke one-time credits balance me judein, aur revoke ke baad entitlements + credits update hon.
  - _Depends:_ T1.8, T1.12
- [x] **T1.19** 🎨 Admin → Users: list (search/filter/pagination), Create User (name, email, plans multi-select), "Copy Login Details" modal (email + password + login URL, sirf ek baar dikhe), Edit, Suspend/Activate, Reset Password (naya password + copy), Grant/Revoke plans (FE + har OTO + downsell), Credits adjust (reason required, pool select), **Pending credentials tab** + "Mark as sent"
  - _Done when:_ admin user bana ke credentials copy kare, aur us user se login ho jaye. Ye launch-critical hai: Launchpad buyers isi se banenge (delivery team ka thank-you page karega).
  - _Depends:_ T1.18
- [x] **T1.20** 🎨 Admin → Audit Log (list + filters)
  - _Depends:_ T1.18

**Exit check M1:** Local Docker Supabase pe admin user banaye → plans assign kare → user login kare → sidebar me plan ke hisaab se locks dikhen → credits pill me balance dikhe. Saare tests pass hon.

**M1 status: DONE (23 Oct 2026).** Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; 40 unit + 61 DB tests (`pnpm test:all`) and 14 Playwright e2e tests (`pnpm test:e2e`) pass against the real local Supabase.

**M1 build notes (deviations from the plan above):**

- Local Supabase uses ports **55320–55329** (API 55321, DB 55322, Studio 55323, Mailpit 55324) because other Supabase projects on this machine already use 54xxx.
- `agency_clients` was created in T1.6 (not T6.16): `reserve_credits` references it. T6.16 now only adds the client-series RLS.
- Plans, credit costs and app settings ship in migration `0004_reference_data.sql` (not `seed.sql`), so `supabase db push` gives production the same data. A DB test keeps it in sync with `packages/shared`.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. Suspended/admin checks run in `requireUser()` / `requireAdmin()`, not in the proxy.
- New package `packages/core` holds the service-role domain logic (ProvisioningService, credit wrappers, account loading, audit) shared by web, worker and scripts. There is no `packages/config`.
- Pinned TypeScript 5.9.3 and ESLint 9.39.5 on purpose: TypeScript 7 (native port) and ESLint 10 are too new for the Next 16 / typescript-eslint toolchain.
- Not done in M1 on purpose: Redis health in `/api/healthz` (M2), real notifications bell and ⌘K search (M3), forgot-password page (M7).

---

## M2 — Core Generation

### 2.1 Schema

- [x] **T2.1** 🗄️ Migration `0004_series.sql`: `pen_names`, `series` (status `draft/active/completed/archived`), `series_bible`, `bible_versions`, `books`, `chapters`, `chapter_versions` + indexes + full-text columns + RLS (`owns_series`) + `books` ko `supabase_realtime` publication me add
  - _Depends:_ T1.7

### 2.2 AI Layer

- [x] **T2.2** 🤖 `packages/ai/openrouter.ts`: chat completions, JSON mode, timeouts, retries (ARCH §5.2), usage + cost return
- [x] **T2.3** 🤖 `packages/ai/json.ts`: zod validate + repair loop (max 2)
  - _Depends:_ T2.2
- [x] **T2.4** 🤖 `packages/ai/usage.ts`: `ai_usage_log` writer (cached input tokens alag), price table (config/admin override)
  - _Depends:_ T2.2
- [x] **T2.5** 🤖 `AI_MODE=mock` provider: deterministic fixtures (series plan, outline, chapter, summary, metadata)
  - _Done when:_ poora pipeline mock mode me bina network ke chale.
  - _Depends:_ T2.2

### 2.3 Worker & Queue

- [x] **T2.6** ⚙️ Worker boot: queues (ARCH §4.1; text concurrency 50, export 2), `WORKER_QUEUES` env, concurrency env, provider rate limiters, graceful shutdown, `/healthz`
  - _Depends:_ T1.3
- [x] **T2.7** ⚙️ `worker/lib/jobs.ts`: status transitions, progress/step_label, heartbeat (15s), cancel check, commit/refund on finish
  - _Depends:_ T2.6, T1.8
- [x] **T2.8** ⚙️ `web/lib/queue.ts` `enqueueJob()`: idempotent insert (key format `{type}-{refId}-v{n}`, koi `:` nahi), `resolveCreditSource` → reserve credits, queue add, `queue.add` fail hone pe compensating refund + `cancelled` (ARCH §4.2), per-user book job limit (partial unique index → `JOB_ALREADY_RUNNING`), daily cap
  - _Done when:_ double-click pe ek hi job bane; 2 parallel requests me sirf 1 book job bane; kam balance pe `INSUFFICIENT_CREDITS` aaye; Redis band karke enqueue karo toh credits wapas aa jayein.
  - _Depends:_ T2.7
- [x] **T2.9** ⚙️ System cron: `stuck_reaper` (10 min; stale heartbeat 5 min + orphan queued jobs 10 min). (Credit reset cron nahi hai, credits one-time hain)
  - _Done when:_ active job ke worker ko kill karne pe job re-queue ho, aur 2 baar ke baad fail + refund ho. Orphan queued job (DB me hai, BullMQ me nahi) re-add ho.
  - _Depends:_ T2.7

### 2.4 Pipeline

- [x] **T2.10** 🤖 Prompts v1 (`worker/src/prompts/v1/`): seriesPlan, bookOutline, chapter, summarizeExtract, continuityCheck, paragraphFix, metadata, enhanceIdea, suggestions. Saath me style guide + anti-slop list, fiction/non-fiction aur children's variants
  - _Done when:_ prompt builder unit tests (snapshot) pass hon.
- [x] **T2.11** ⚙️ Zod schemas (`packages/shared/schemas/ai.ts`): SeriesPlan, Bible, BookOutline, ChapterExtract, ContinuityReport, BookMetadata
- [x] **T2.12** ⚙️ `pipeline/context.ts` `buildChapterContext()` (compact bible, input ~15–40k token budget ARCH §5.3, static blocks pehle for prefix caching)
  - _Depends:_ T2.11
- [x] **T2.13** ⚙️ `pipeline/bibleMerge.ts` (stable ids, user-source protection, conflicts[], versioning)
  - _Done when:_ unit tests: user field overwrite na ho, conflict record ho.
  - _Depends:_ T2.11
- [x] **T2.14** ⚙️ `shared/markdownToTiptap.ts` + `exporters/html/render.ts` (TipTap → HTML)
  - _Done when:_ round-trip tests (scene breaks, italic, bold) pass hon.
- [x] **T2.15** ⚙️ `processors/text/book.ts`: full pipeline (ARCH §6): series plan (part 1), outline, chapter loop, continuity + fix, metadata, next part unlock, resumability
  - _Done when:_ mock mode me Short book ban jaye. Chapter 4 pe worker kill karke restart karo, toh chapter 4 se resume ho. Credits commit hon.
  - _Depends:_ T2.5, T2.7, T2.10, T2.12, T2.13, T2.14
- [x] **T2.16** ⚙️ `processors/text/enhance.ts` + `suggestions.ts` (priority 1)
  - _Depends:_ T2.10

### 2.5 UI

- [x] **T2.17** 🎨 Create Series page (PRD §8.3): form + validation, pen name select/add, collapsible Book 1 & Publishing Settings, length presets (Full locked agar plan me nahi), credit cost dikhe button pe, hero banner
  - _Depends:_ T2.1, T1.16
- [x] **T2.18** 🎨 Enhance with AI flow (job → result preview → "Apply")
  - _Depends:_ T2.16, T2.17
- [x] **T2.19** 🎨 Generate Part 1 → live progress modal ("Writing chapter X of Y"), realtime `useJob` hook + polling fallback, success modal "Series Foundation Saved" (Continue This Series / View Series), failure state + Retry
  - _Depends:_ T2.15, T2.17
- [x] **T2.20** 🎨 AI Assistant & Tools panel (AI Suggestions, Auto-Generate Covers toggle, Series Continuity link, Publishing Structure, Auto/Library/Upload tabs; cover parts M4 tak "coming" state)
  - _Depends:_ T2.17

### 2.6 Live AI Calibration

- [x] **T2.21** 🤖🧪 Real OpenRouter key se 1 Short + 1 Standard + 1 Full book generate karo. Har ek ka quality review, time, tokens (cached vs uncached) aur cost record karo. OpenRouter pe V4.1 Flash ki pricing aur prompt caching support verify karo. Prompts tune karo, aur `docs/COST_REPORT.md` me numbers likho
  - _Done when:_ actual cost/time PRD §15 estimates ke saath compare ho, aur credit costs (PRD §4.1) + plan ke one-time credits (FE 300 / U-Lite 1,000 / U 3,000 / reseller customer 100 / agency pools) final ya update hon. Ye **economics gate** hai: agar cost estimate se bahut zyada aaye toh M3 se pehle numbers re-decide karne hain.
  - _Depends:_ T2.15

**Exit check M2:** User idea daale → Enhance kare → Generate Part 1 kare → live progress dikhe → book (chapters + bible + metadata) DB me ho → credits kate → fail ho toh refund ho.

---

## M3 — Roadmap, Editing, Dashboard

- [x] **T3.1** 🎨 Series detail → Roadmap (PRD §8.4): part cards (generated/ready/locked/generating/failed), realtime updates, per-part length select, Generate Part N (sequential rule enforced server-side), tabs shell
  - _Depends:_ T2.19
- [x] **T3.2** ⚙️🎨 Add More Parts: AI arc extend (`arc_extend` job, 1 credit), naye `books` rows (locked/ready), plan limit check (FE 5, baaki hard max 30)
  - _Depends:_ T3.1
- [x] **T3.3** 🎨 My Series (PRD §8.5): grid/list, search, filters, sort, Duplicate, Archive, Delete (soft) + Trash restore (30 din), purge cron
  - _Depends:_ T2.1
- [x] **T3.4** 🎨 Series Bible page (PRD §8.6): sections, entry CRUD (`source: user`), version history + diff + restore, conflicts list, Export Bible (DOCX)
  - _Depends:_ T2.13
- [x] **T3.5** 🎨 Book view: chapter list (drag reorder, add, delete), word count, estimated pages, reading time
  - _Depends:_ T3.1
- [x] **T3.6** 🎨 TipTap chapter editor: toolbar, scene break node, autosave (3s debounce; `content` + `content_text` sync), version snapshots (`chapter_versions`), restore version
  - _Done when:_ edit karke refresh karo toh changes rahein, aur purana version restore ho sake.
  - _Depends:_ T3.5
- [x] **T3.7** ⚙️🎨 AI editor tools: Rewrite (selection/chapter + instruction), Expand, Shorten, Regenerate chapter (diff preview → Accept/Reject), 1 credit each
  - _Depends:_ T3.6, T2.8
- [x] **T3.8** 🎨 Continuity Report panel (issues → go to paragraph, mark resolved)
  - _Depends:_ T3.6
- [x] **T3.9** 🎨 Metadata tab: title, subtitle, blurb, keywords (7, ≤50 chars validation), categories, regenerate (1 credit)
  - _Depends:_ T3.5
- [x] **T3.10** 🎨 Dashboard (PRD §8.2): hero, stat cards (credits left per pool), recent series cards with part chips, quick actions, recommended templates placeholder
  - _Depends:_ T3.1
- [x] **T3.11** ⚙️🎨 Notifications: insert helpers (worker), bell dropdown (realtime), notifications page, mark read
  - _Depends:_ T2.7
- [x] **T3.12** 🎨 Global search ⌘K (series, books, chapters, pages)
  - _Depends:_ T2.1
- [x] **T3.13** 🎨 Profile: name, avatar upload, password change, pen names CRUD
  - _Depends:_ T1.15
- [x] **T3.14** ⚙️🎨 Job cancel (UI button + confirm dialog jisme refund rule dikhe + `cancel_requested` + refund rule PRD §4.2)
  - _Depends:_ T2.15
- [x] **T3.15** 🎨 Series Settings tab (PRD §8.4): title/pen name/tone edit, planned books edit, default publishing settings, Auto-Generate Covers toggle (`series.settings.autoCovers`), cover style unlock, Archive/Delete
  - _Depends:_ T3.1

**Exit check M3:** 3-part series end-to-end: Part 1 → edit chapter → Bible edit → Part 2 (Part 2 me Bible edits respect hon) → Part 3 locked jab tak Part 2 na ho. Dashboard stats sahi hon.

---

## M4 — Covers & Image Editor

- [x] **T4.1** 🗄️ Migration `0005_covers.sql`: `covers` (`page_count`, `stale` ke saath), `images` (buckets aur unki policies T1.6 me ban chuke hain)
- [x] **T4.2** 🤖 `packages/ai/replicate.ts` image: gpt-image-2 input mapping (Replicate model schema verify karna: 1856×2784 size support, quality values, reference images), output fetch, retries, usage
  - _Done when:_ 1856×2784 low-quality image generate ho aur uska cost log ho. Agar ye size support na ho toh nearest supported size + upscale plan PRD me update karo.
- [x] **T4.3** ⚙️ Fonts pack (~30 OFL fonts self-hosted) + `exporters/cover/compose.ts` (`@napi-rs/canvas`, normalized layers JSON → JPG; server output canonical)
  - _Done when:_ same layers JSON browser (Konva) aur server dono me render ho aur screenshot-diff tolerance ke andar ho.
- [x] **T4.4** ⚙️ `processors/image/cover.ts`: prompt builder (series style + book scene + no-text / ai_text), reference image (part > 1), save original art (1856×2784), ebook crop 1600×2560, overlay compose, `covers` row, `is_active` switch
  - _Depends:_ T4.1, T4.2, T4.3
- [x] **T4.5** ⚙️ Series Cover Style: Book 1 ka cover save hote hi `series.cover_style` lock ho, aur "Unlock style" action
  - _Depends:_ T4.4
- [x] **T4.6** 🎨 Cover Studio (PRD §8.9): book select, Generate (2 credits), variations history, Konva editor (text layers, fonts, colors, effects, positions), AI Text Mode toggle + spelling warning, Save → server compose, Set active
  - _Depends:_ T4.4
- [x] **T4.7** 🎨 Cover sources: Library (user images + preset backgrounds), Upload (MIME sniff, 10MB, sharp re-encode)
  - _Depends:_ T4.1
- [x] **T4.8** ⚙️ Auto-Generate Covers toggle: book generate hone ke baad cover job enqueue ho (agar balance ho; warna notification)
  - _Depends:_ T4.4, T2.15
- [x] **T4.9** 🎨 Image Editor (standalone): crop, brightness/contrast, text, shapes, layers, export PNG/JPG
  - _Depends:_ T4.3
- [x] **T4.10** 🎨 Roadmap/Dashboard/My Series pe active covers dikhein
  - _Depends:_ T4.6

**Exit check M4:** 3-book series ke 3 matching covers (same font/layout/style, alag scenes), editor me text edit karke save ho, aur final JPG 1600×2560 ho.

---

## M5 — Exports & KDP Preview

- [x] **T5.1** 🗄️ Migration `0006_exports.sql`: `exports` table (bucket T1.6 me ban chuka hai)
- [x] **T5.2** ⚙️ Front/back matter generator (title page, copyright, TOC, Read Next with `{{NEXT_BOOK_URL}}`, About the Author, Also in this Series)
- [x] **T5.3** ⚙️ EPUB3 exporter (ARCH §8) + epubcheck test
  - _Done when:_ sample book ka EPUB epubcheck pe 0 errors de, aur Kindle Previewer/Calibre me khule.
  - _Depends:_ T2.14, T5.2
- [ ] **T5.4** ⚙️ Print PDF exporter: Paged.js templates per trim size (5×8, 5.25×8, 5.5×8.5, 6×9), mirrored margins by page count, bleed, running headers, page numbers, recto chapter starts, embedded fonts. Playwright render
  - _Done when:_ PDF page size trim (+bleed) ke barabar ho, margins spec match karein (automated check), aur actual page count save ho.
  - _Depends:_ T2.14, T5.2
- [x] **T5.5** ⚙️ DOCX exporter (headings, page breaks, TOC field, front matter)
  - _Depends:_ T2.14, T5.2
- [x] **T5.6** ⚙️ Metadata TXT + CSV (AI disclosure note ke saath)
- [x] **T5.7** ⚙️ `processors/export/book.ts` + `series.ts`: formats select, ZIP (archiver stream), upload, `exports` row, 30-day expiry, notification. Re-export free (0 credits)
  - _Depends:_ T5.3–T5.6
- [ ] **T5.8** ⚙️ Export cleanup cron (expired files delete)
  - _Depends:_ T5.7
- [x] **T5.9** ⚙️ `/api/files/[...path]`: ownership check → 5-min signed URL redirect
  - _Depends:_ T5.1
- [x] **T5.10** 🎨 KDP Publishing (Exports hub): per-book/series export, history, downloads, status
  - _Depends:_ T5.7
- [ ] **T5.11** 🎨 KDP Preview (PRD §8.10): pdf.js viewer (thumbnails, page X/N, zoom, fit, download), Ebook preview mode (HTML), Pre-flight checks panel
  - _Depends:_ T5.4
- [ ] **T5.12** 🎨 KDP Upload Guide page (ebook, paperback, series linking, KDP Select/KU, AI disclosure, Read Next link replace karna)

**Exit check M5:** Ek generated book ka ZIP download ho, jisme valid EPUB, sahi trim size wala PDF, DOCX, cover JPG aur metadata ho. Preview me PDF dikhe aur pre-flight warnings sahi hon.

---

## M6 — OTO Features

### 6.1 Gating

- [ ] **T6.1** 🎨 `<Gate>`, LockedCard, UpgradeCTA, `/upgrade/[planCode]` (admin settings ke external OTO URL pe redirect). Server-side `assertCan` har OTO action pe
  - _Depends:_ T1.12

### 6.2 OTO1 — Unlimited

- [ ] **T6.2** ⚙️ Full-length preset unlock (FE pe server-side reject)
  - _Depends:_ T6.1, T2.15
- [ ] **T6.3** ⚙️🎨 Paperback full-wrap cover: `wrap.ts` dimensions, back cover (blurb, author, barcode zone), spine text rule (≥79 pages), PDF 300 DPI (pdf-lib), export me include. Sirf print PDF ke actual page count ke baad generate ho; page count badle toh `stale` + pre-flight warning + free regenerate
  - _Done when:_ 6×9, 200 pages, white paper ka wrap width = 0.125+6+0.4504+6+0.125 in ho, front art effective DPI ≥ 300 ho, aur book edit karke page count badalne pe wrap stale dikhe.
  - _Depends:_ T5.4, T4.3
- [ ] **T6.4** 🗄️⚙️🎨 Box Set Builder: `box_sets` table, books select, combined EPUB (nested TOC, dividers), box set cover (2 credits), AI description, export
  - _Depends:_ T5.3, T4.4

### 6.3 OTO2 — Done-For-You

- [ ] **T6.5** 🗄️ Migration: `templates`, `dfy_ideas`, `dfy_packs` (bucket T1.6 me)
- [ ] **T6.6** ⚙️🤖 `seed_templates` job + `scripts/seed-templates.ts`: 12 categories × 10, DeepSeek se template JSON, gpt-image-2 se sample cover. Idempotent (slug), progress admin pe dikhe, tier assign (40 lite)
  - _Done when:_ 120 templates + covers DB me hon, aur dobara run karne pe duplicates na banein.
  - _Depends:_ T6.5, T4.2
- [ ] **T6.7** ⚙️🤖 `scripts/seed-dfy.ts`: 500+ DFY series ideas by niche, blurb templates, keyword packs by genre
  - _Depends:_ T6.5
- [ ] **T6.8** 🎨 Series Templates page (PRD §8.8): hero, category tabs, search, cards (badge, cover), lite/full gating, template detail, "Use This Template" → Create Series prefill
  - _Depends:_ T6.6, T2.17
- [ ] **T6.9** 🎨 DFY Ideas & Packs pages (browse, copy, "Use idea" → Create Series)
  - _Depends:_ T6.7
- [ ] **T6.10** 🎨 Admin → Templates/DFY CRUD + seed job trigger/status
  - _Depends:_ T6.6

### 6.4 OTO3 — Audiobook

- [ ] **T6.11** 🗄️ Migration: `audiobooks` (bucket T1.6 me)
- [ ] **T6.12** 🤖 `packages/ai/replicate.ts` TTS (Kokoro): voice, speed, chunked input, usage
- [ ] **T6.13** ⚙️ `exporters/audio`: text clean (markdown strip, scene-break pauses), chunking (~1,000 chars), ffmpeg concat + loudnorm + silence padding + MP3 192k CBR mono 44.1k, opening/closing credits, 2400×2400 cover
  - _Done when:_ ffprobe/ffmpeg test se ACX specs (RMS, peak, noise floor ≤ −60 dB, bitrate, sample rate) pass hon.
- [ ] **T6.14** ⚙️ `processors/audio/audiobook.ts` (audio credits pool, per-chapter progress, resume)
  - _Depends:_ T6.11–T6.13
- [ ] **T6.15** 🎨 Audiobook Series page: book select, curated voices + preview samples, speed, generate, chapter player, ZIP download, lite/full limits
  - _Depends:_ T6.14

### 6.5 OTO4 — Agency

- [ ] **T6.16** 🗄️ RLS: agency owner gets read-only access to client series (the `agency_clients` table already exists since T1.6)
- [ ] **T6.17** ⚙️🎨 Agency Clients page: create client (auto password, Copy Login Details), list, suspend/activate, view client series (read-only), limits 25/100, owner-plan features for clients, **agency pool** (one-time: Ag-Lite +2,000 / Ag +5,000) ka balance + har client ka allotment/used/remaining aur allotment edit, client license PDF
  - _Done when:_ client ka job owner ke agency pool se kate (owner ka main pool untouched), aur allotment khatam hone pe `CLIENT_ALLOTMENT_EXHAUSTED` aaye.
  - _Depends:_ T6.16, T1.18

### 6.6 OTO5 — Reseller & Franchise

- [ ] **T6.18** 🗄️ `reseller_licenses`, `franchise_assets` + storage
- [ ] **T6.19** ⚙️🎨 Reseller dashboard: create customer (FE account, `reseller_owner_id` set → one-time 100 credits, license consume), list, revoke (license wapas), limits 50/100
  - _Depends:_ T6.18, T1.18
- [ ] **T6.20** 🎨 Franchise kit page (sales page template, swipes, banners, demo video) + Admin → Franchise assets CRUD
  - _Depends:_ T6.18

### 6.7 Training

- [ ] **T6.21** 🗄️🎨 `training_modules`, `training_lessons`, `training_progress` + Training pages (modules, lesson embed YouTube/Vimeo, mark complete, progress) + Admin CRUD

**Exit check M6:** Har plan ke test user banao (FE, FE+OTO1, …, OTO5). Har ek ko sirf apne features milein, aur locked features server-side bhi reject hon (direct action call se test).

---

## M7 — Admin & Integrations

- [ ] **T7.1** 🎨 Admin Overview: users, active today, books (today/7d/30d), queue depth, failed jobs, AI cost (provider/action/top users)
- [ ] **T7.2** 🎨 Admin → Bulk Import: CSV upload (`email,name,plans`), dry-run preview (errors per row), confirm, result CSV (passwords, one-time download). Launchpad launch ke liye critical, isliye M7 ke shuru me banana hai
  - _Done when:_ 500-row CSV 5 min ke andar import ho, galat rows clear errors ke saath skip hon, aur existing email pe sirf plans add hon (duplicate user na bane).
  - _Depends:_ T1.18
- [ ] **T7.3** 🎨 Admin → Plans & Credits: plan limits edit, credit costs edit, daily caps
- [ ] **T7.3b** 🎨 Admin → Credit Ledger: per-user ledger view (grant/reserve/commit/refund/adjust/revoked), job links, filters
  - _Depends:_ T1.8
- [ ] **T7.4** 🎨 Admin → Purchases log (source filter, refunds)
- [ ] **T7.5** ⚙️ Webhook adapters: WarriorPlus (IPN verify + normalize), JVZoo (JVZIPN `cverify` + normalize), routes, toggle-gated (OFF → 404), `webhook_events` idempotency, sale/refund/chargeback/cancel flows (refund → `revoke_plan_credits`), email OFF hone pe `credentials_pending`
  - _Done when:_ sample payload fixtures se unit tests pass hon, aur duplicate webhook pe no-op ho. W+/JVZoo docs se payload format verify karna.
  - _Depends:_ T1.18
- [ ] **T7.6** 🎨 Admin → Integrations: toggles (default OFF), secrets (encrypted), product-ID → plan mapping, webhook URLs copy, test event, event log + replay
  - _Depends:_ T7.5
- [ ] **T7.7** ⚙️ Email system: settings encryption, Nodemailer SMTP, `sendEmail()` no-op when OFF, templates (welcome, reset, notification) with variables, test email, user notification preferences
  - _Done when:_ OFF pe koi email na jaye. ON pe local Inbucket me welcome email aaye.
- [ ] **T7.8** 🎨 Admin → Email page (toggle default OFF, SMTP config, templates editor, test). Forgot-password UI toggle se link ho
  - _Depends:_ T7.7
- [ ] **T7.9** 🎨 Admin → Jobs monitor (BullMQ counts, job list/detail, logs, retry, cancel)
- [ ] **T7.10** 🎨 Admin → Settings (app name, logo, support email, upgrade URLs per OTO, AI model overrides + price table, maintenance mode, legal pages content)
- [ ] **T7.11** 🎨 Admin "View as user" (read-only impersonation, mutations blocked, audit logged)

**Exit check M7:** Launchpad flow (CSV import → plans assign → credentials CSV/copy → login) kaam kare. W+/JVZoo OFF pe 404 aaye, aur ON + test payload pe user + plan ban jaye (aur refund payload pe plan revoke + credits cap). Email OFF/ON dono modes sahi chalein.

---

## M8 — Hardening & Launch

- [ ] **T8.1** 🧱 Rate limits (login, AI actions, webhooks, downloads) via Redis
- [ ] **T8.2** 🧱 Security headers (CSP, HSTS, frame-deny), sanitize-html on render/export, upload re-encode, `server-only` audit, `pnpm audit`
- [ ] **T8.3** 🧪 E2E Playwright suite (ARCH §15) mock AI ke saath: core user flow + admin flow + gating flow
- [ ] **T8.4** 🧪 Load test: 200 concurrent book jobs (mock AI, realistic artificial latency). Queue stable rahe, koi credit leak na ho (ledger reconcile script), aur actual queue clear time measure karke PRD §15 me update karo
- [ ] **T8.4b** 🎨 Legal pages (PRD §8.19): `/legal/terms`, `/legal/privacy`, `/legal/refund`, `/legal/ai-disclosure`, admin-editable markdown, login page + footer links
- [ ] **T8.5** 🧱 Production Dockerfiles (web standalone, worker with chromium + ffmpeg + fonts), `docker-compose.prod.yml`, Caddyfile, healthchecks, log rotation
- [ ] **T8.6** 🧱 VPS setup (8 vCPU / 16 GB): Docker, firewall (sirf 22/80/443), SSH keys, unattended upgrades, UptimeRobot
- [ ] **T8.7** 🗄️ Supabase Cloud go-live: project create → `supabase link` → `supabase db push` → auth settings (signup OFF, URLs) → storage verify → `seed-prod.ts` → admin create → templates seed job
  - _Done when:_ prod me admin login ho, aur saare migrations apply hon (`supabase migration list` match kare).
- [ ] **T8.8** 🧱 Backups: Supabase backups verify + weekly `pg_dump` offsite
- [ ] **T8.9** 🧪 Live smoke on prod (real keys): 1 Short book + cover + export + audiobook chapter. Cost aur time record
- [ ] **T8.10** 📄 Docs: README (local setup, deploy), admin runbook (users banana, CSV, refunds, failed jobs, integrations ON karna, email ON karna)

**Exit check M8 (Launch ready):** Prod pe real flow pass ho, backups set hon, monitoring ON ho, admin runbook ready ho.

---

## Dependency Overview

```
M1 Foundation ──► M2 Core Generation ──► M3 Roadmap/Editing ──┬──► M5 Exports ──┐
                         │                                    │                 ├──► M6 OTO Features ──► M7 Admin/Integrations ──► M8 Launch
                         └──────────────► M4 Covers ──────────┘─────────────────┘
```

M4 (Covers) M3 ke saath parallel chal sakta hai jab M2 complete ho jaye. M7 ke T7.5–T7.8 (webhooks, email) M2 ke baad kabhi bhi parallel ho sakte hain.
