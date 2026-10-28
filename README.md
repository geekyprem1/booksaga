# BookSaga

Turn one idea into a complete, KDP-ready book series. See [`docs/`](./docs) for the PRD, architecture and task list.

## Requirements

- Node.js 22+ and pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop (local Supabase and Redis run in Docker)
- Supabase CLI (`npm i -g supabase`)

## Local setup

```bash
pnpm install

# 1. Local Supabase (Postgres, Auth, Storage, Studio). Ports 55321-55329.
pnpm db:start
pnpm env:local            # writes .env.local from the running stack (AI_MODE=mock, no paid APIs)

# 2. Redis (job queue, from M2)
docker compose -f docker/docker-compose.dev.yml up -d redis

# 3. An admin account (also gets every plan so all modules can be tested)
pnpm create-admin --email admin@local.test --password 'ChangeMe#2026'

# 4. Run
pnpm dev                  # http://localhost:3000
```

Open http://localhost:3000/login and sign in. Admin tools are under `/admin`
(create users, assign the FE and OTOs, adjust credits, copy login details, audit log).

Useful local URLs: Studio http://127.0.0.1:55323, Mailpit http://127.0.0.1:55324.

## Generating books (M2)

Generation runs in the worker, so it needs Redis and the worker process:

```bash
docker compose -f docker/docker-compose.dev.yml up -d redis
pnpm worker:dev          # queues + the 10-minute stuck-job reaper
```

`AI_MODE=mock` (the local default) writes a complete, deterministic book with no API keys and no
cost. Set `AI_MODE=live` and `TEXT_API_KEY` to use the real model (`TEXT_API_BASE_URL` takes any
OpenAI-compatible endpoint; the default is OpenRouter). The worker exposes
`http://127.0.0.1:3001/healthz` with live queue counts.

`worker:dev` watches source files and restarts after edits. For uninterrupted live generation while
editing the repository, run a worker without watch mode instead:

```bash
pnpm --filter @booksaga/worker exec tsx --env-file=../../.env.local src/index.ts
```

Run only one local worker launcher on the default health port. Stalled-job recovery reuses the
original job, book reference and credit reservation; completed chapters are skipped on resume.

Flow: **Create Series** → idea + genre + length → _Generate Part 1_ → live progress (Realtime on the
`jobs` row, polling fallback) → Part 1 chapters, series bible and metadata in the DB, and Part 2
unlocked on the roadmap.

Queued and active books show **View progress**, not another Generate button, on both Roadmap and
My Series. Create Series recovers your pending book on reload and keeps a status card when you close
the dialog. Progress shows saved worker stages, percentage and chapter counts—not a timer or ETA.
Loading, tracking errors and delayed worker heartbeats are shown separately from queue status.
If a job stays queued, check `/healthz` and the worker terminal: `pnpm dev` starts the web app only.

## Cover image cost policy

- Covers use **OpenAI GPT Image 2** through Replicate, always with **`quality: low`**.
- `REPLICATE_IMAGE_MODEL` only accepts `openai/gpt-image-2`; `REPLICATE_IMAGE_QUALITY` only accepts
  `low`. The provider request also fixes low quality, so a caller cannot silently select a costlier tier.
- Cost target: about **$0.01 per image**. The [published Replicate rate](https://replicate.com/openai/gpt-image-2#pricing)
  checked on 24 Oct 2026 is **$0.012 per output image**; ten covers are approximately **$0.12**.
  Usage logs contain this estimate, not a provider-reported invoice amount.

## Ten starter series templates

```bash
node --env-file=.env.local --import tsx scripts/seed-templates.ts --starter
```

Requires `AI_MODE=live` and `REPLICATE_API_TOKEN`. Seeds ten original published lite templates from
`scripts/data/starter-templates.json`, each with a real **AI-text cover** (artwork, title and publisher
lettering generated together), premise, genre, keywords, and 3–5 planned books. No engine text overlay
is used for template covers; Sharp only resizes and JPEG-encodes the AI image. Old engine-lettered
covers are replaced in place, while existing `-ai-text.jpg` covers are skipped without another paid call.
The original 120-template catalog remains available by omitting `--starter`; all template cover
generation requires live AI credentials. `--covers=false` is available only for the full catalog.

The template gallery shows **six smaller cards per row at desktop widths of 1280px and above**,
with fewer columns on tablets and phones. Full cover proportions preserve AI-rendered lettering.

## Scripts

| Command                         | What it does                                                   |
| ------------------------------- | -------------------------------------------------------------- |
| `pnpm dev` / `pnpm worker:dev`  | Web app / background worker                                    |
| `pnpm typecheck` / `pnpm lint`  | Whole monorepo                                                 |
| `pnpm test`                     | Unit tests (no services needed)                                |
| `pnpm test:db`                  | RLS, credit functions, provisioning and series ownership       |
| `pnpm test:e2e`                 | Playwright browser tests (needs local Supabase and `pnpm dev`) |
| `pnpm db:reset`                 | Rebuild the local database from `supabase/migrations`          |
| `pnpm gen:types`                | Regenerate `packages/db-types` after a migration               |
| `pnpm create-admin --email ...` | Create or promote an admin                                     |

First time running e2e: `pnpm --filter @booksaga/web exec playwright install chromium`.

## How credits and plans work

- 11 plans: FE + 5 OTOs + 5 downsells (`packages/shared/src/plans.ts`).
- Credits are **one-time grants** added when a plan is assigned (no monthly refill). They stack across plans.
- Every AI action reserves credits first, then commits on success or refunds on failure
  (`supabase/migrations/*_credit_functions.sql`).

## Database changes

Only through `supabase/migrations/*.sql`. Never edit the production schema by hand.
Production go-live: `supabase link --project-ref <ref>` then `supabase db push`.
