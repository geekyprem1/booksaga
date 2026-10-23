# BookSaga — Technical Architecture

Version: 1.2 · Date: 23 Oct 2026 · Reference: [`PRD.md`](./PRD.md) (v1.2; changes PRD §20)

Ye document batata hai ki BookSaga **kaise** banega: components, data flow, module boundaries, interfaces, queue design, deployment. **Kya** banana hai, wo PRD me hai.

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────── VPS (Docker Compose) ─────────────────────────────────────────────┐
│                                                                                                                │
│   ┌──────────┐      ┌─────────────────────────────┐        ┌───────────┐        ┌──────────────────────────┐  │
│   │  Caddy   │─────►│  web (Next.js, App Router)  │──jobs─►│   Redis   │◄─jobs──│  worker (Node + BullMQ)  │  │
│   │ :80/:443 │      │  UI · Server Actions · API  │        │  BullMQ   │        │  pipelines · exporters   │  │
│   │ auto-TLS │      │  Admin · Webhooks           │        │ RateLimit │        │  cron · Chromium · ffmpeg│  │
│   └──────────┘      └──────────────┬──────────────┘        └───────────┘        └────────────┬─────────────┘  │
│                                    │                                                         │                │
└────────────────────────────────────┼─────────────────────────────────────────────────────────┼────────────────┘
                                     │ supabase-js (anon + user JWT / service role)            │ service role
                                     ▼                                                         ▼
                 ┌────────────────────────────────────────────────────────────────────────────────────┐
                 │                         Supabase (Cloud in prod / Docker local)                    │
                 │   Postgres (RLS, SQL functions)  ·  Auth  ·  Storage (buckets)  ·  Realtime        │
                 └────────────────────────────────────────────────────────────────────────────────────┘
                                                                                             │
                                          ┌──────────────────────────────────────────────────┤
                                          ▼                                                  ▼
                               OpenRouter (DeepSeek V4.1 Flash)              Replicate (gpt-image-2, Kokoro-82M)
```

### 1.1 Responsibilities

| Component    | Karta kya hai                                                                                                                                                       | Kya NAHI karta                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **web**      | Pages render karna, auth sessions, CRUD (RLS ke through), input validation, entitlement checks, credits reserve karna aur jobs enqueue karna, webhooks, admin panel | Koi bhi lambi AI call (> 10s), file generation        |
| **worker**   | Saari AI calls, book/cover/export/audio pipelines, bible updates, credits commit/refund, cron jobs                                                                  | HTTP requests serve karna (sirf `/healthz`)           |
| **Redis**    | BullMQ queues, rate limiter counters, short-lived locks                                                                                                             | Permanent data (sab Postgres me)                      |
| **Supabase** | Source of truth (data), auth, files, realtime progress push                                                                                                         | Business logic (sirf credits ke atomic SQL functions) |
| **Caddy**    | HTTPS termination, reverse proxy, gzip, security headers                                                                                                            | —                                                     |

### 1.2 Core Design Principles

1. **Postgres = single source of truth.** Redis me sirf transient queue state rahega. Job ka status `jobs` table me mirror hota hai, aur UI usi ko padhta hai.
2. **Web kabhi AI call nahi karega**, chhoti calls ("Enhance with AI") bhi nahi. Sab queue se jayengi. Isse rate limits, retries aur cost logging ek hi jagah rehte hain. Chhote jobs `priority: 1` pe chalenge taaki 2–5s me result aa jaye.
3. **Har job idempotent aur resumable hoga.** Checkpoint DB me (har chapter ka status), toh crash ke baad wahin se continue.
4. **Credits atomic rahenge.** Postgres functions + row locks, aur app code me koi read-modify-write nahi.
5. **Provider abstraction.** `packages/ai` ke peeche OpenRouter/Replicate rahenge, model names config me.
6. **Shared contracts.** Zod schemas `packages/shared` me, jo web aur worker dono use karenge.

---

## 2. Repository Layout (pnpm monorepo)

```
booksaga/
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (auth)/login/ · forgot-password/ · reset-password/
│  │  │  ├─ (public)/legal/[slug]/        # terms, privacy, refund, ai-disclosure
│  │  │  ├─ (app)/                       # authenticated shell (sidebar + topbar)
│  │  │  │  ├─ dashboard/
│  │  │  │  ├─ create/                   # Create Series
│  │  │  │  ├─ series/                   # My Series
│  │  │  │  ├─ series/[seriesId]/        # Roadmap (default tab)
│  │  │  │  │  ├─ bible/ · covers/ · exports/ · box-sets/ · audiobook/ · settings/
│  │  │  │  │  └─ books/[bookId]/        # Book view + chapter editor
│  │  │  │  │     ├─ chapters/[chapterId]/
│  │  │  │  │     ├─ preview/            # KDP Preview
│  │  │  │  │     └─ metadata/
│  │  │  │  ├─ templates/ · templates/[slug]/
│  │  │  │  ├─ cover-studio/ · image-editor/
│  │  │  │  ├─ publishing/               # Exports hub + KDP guide
│  │  │  │  ├─ audiobooks/
│  │  │  │  ├─ agency/ · reseller/ · reseller/franchise/
│  │  │  │  ├─ training/ · training/[moduleId]/[lessonId]/
│  │  │  │  ├─ notifications/ · profile/
│  │  │  │  └─ upgrade/[planCode]/       # locked-feature landing → external OTO URL
│  │  │  ├─ admin/                       # role=admin only
│  │  │  │  ├─ page.tsx (overview) · users/ · users/[id]/ · import/ · credits/ (ledger) · plans/ · purchases/
│  │  │  │  ├─ integrations/ · email/ · templates/ · training/ · franchise/ · jobs/ · settings/ · audit/
│  │  │  ├─ api/
│  │  │  │  ├─ webhooks/warriorplus/route.ts
│  │  │  │  ├─ webhooks/jvzoo/route.ts
│  │  │  │  ├─ files/[...path]/route.ts  # signed-URL redirect with ownership check
│  │  │  │  └─ healthz/route.ts
│  │  │  └─ layout.tsx · globals.css
│  │  ├─ components/
│  │  │  ├─ ui/                          # shadcn primitives (themed)
│  │  │  ├─ shell/                       # Sidebar, Topbar, CommandPalette, CreditsPill, NotificationBell
│  │  │  ├─ series/                      # RoadmapCard, SeriesCard, BibleEditor, ...
│  │  │  ├─ editor/                      # TipTap editor, AI toolbar, ContinuityPanel
│  │  │  ├─ cover/                       # Konva CoverCanvas, LayerPanel, StyleLockPanel
│  │  │  ├─ preview/                     # PdfViewer, EpubPreview, PreflightPanel
│  │  │  └─ gating/                      # <Gate plan=...>, LockedCard, UpgradeCTA
│  │  ├─ lib/
│  │  │  ├─ supabase/                    # server.ts, client.ts, admin.ts (service role, server-only)
│  │  │  ├─ auth/                        # getSession, requireUser, requireAdmin
│  │  │  ├─ entitlements.ts              # server-side resolve (shared logic se)
│  │  │  ├─ queue.ts                     # BullMQ producers (server-only)
│  │  │  ├─ ratelimit.ts
│  │  │  └─ realtime.ts                  # useJob(jobId) hook
│  │  ├─ actions/                        # Server Actions per domain (series.ts, books.ts, covers.ts, admin/*.ts ...)
│  │  ├─ proxy.ts                        # Next 16 name for middleware: session refresh + signed-out redirect
│  │  └─ Dockerfile
│  └─ worker/
│     ├─ src/
│     │  ├─ index.ts                     # boot: queues, workers, cron, graceful shutdown
│     │  ├─ queues.ts                    # queue names, default options
│     │  ├─ processors/
│     │  │  ├─ text/  seriesPlan.ts · book.ts · enhance.ts · rewrite.ts · metadata.ts · suggestions.ts
│     │  │  ├─ image/ cover.ts · templateCover.ts
│     │  │  ├─ export/ book.ts · series.ts · boxSet.ts
│     │  │  ├─ audio/ audiobook.ts
│     │  │  └─ system/ exportCleanup.ts · trashPurge.ts · stuckJobReaper.ts · seedTemplates.ts
│     │  ├─ pipeline/                    # book pipeline steps (outline, chapterLoop, continuity, bibleMerge)
│     │  ├─ prompts/                     # versioned prompt builders (v1/*)
│     │  ├─ lib/ jobs.ts (progress/heartbeat) · credits.ts · storage.ts · db.ts · logger.ts
│     │  └─ healthz.ts
│     └─ Dockerfile                      # node + chromium (playwright) + ffmpeg
├─ packages/
│  ├─ shared/        # zod schemas, types, plan matrix, entitlement resolver, credit costs/pool routing, env, errors (no runtime deps beyond zod)
│  ├─ core/          # server-side domain services on a service-role Supabase client: account loading, credit wrappers (reserve/commit/refund/adjust), ProvisioningService (users, plans, purchases), audit log, password generator. Used by web, worker, scripts
│  ├─ ai/            # openrouter.ts, replicate.ts, retry.ts, usage.ts, json.ts (repair), types.ts
│  ├─ exporters/     # epub/, pdf/ (paged.js templates), docx/, cover/ (wrap calc + compose), audio/ (ffmpeg)
│  └─ db-types/      # `supabase gen types typescript` output
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/    # 0001_init, 0002_rls, 0003_credit_functions, 0004_reference_data (plans, costs, settings), ...
│  └─ seed.sql       # intentionally empty: reference data ships in migration 0004 so production gets it via `db push`
├─ scripts/          # create-admin.ts, seed-prod.ts, seed-templates.ts, seed-dfy.ts, gen-types.sh
├─ docker/           # Caddyfile, docker-compose.dev.yml, docker-compose.prod.yml
├─ docs/             # PRD.md, ARCHITECTURE.md, TASKS.md
├─ .env.example
└─ package.json · pnpm-workspace.yaml · turbo.json
```

**Import rules:**

- `apps/*` → `packages/*` allowed. `packages/*` → `apps/*` kabhi nahi.
- `packages/shared` me koi Node-only ya browser-only API nahi (dono jagah chalna chahiye).
- `lib/supabase/admin.ts` aur `lib/queue.ts` me `import 'server-only'` hoga, taaki galti se client bundle me na jaye.

---

## 3. Data Layer

### 3.1 Schema

Tables ki list PRD §12 me hai. Kuch implementation notes:

- **Enums** Postgres enums ki jagah `text` + `CHECK` constraints honge (migrations me naye values add karna aasaan rehta hai).
- **Timestamps:** `created_at`/`updated_at` trigger (`moddatetime`) se.
- **Soft delete:** `series.deleted_at`. RLS policies `deleted_at is null` filter karengi (trash view alag policy se).
- **Indexes:**
  - `books (series_id, part_number) unique`, `chapters (book_id, number) unique`
  - `jobs (user_id, status)`, `jobs (ref_id)`, `credit_ledger (user_id, created_at desc)`
  - `chapters using gin (search)`, `series using gin (to_tsvector('english', title || ' ' || idea))`
  - `webhook_events (platform, txn_id, event) unique`
  - `jobs (idempotency_key) unique`
  - `jobs (user_id) unique where type = 'book' and status in ('queued','active')`: per-user "max 1 book job" ko DB level pe enforce karta hai, taaki do parallel clicks se do jobs na banein (app-level check-then-insert race-prone hai)
  - `credit_balances (user_id, pool) unique`
- **`jobs` extra columns** (PRD §12): `idempotency_key`, `ledger_id`, `heartbeat_at`, `cancel_requested`, `meta jsonb`, `queued_at`/`started_at`/`finished_at`.
- **Realtime:** `0002_rls.sql` me `jobs` + `notifications`, aur `0004_series.sql` me `books`:
  ```sql
  alter publication supabase_realtime add table public.jobs, public.notifications;  -- 0002
  alter publication supabase_realtime add table public.books;                       -- 0004
  ```
  Iske bina `postgres_changes` events aate hi nahi.
- **Chapter content:** `content` me TipTap JSON (editor ke liye) aur `content_text` me plain text (search, AI context, exports). Dono save pe sync hote hain (server action).
- **Activity tracking:** middleware har authenticated request pe `profiles.last_active_at` update karta hai (throttled: max 1 write / user / hour, Redis key se). Ye sirf admin analytics ke liye hai; credits pe iska koi asar nahi.

### 3.2 Atomic Credit Functions (`0003_credits_fns.sql`)

Credits **one-time** hain (PRD §3.2, §4.2): koi monthly reset, anchor day ya reset cron nahi. Teen pools: `main`, `audio`, `agency`.

```sql
-- Sab SECURITY DEFINER, search_path fixed, sirf service_role ko EXECUTE grant.
grant_plan_credits(p_user_plan uuid) returns void
  -- plans.grant_main/audio/agency_credits padho (reseller customer → main = 100, plan value ignore)
  -- har non-zero pool ke liye: balance += amount, INSERT ledger(status='grant', user_plan_id)
  -- unique (user_plan_id, pool) where status='grant' → dobara call no-op (idempotent)
  -- user_plans.credits_granted = {main, audio, agency}
reserve_credits(p_user uuid, p_pool text, p_amount int, p_job uuid, p_reason text,
                p_acting_user uuid default null) returns bigint  -- ledger id
  -- SELECT ... FROM credit_balances WHERE user_id=p_user AND pool=p_pool FOR UPDATE;
  -- IF balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  -- agency pool + acting client: agency_clients row bhi FOR UPDATE;
  --   IF used + p_amount > allotment THEN RAISE 'CLIENT_ALLOTMENT_EXHAUSTED';
  --   used += p_amount
  -- UPDATE balance = balance - p_amount; INSERT ledger(status='reserved')
commit_credits(p_ledger bigint)            -- reserved → committed (idempotent)
refund_credits(p_ledger bigint, p_reason)  -- reserved → refunded, balance += amount, client used −= amount (idempotent)
adjust_credits(p_user, p_pool, p_amount, p_actor, p_reason)   -- admin +/- (bonus/support); balance 0 se neeche nahi
revoke_plan_credits(p_user_plan uuid)      -- refund/chargeback: har pool me deduct = min(balance, credits_granted[pool]),
                                           -- ledger 'revoked' (idempotent)
```

Reservation pehle hi balance kam kar deta hai, isliye do parallel requests overspend nahi kar sakti. Refund same row ko lock karke balance wapas karta hai.

- `credit_balances` row pehle grant pe bante hain (agar nahi hai toh `insert ... on conflict do nothing`, phir lock).
- Agency client allotment: owner `agency_clients.allotment` badha/ghata sakta hai. Sum of allotments pool se zyada ho sakta hai (overbooking allowed), kyunki asli check reserve ke time pool balance pe hota hai.

### 3.3 Entitlement Resolution

`packages/shared/entitlements.ts`, ek pure function jo web aur worker dono me same chalega:

```ts
type PlanCode =
  | 'fe'
  | 'oto1_lite'
  | 'oto1'
  | 'oto2_lite'
  | 'oto2'
  | 'oto3_lite'
  | 'oto3'
  | 'oto4_lite'
  | 'oto4'
  | 'oto5_lite'
  | 'oto5';

interface Entitlements {
  // Credits entitlements me nahi hain: wo one-time grants hain jo credit_balances me rehte hain
  // (grant amounts: packages/shared/plans.ts → plans.grant_*_credits).
  maxSeries: number | null; // active series; null = unlimited
  maxBooksPerSeries: number; // FE 5, others 30 (system hard max)
  lengthPresets: ('short' | 'standard' | 'full')[];
  paperbackWrap: boolean;
  boxSets: boolean;
  templatesTier: 'none' | 'lite' | 'full';
  dfyPacks: 'none' | 'lite' | 'full';
  audiobook: boolean;
  maxClients: number; // 0 / 25 / 100
  maxResellLicenses: number; // 0 / 50 / 100
  franchiseKit: boolean;
  dailyBookCap: number;
}

type CreditSource = { ownerId: string; pool: 'main' | 'audio' | 'agency' };

function resolveEntitlements(
  plans: PlanCode[],
  ctx?: { isResellerCustomer?: boolean },
  overrides?: Partial<Entitlements>,
): Entitlements;
function resolveCreditSource(user: Profile, action: CreditAction): CreditSource;
```

- Plan limits ka matrix `plans.limits jsonb` me hai, lekin defaults `packages/shared/plans.ts` me bhi rahenge (seed isi se banta hai).
- Agency client: features = `resolveEntitlements(ownerPlans)` (client ke plans ignore). Credits = `resolveCreditSource()` → `{ ownerId: parent_agency_id, pool: 'agency' }` (audiobook ke liye owner ka `audio` pool). Client ka apna `credit_balances` row nahi hota.
- Reseller customer: hamesha `['fe']` features; FE grant pe main credits 100 (300 nahi), `grant_plan_credits` me handle.
- **Enforcement points:** (1) UI `<Gate>` (sirf dikhane ke liye), (2) Server Action (mandatory check), (3) worker job start pe dobara check (defense in depth).

### 3.4 RLS Strategy

- Helper SQL functions: `is_admin()`, `owns_series(series_id)`, `is_agency_owner_of(user_id)`.
- Policy pattern:
  - `series`: `user_id = auth.uid()` (select/insert/update/delete)
  - `books`/`chapters`/`covers`/`exports`/...: `owns_series(series_id)`, ya join ke through
  - Agency read: `is_agency_owner_of(series.user_id)` sirf `select` pe
- Worker **service role** use karta hai (RLS bypass). Isliye worker har job me `job.user_id` aur resource ka ownership khud verify karta hai.
- Supabase Storage policies: object path ka first segment `user_id` hoga (`{user_id}/{series_id}/...`), aur policy `(storage.foldername(name))[1] = auth.uid()::text` check karegi.

### 3.5 Storage Layout

| Bucket            | Path pattern                                          | Access                                           |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `cover-art`       | `{uid}/{seriesId}/{bookId}/{coverId}.png`             | private                                          |
| `covers`          | `{uid}/{seriesId}/{bookId}/{type}-{coverId}.jpg\|pdf` | private                                          |
| `exports`         | `{uid}/{seriesId}/{exportId}/{file}`                  | private, 30-day TTL                              |
| `audio`           | `{uid}/{seriesId}/{bookId}/{audiobookId}/ch-{n}.mp3`  | private                                          |
| `uploads`         | `{uid}/images/{imageId}.{ext}`                        | private                                          |
| `avatars`         | `{uid}/avatar.{ext}`                                  | private (signed URL)                             |
| `template-assets` | `templates/{slug}/cover.jpg`                          | public read                                      |
| `branding`        | `logo.svg`, `hero/*.jpg`, `franchise/*`               | public read (franchise: authenticated via route) |

Saare 8 buckets + unki policies M1 ki migration (`0001_init.sql`) me hi bante hain, taaki baad ke milestones (avatar upload, covers) ko alag migration ka wait na karna pade.

Downloads `GET /api/files/...` se honge: ownership check, phir 5-minute signed URL pe 302 redirect.

---

## 4. Job System

### 4.1 Queues

| Queue    | Processors                                                                           | Concurrency (per worker)  | Default opts                |
| -------- | ------------------------------------------------------------------------------------ | ------------------------- | --------------------------- |
| `text`   | `series_plan`, `book`, `enhance`, `suggestions`, `rewrite`, `metadata`, `arc_extend` | 50 (I/O-bound HTTP calls) | attempts 3, backoff exp 10s |
| `image`  | `cover`, `template_cover`                                                            | 5                         | attempts 3, backoff exp 5s  |
| `export` | `export_book`, `export_series`, `box_set`                                            | 2 (Chromium memory)       | attempts 2                  |
| `audio`  | `audiobook`                                                                          | 3                         | attempts 3                  |
| `system` | `export_cleanup`, `trash_purge`, `stuck_reaper`, `seed_templates`                    | 1                         | repeatable (cron)           |

- Global provider limiter: BullMQ `limiter` + Redis token bucket per provider (`openrouter`, `replicate`). Values env se aate hain. Text concurrency 50 tabhi kaam ki hai jab OpenRouter RPM limit allow kare; limiter usse upar nahi jaane dega.
- Per-user fairness: max 1 active `book` job, DB partial unique index se enforce (§3.1). Insert pe unique violation aaye toh `JOB_ALREADY_RUNNING` error. Cover jobs max 3 (count check; yahan thoda race chalega kyunki cost chhota hai).
- Priority: interactive chhote jobs (`enhance`, `suggestions`, `rewrite`, `metadata`) = 1, `book` = 5, `export` = 5, `seed_templates` = 10.

### 4.2 Job Lifecycle

```
web (Server Action)
  1. validate input (zod) + requireUser + entitlements check
  2. INSERT jobs (status='queued', idempotency_key)  ← unique; duplicate → return existing job
                                                      ← partial unique (book) → JOB_ALREADY_RUNNING
  3. source = resolveCreditSource(user, action)
     rpc reserve_credits(source.ownerId, source.pool, cost, job, reason, acting_user=user.id) → ledger_id
     (fail → delete job, return INSUFFICIENT_CREDITS / CLIENT_ALLOTMENT_EXHAUSTED)
  4. try queue.add(type, { jobId, userId, refId, ledgerId }, { jobId: idempotency_key })
     catch → refund_credits(ledger) + jobs.status='cancelled' + return QUEUE_UNAVAILABLE
  5. return { jobId }  → UI subscribes Realtime on jobs row

Idempotency key format: `{type}-{refId}-v{n}` (jaise `book-3f2a…-v1`). BullMQ custom job IDs me `:` use nahi karna (BullMQ docs: `:` Redis key separator hai).

worker
  6. status='active', heartbeat_at=now() (every 15s)
  7. run processor → progress updates (progress %, step_label)
  8a. success → commit_credits(ledger) → status='completed' → notification
  8b. retryable error → BullMQ retry (status stays 'active', attempts++)
  8c. final failure → refund_credits(ledger) → status='failed', error → notification
```

**Progress contract** (`jobs` row): `progress int 0–100`, `step_label text` (jaise "Writing chapter 7 of 20"), aur `meta jsonb` (`{ chapterId, chaptersDone, chaptersTotal }`).

### 4.3 Resumability (book job)

- Pipeline steps idempotent hain aur DB state check karte hain:
  - Outline: `books.outline` already hai toh skip
  - Chapters: jinka `chapters.status = 'done'` hai wo skip, `pending/failed` wale generate
  - Continuity: `books.continuity_report` set hai toh skip
  - Metadata: `books.metadata` set hai toh skip
- Retry ya reaper re-queue hone pe job wahin se continue karta hai.
- **Stuck reaper** (har 10 min):
  - `status='active' AND heartbeat_at < now() - 5 min`, aur BullMQ job bhi active nahi hai → re-queue (max 2 baar), warna fail + refund.
  - `status='queued' AND queued_at < now() - 10 min`, aur BullMQ me job exist nahi karta (step 4 aur crash ke beech ka gap) → re-add, aur 2 baar ke baad cancel + refund.

### 4.4 Cancellation

User "Cancel" kare toh `jobs.cancel_requested = true`. Worker har chapter ke beech ye flag check karta hai, aur cancel hone pe jo chapters ban chuke wo rehte hain. Credits ka hisaab (PRD §4.2): pro-rata refund nahi; < 20% chapters bane hon toh poora refund, warna koi refund nahi. Ye rule Cancel confirm dialog me clearly dikhega.

---

## 5. AI Layer (`packages/ai`)

### 5.1 Interfaces

```ts
interface TextRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
  json?: z.ZodTypeAny; // structured output: JSON mode + validate + repair
  usage: UsageContext; // { userId, jobId, purpose }
}
interface TextResult<T = string> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

interface ImageRequest {
  prompt: string;
  width: number;
  height: number; // multiples of 16
  quality?: 'low' | 'medium' | 'high';
  referenceImages?: string[]; // series style consistency (edit/reference input)
  usage: UsageContext;
}
interface ImageResult {
  buffer: Buffer;
  mime: 'image/png' | 'image/jpeg';
  costUsd: number;
}

interface TtsRequest {
  text: string;
  voice: string;
  speed: number;
  usage: UsageContext;
}
interface TtsResult {
  buffer: Buffer;
  mime: 'audio/wav' | 'audio/mpeg';
  durationSec: number;
  costUsd: number;
}

export const ai = { text, image, tts };
```

### 5.2 Implementation

- **OpenRouter:** `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible). Headers `HTTP-Referer` + `X-Title: BookSaga`, `response_format: { type: 'json_object' }` jab `json` diya ho. `usage` field se tokens, aur cost OpenRouter response/`generation` endpoint se ya config price table se.
- **Replicate:** official `replicate` npm client, `replicate.run(model, { input })`. Output URL fetch karke buffer ban jata hai. Exact input schema (sizes, quality, reference images) M4 me model page se verify karke `packages/ai/replicate.ts` me map karenge.
- **Retry policy:** 429/5xx/network/timeouts pe 3 retries, exponential backoff + jitter. 4xx (invalid input) pe retry nahi.
- **JSON repair:** zod parse fail ho toh ek follow-up call jaati hai: "Return valid JSON matching this schema; previous output: …" (max 2 baar), phir bhi fail ho toh `AiSchemaError`.
- **Usage logging:** har call ke baad `ai_usage_log` me insert (batching nahi; volume manageable hai).
- **Config:** model IDs aur price table pehle `app_settings.ai` se padhe jaate hain (admin override), warna env defaults.

### 5.3 Context Budgeting (chapter call)

DeepSeek V4.1 Flash ka 1M context hai, lekin cost/latency ke liye chapter **input** context ko ~15–40k tokens ke andar rakhenge:

| Block (prompt me isi order me; static pehle, taaki prefix cache ho sake) | Approx tokens              |
| ------------------------------------------------------------------------ | -------------------------- |
| System + style guide + anti-slop rules                                   | 1.5k                       |
| Series Bible (compact JSON: sirf relevant + core cast)                   | 5–20k                      |
| Series arc + previous books' summaries                                   | 2–6k                       |
| Current book outline                                                     | 2–4k                       |
| Previous chapters' summaries (this book)                                 | 1–6k                       |
| Last chapter tail (~1,500 words)                                         | 2k                         |
| **Input total**                                                          | **~14–40k**                |
| Output (chapter; preset ke hisaab se ~1,300–2,000 words)                 | ~1.7–2.7k (`maxTokens` 4k) |

`pipeline/context.ts` ek `buildChapterContext()` deta hai jo bible ko compact karta hai: is chapter ke characters/locations ka full data, baaki cast ka one-liner.

**Prompt caching:** pehle 3 blocks ek book ke saare chapters me (lagbhag) same rehte hain. Agar provider prefix caching support karta hai, toh cache-hit tokens sasta padega. OpenRouter pe V4.1 Flash ke liye ye support aur discount M2 me verify karna hai. `ai_usage_log` me cached tokens alag column (`cached_input_tokens`) me save honge.

**Rough cost (Standard book, ~18 chapters):** ~18 × 30k (chapters) + ~18 × 5k (summaries) + outline/continuity/metadata ~60k ≈ **0.7M input** + ~60k output. V4 Flash ki listed pricing ($0.09 / $0.18 per M) pe ≈ $0.07 text + ~$0.01–0.02 cover. V4.1 Flash pricing abhi verify nahi hai; T2.21 me actual measure karna hai.

---

## 6. Book Generation Pipeline (worker)

```
processors/text/book.ts
│
├─ loadState(bookId)                    # series, bible, previous books, book row, chapters
├─ assertOwnership + assertEntitlement(lengthPreset)
│
├─ if part 1 && !series.arc → step seriesPlan()      # arc + books[] + bible v1  (5%)
├─ step outline()                       # zod: BookOutline (chapters[], resolution, cliffhanger) (10%)
│     └─ INSERT chapters rows (status='pending', title, beats)
├─ for each chapter (pending):           # 10% → 85%
│     ├─ writeChapter(ctx)               → content_text (markdown-lite)
│     ├─ summarizeAndExtract(chapter)    → { summary, factsDelta }   (zod)
│     ├─ tx: UPDATE chapter (content, content_text, summary, word_count, status='done')
│     │      mergeBible(factsDelta) → series_bible v+1, bible_versions insert
│     └─ progress + heartbeat + cancel check
├─ step continuityCheck()               # issues[] → targeted paragraph fixes (1 round) (90%)
├─ step metadata()                      # title/subtitle/blurb/keywords/categories/front+back matter (95%)
├─ UPDATE books.status='generated'; unlock next part (status 'locked'→'ready')
├─ if series.settings.autoCovers → enqueue cover job (separate credits, sirf balance ho toh)
└─ done (100%)
```

**Bible merge rules (`pipeline/bibleMerge.ts`):**

- Har entry ka stable `id` (slug) hota hai. Naye facts add hote hain, existing `source: 'ai'` fields update ho sakte hain.
- `source: 'user'` fields kabhi overwrite nahi hote. Agar conflict aaye toh wo `conflicts[]` me jata hai, jo Continuity Report me dikhta hai.
- Timeline events ka `book`, `chapter` aur relative order hota hai, aur list order se sorted rehti hai.

**Markdown → TipTap:** worker plain "markdown-lite" (paragraphs, `* * *` scene breaks, _italic_, **bold**) generate karta hai. `packages/shared/markdownToTiptap.ts` usse TipTap JSON me badalta hai. Exporters TipTap JSON se HTML render karte hain (ek hi renderer: `packages/exporters/html/render.ts`).

---

## 7. Covers

### 7.1 Flow

```
cover job (bookId, mode, styleRef?)
 ├─ build prompt:
 │    series.cover_style.artPrompt + book-specific scene (AI se: book premise → 1-line visual scene)
 │    + palette + "no text, no letters, no typography" (overlay mode)
 │    + title/author text instructions (ai_text mode)
 ├─ ai.image(1856×2784, quality=low, referenceImages=[book1 art] if part>1)   # paperback front @300 DPI ke liye kaafi
 ├─ save → cover-art bucket (original 1856×2784)
 ├─ ebook: center-crop/downscale → 1600×2560
 ├─ overlay mode: compose final = art + series text layout (server-side render)
 └─ covers row (layers jsonb, art_path, final_path, is_active)
```

- **Series Cover Style** (`series.cover_style` jsonb): `{ artPrompt, palette[], fontFamily, layers: [{ kind: 'series'|'title'|'part'|'author'|'tagline', x, y, w, align, size, weight, color, effects }] }`. Layer positions normalized (0–1) hain, taaki ebook aur paperback front dono sizes pe same layout lage. Book 1 ka final cover save hote hi ye lock ho jata hai (user "Unlock style" se change kar sakta hai).
- **Server-side compose:** Konva ka same layer JSON `@napi-rs/canvas` (worker) pe render hota hai. Fonts `packages/exporters/fonts/` me self-hosted TTF hain (~30 curated, OFL licensed) aur dono jagah same files load hoti hain. Text metrics/wrapping me thoda farak aa sakta hai, isliye **server output hi canonical hai**: Save ke baad editor server ka rendered JPG dikhata hai, aur T4.3 ka screenshot-diff test tolerance ke saath chalta hai.
- **Editor (web):** react-konva, layers JSON edit karta hai, aur "Save" pe JSON server action ko jata hai, phir server compose karke final JPG banata hai (client canvas export pe depend nahi).

### 7.2 Paperback Full Wrap (`packages/exporters/cover/wrap.ts`)

```ts
function wrapDimensions(
  trim: { w: number; h: number },
  pageCount: number,
  paper: 'white' | 'cream',
) {
  const bleed = 0.125;
  const spine = pageCount * (paper === 'white' ? 0.002252 : 0.0025);
  return {
    widthIn: bleed + trim.w + spine + trim.w + bleed,
    heightIn: bleed + trim.h + bleed,
    spineIn: spine,
    spineTextAllowed: pageCount >= 79,
    dpi: 300,
  };
}
```

Front = original cover art (1856×2784 se trim + bleed size pe crop; AI outpaint nahi), back = blurb + author + barcode safe zone, aur spine pe title/author (agar allowed ho). Output PDF (pdf-lib) 300 DPI.

- Wrap job sirf tab chalta hai jab book ka print PDF ban chuka ho (`exports` me actual `page_count`). Wrap ka `covers.page_count` save hota hai.
- Book edit/re-export se actual page count badle toh wrap `stale = true` ho jata hai, pre-flight warning aati hai, aur export me stale wrap include nahi hota jab tak regenerate na ho (free, kyunki koi AI call nahi).
- Bade trim sizes (6×9 se bada) pe art upscale karna pade toh `sharp` Lanczos se, aur effective DPI < 300 hone pe pre-flight warning.

---

## 8. Exporters (`packages/exporters`)

| Exporter          | Approach                                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTML renderer** | TipTap JSON → semantic HTML (`<section class="chapter">`, `<h1>`, `<p>`, `<hr class="scene-break">`). Ye sab exporters ka common base hai                                                                                                           |
| **EPUB3**         | JSZip: `mimetype` (stored, first), `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml`, `toc.ncx`, `cover.xhtml`, `styles.css`, front matter, `chapter-NN.xhtml`, back matter. CI/test me `epubcheck` (Java jar, dev dependency) se validate |
| **Print PDF**     | Paged.js polyfill + print CSS (`@page` size per trim, mirrored margins, running headers, page numbers, chapter starts recto). Playwright Chromium `page.pdf()`. Fonts embedded                                                                      |
| **DOCX**          | `docx` package: Heading 1 per chapter, page break before chapter, TOC field, title/copyright pages                                                                                                                                                  |
| **Metadata**      | `metadata.txt` (human-readable, KDP form order) + `metadata.csv`                                                                                                                                                                                    |
| **ZIP**           | `archiver` streaming → Supabase Storage upload                                                                                                                                                                                                      |
| **Box Set**       | Multiple books ka HTML ek EPUB me, book-level TOC nesting ke saath                                                                                                                                                                                  |
| **Audio**         | Kokoro chunks (WAV) → ffmpeg: concat, `loudnorm` (ACX target), 0.75s head / 2s tail silence, `-ac 1 -ar 44100 -b:a 192k -c:a libmp3lame` CBR. Validation: RMS, peak aur noise floor (≤ −60 dB)                                                      |

**Margins (print):** inside margin page count ke hisaab se: 24–150 pages → 0.375", 151–300 → 0.5", 301–500 → 0.625", 501–700 → 0.75", 701–828 → 0.875". Outside/top/bottom ≥ 0.25" (default 0.5"). Bleed ON ho toh page size +0.125" (width) aur +0.25" (height).

**Page count estimate** (UI ke liye, export se pehle): `words / wordsPerPage[trim]` (6×9 ≈ 300, 5.5×8.5 ≈ 270, 5×8 ≈ 250). Actual count PDF render ke baad save hota hai, aur wahi wrap cover me use hota hai.

---

## 9. Web App Patterns

### 9.1 Server Actions (mutations)

Har action ka same skeleton:

```ts
'use server';
export async function generatePart(input: unknown) {
  const user = await requireUser();                         // session + active status
  const data = GeneratePartSchema.parse(input);             // zod (packages/shared)
  await rateLimit(`ai:${user.id}`, 30, '1m');
  const ent = await getEntitlements(user.id);
  assertCan(ent, 'generateBook', { lengthPreset: data.lengthPreset, ... }); // throws AppError
  return enqueueJob({ type: 'book', userId: user.id, refId: data.bookId,
                      creditAction: `book_${data.lengthPreset}`, idempotencyKey: `book-${data.bookId}-v${data.attempt}` });
}
```

- Errors `AppError { code, message }` me hote hain (`INSUFFICIENT_CREDITS`, `CLIENT_ALLOTMENT_EXHAUSTED`, `PLAN_REQUIRED`, `LIMIT_REACHED`, `PART_LOCKED`, `JOB_ALREADY_RUNNING`, `QUEUE_UNAVAILABLE`, `RATE_LIMITED`, `VALIDATION`), aur UI unhe toast ya UpgradeCTA me map karta hai.
- `creditAction` hamesha PRD §4.1 ki canonical keys me se ek hota hai (`packages/shared/credits.ts` me `CreditAction` union type).
- Reads: Server Components + Supabase server client (user JWT, isliye RLS lagta hai).

### 9.2 Realtime

- `useJob(jobId)`: Supabase channel `postgres_changes` on `jobs` (filter `id=eq.{jobId}`).
- `useNotifications()`: `notifications` insert events (filter `user_id`).
- Roadmap page: `books` updates (filter `series_id`), taaki part cards live update hon.
- Fallback: agar realtime disconnect ho jaye toh har 5s polling.

### 9.3 Auth & proxy

- `@supabase/ssr` cookie-based sessions.
- `proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`): refreshes the session cookie and redirects signed-out visitors to `/login?next=…`. It makes **no DB calls**.
- Authorisation lives server-side in `requireUser()` / `requireAdmin()` (`lib/auth/session.ts`), which run on every render: `profiles.status='suspended'` → forced sign-out via `/auth/signout?reason=suspended`; non-admins get a 404 on `/admin`; `last_active_at` is touched at most once per hour (analytics only). Maintenance mode is enforced in the `(app)` layout (admins bypass it).
- Public signup is OFF: `[auth] enable_signup = false` in `supabase/config.toml`. **Keep `[auth.email] enable_signup = true`** — in Supabase that flag enables the email/password provider itself; setting it to false disables logins entirely (found during M1 testing). Users are created only through the admin API (`auth.admin.createUser`).

### 9.4 Theming

- Tailwind v4 theme tokens live in `apps/web/app/globals.css` (CSS variables: `--background #0B1023`, `--card #121937`, `--border`, brand gradient utilities `bg-brand-gradient` / `text-brand-gradient`, accents amber/teal/emerald/pink). There is no separate `packages/config` preset in v1.
- shadcn components inhi variables se themed hain. Sirf dark theme hai (v1).

---

## 10. Provisioning & Integrations

```
            ┌──────────── Admin UI (manual / CSV) ────────────┐
            │                                                 ▼
W+ webhook ─┤                                     ProvisioningService
JVZoo IPN  ─┘  adapter.verify() → adapter.normalize()   ├─ upsertUser(email, name)  → auth.admin.createUser + profiles
                                                        ├─ grantPlan(userId, planCode, purchase)  → user_plans row + grant_plan_credits (one-time, idempotent)
                                                        ├─ revokePlan(purchase) (refund/chargeback) → revoke_plan_credits
                                                        └─ markCredentials()  → email ON ? SMTP send : profiles.credentials_pending = true
```

**Launch delivery:** buyer tak login details pahunchana app ke scope ke bahar hai (team ka thank-you page). App ka kaam: admin create / CSV import, plans assign, credentials copy/CSV download, aur "Pending credentials" tab (PRD §9).

```ts
interface PlatformAdapter {
  platform: 'warriorplus' | 'jvzoo';
  verify(req: Request, rawBody: string, secret: string): boolean;
  normalize(rawBody: string): NormalizedEvent;
}
interface NormalizedEvent {
  platform: string;
  txnId: string;
  productId: string;
  email: string;
  name?: string;
  amount?: number;
  event: 'sale' | 'refund' | 'chargeback' | 'cancel';
}
```

- Product-ID → plan mapping: `app_settings.integrations.{platform}.productMap` (admin UI).
- Webhook route: toggle check (OFF → 404), raw body read, verify, `webhook_events` insert (unique → duplicate ho toh 200 no-op), process, aur processed/error mark.
- **Plan add hone pe credits:** har naya plan grant apne one-time credits balance me jodta hai (stacking; koi difference calculation nahi).
- **CSV import:** server action pehle parse + validate karta hai aur dry-run result deta hai. Confirm hone pe rows ProvisioningService se 5-5 ke parallel batches me process hoti hain (har row apne aap me idempotent: email already hai toh sirf plans add), aur result CSV (passwords ke saath) **ek baar** download hota hai.

### 10.1 Email (`lib/email`)

- `sendEmail(template, to, vars)`: agar `app_settings.email.enabled = false` toh no-op + log.
- Nodemailer SMTP transport settings se banta hai (password encrypted at rest; `pgcrypto` + app key env `SETTINGS_ENCRYPTION_KEY`).
- Supabase Auth ka password reset: email ON hone pe Supabase project me custom SMTP set karna (local `config.toml`, prod dashboard). Toh reset emails Supabase hi bhejta hai, aur custom template use hota hai.

---

## 11. Security Architecture

| Concern       | Control                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secrets       | Sirf server env. `SUPABASE_SERVICE_ROLE_KEY` web me sirf `lib/supabase/admin.ts` (server-only) me. DB me stored secrets (SMTP, webhook) `pgcrypto` encrypted |
| AuthZ         | RLS (DB) + Server Action checks (app) + worker ownership checks                                                                                              |
| Admin         | `profiles.role='admin'`, middleware + har admin action me `requireAdmin()`, aur sab `audit_log` me                                                           |
| Input         | Zod everywhere. Prompt inputs `<user_input>` delimited, aur length caps                                                                                      |
| Output        | TipTap/HTML sanitize (`sanitize-html` allowlist) render aur export se pehle                                                                                  |
| Uploads       | MIME sniff (`file-type`), size limit 10MB, re-encode via `sharp` (EXIF strip)                                                                                |
| Rate limit    | Redis sliding window: login, AI actions, webhooks, file downloads                                                                                            |
| Webhooks      | Signature/secret verify, idempotency, toggle-gated                                                                                                           |
| Transport     | Caddy HTTPS, HSTS, CSP, `X-Frame-Options: DENY`, secure cookies                                                                                              |
| Supply chain  | Exact pinned deps, `pnpm audit` CI step, lockfile committed                                                                                                  |
| Impersonation | Admin "view as" sirf read-only signed session flag ke saath hota hai. Mutations blocked + audit logged                                                       |

---

## 12. Environments & Deployment

### 12.1 Local

```
supabase start                         # API :55321, DB :55322, Studio :55323, Mailpit :55324 (custom ports: other local Supabase projects use 54xxx)
pnpm env:local                         # writes .env.local from `supabase status` (AI_MODE=mock)
docker compose -f docker/docker-compose.dev.yml up -d redis
pnpm dev                               # web :3000
pnpm worker:dev                        # worker (tsx watch)
pnpm db:reset                          # supabase db reset → migrations (+ empty seed.sql)
pnpm gen:types                         # supabase gen types → packages/db-types
pnpm create-admin --email admin@local.test --password '…'
pnpm test | pnpm test:db | pnpm test:e2e   # unit | DB (needs supabase) | Playwright (needs supabase + dev server)
```

Local me Playwright Chromium aur ffmpeg host pe install hone chahiye, ya worker ko dev container me chala sakte hain (`docker-compose.dev.yml` me `worker` service, optional profile).

### 12.2 Production (VPS)

```
docker-compose.prod.yml
  caddy   : ports 80/443, Caddyfile (domain → web:3000), volumes caddy_data
  web     : image booksaga-web:<git-sha>, env_file .env.production, healthcheck /api/healthz
  worker  : image booksaga-worker:<git-sha>, env_file .env.production, healthcheck :8081/healthz, deploy.replicas 1..N
  redis   : redis:7-alpine, appendonly yes, volume redis_data, no public port
```

- **Images:** multi-stage Dockerfiles. Web me Next.js `output: 'standalone'` use hoga. Worker me node + `playwright` chromium + ffmpeg + fonts.
- **Deploy flow** (manual v1, CI baad me): `git pull` → `docker compose build` → `supabase db push` (agar migrations ho) → `docker compose up -d` (web pehle, phir worker graceful restart).
- **Supabase cloud go-live:**
  1. Project create karo (region buyers ke paas, e.g. US East)
  2. `supabase link --project-ref <ref>`, phir `supabase db push`
  3. Auth settings: signup OFF, site URL, redirect URLs, aur SMTP (jab email ON karna ho)
  4. Storage buckets + policies (migrations me hi defined hain)
  5. `pnpm tsx scripts/seed-prod.ts` (plans, credit costs, settings, admin), phir admin panel se `seed_templates` job
- **Backups:** Supabase daily backups (plan ke hisaab se) + weekly `pg_dump` VPS pe encrypted offsite copy.

### 12.3 Env Vars (`.env.example`)

```env
# App
APP_URL=http://localhost:3000
NODE_ENV=development
SETTINGS_ENCRYPTION_KEY=            # 32-byte base64

# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
REDIS_URL=redis://localhost:6379

# AI
OPENROUTER_API_KEY=
OPENROUTER_TEXT_MODEL=deepseek/deepseek-v4.1-flash-1017
REPLICATE_API_TOKEN=
REPLICATE_IMAGE_MODEL=openai/gpt-image-2
REPLICATE_IMAGE_QUALITY=low
REPLICATE_TTS_MODEL=jaaari/kokoro-82m

# Worker
WORKER_TEXT_CONCURRENCY=50
WORKER_IMAGE_CONCURRENCY=5
WORKER_EXPORT_CONCURRENCY=2
WORKER_AUDIO_CONCURRENCY=3
OPENROUTER_RPM=300
REPLICATE_RPM=120
```

---

## 13. Observability

| What        | How                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Logs        | `pino` JSON logs (web + worker), har log me `jobId`, `userId`. `docker logs` + log rotation                              |
| Errors      | Sentry (optional; DSN env, default off)                                                                                  |
| Job metrics | Admin → Jobs: BullMQ counts (waiting/active/failed/delayed), `jobs` table aggregates                                     |
| AI cost     | `ai_usage_log` aggregates (admin overview): per day, per provider, per action type, top users                            |
| Health      | `/api/healthz` (web: DB + Redis ping), worker `:8081/healthz` (Redis + last heartbeat), aur uptime monitor (UptimeRobot) |

---

## 14. Scaling Plan

| Load          | Action                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normal        | 1 VPS (8 vCPU / 16 GB): web + 1 worker + redis                                                                                                                                                   |
| Launch spike  | Pehle text concurrency badhao (I/O-bound; OpenRouter RPM tak). Phir bhi kam pade toh worker replicas 2–3 (same VPS ya doosra VPS same Redis se connect; Redis port private network/WireGuard pe) |
| Heavy exports | `export` queue ka alag worker (Chromium memory heavy), `WORKER_QUEUES=export` env se                                                                                                             |
| DB            | Supabase compute upgrade, indexes, aur connection pooling (Supavisor) worker ke liye                                                                                                             |

Worker `WORKER_QUEUES` env (comma list) se decide karega ki kaunsi queues consume karni hain. Isse specialized workers ban sakte hain bina code change ke.

---

## 15. Testing Strategy

| Level       | Tooling                                                  | Scope                                                                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                                                   | entitlements resolver, credit source resolver (agency client → owner agency pool), grant amounts (reseller customer 100, stacking), credit cost calc, wrap dimensions, margins, markdown→TipTap, bible merge, prompt builders, adapters (verify/normalize)       |
| DB          | Vitest + local Supabase                                  | RLS policies (user A, user B ka data na dekh sake), credit functions (concurrency: 20 parallel reserves; agency client allotment; grant idempotency; refund revoke 0 se neeche na jaye), partial unique index (2 parallel book jobs → 1), migrations apply clean |
| Integration | Vitest + mocked AI (`AI_MODE=mock` fixtures)             | book pipeline end-to-end (resume after crash), export outputs, provisioning flows                                                                                                                                                                                |
| Validation  | epubcheck, pdf page-size assertions, ffprobe (ACX specs) | Export correctness                                                                                                                                                                                                                                               |
| E2E         | Playwright                                               | login → create series → generate (mock AI) → roadmap → edit → cover → export → download; admin create user → login                                                                                                                                               |
| Live smoke  | Real AI keys, manual script                              | 1 Short book + cover + export per release, cost record                                                                                                                                                                                                           |

`AI_MODE=mock` hone pe `packages/ai` deterministic fixtures return karega, taaki tests aur UI dev me paise na lagein.

---

## 16. Key Sequence: Generate Part N

```
User            Web (Server Action)          Postgres                Redis/BullMQ          Worker                 AI
 │ click Gen N ─►│                              │                         │                    │                     │
 │               │ requireUser, zod, entitle ──►│ select plans, book      │                    │                     │
 │               │ assert part N-1 generated    │                         │                    │                     │
 │               │ insert jobs (idem key) ─────►│                         │                    │                     │
 │               │ rpc reserve_credits ────────►│ lock balance, -cost     │                    │                     │
 │               │ queue.add ─────────────────────────────────────────── ►│                    │                     │
 │◄── {jobId} ───│                              │                         │                    │                     │
 │ subscribe jobs row (Realtime) ──────────────►│                         │── job ────────────►│                     │
 │               │                              │◄── status active ─────────────────────────── │                     │
 │               │                              │                         │                    │── outline ─────────►│
 │               │                              │◄── chapters pending ─────────────────────────│                     │
 │               │                              │                         │                    │── chapter k ───────►│
 │◄─ progress ───────────────────────────────── │◄── chapter done, bible v+1, progress ────────│                     │
 │               │                              │                         │                    │   ... loop ...      │
 │               │                              │                         │                    │── continuity/meta ─►│
 │               │                              │◄── book generated, next part ready ──────────│                     │
 │               │                              │◄── commit_credits, job completed, notify ────│                     │
 │◄─ "Part N ready" notification ───────────────│                         │                    │                     │
```
