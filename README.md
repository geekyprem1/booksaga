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
cost. Set `AI_MODE=live` and `OPENROUTER_API_KEY` to use the real model. The worker exposes
`http://127.0.0.1:3001/healthz` with live queue counts.

Flow: **Create Series** → idea + genre + length → *Generate Part 1* → live progress (Realtime on the
`jobs` row, polling fallback) → Part 1 chapters, series bible and metadata in the DB, and Part 2
unlocked on the roadmap.

## Scripts

| Command                         | What it does                                                      |
| ------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev` / `pnpm worker:dev`  | Web app / background worker                                       |
| `pnpm typecheck` / `pnpm lint`  | Whole monorepo                                                    |
| `pnpm test`                     | Unit tests (no services needed)                                   |
| `pnpm test:db`                  | RLS, credit functions, provisioning and series ownership          |
| `pnpm test:e2e`                 | Playwright browser tests (needs local Supabase and `pnpm dev`)    |
| `pnpm db:reset`                 | Rebuild the local database from `supabase/migrations`             |
| `pnpm gen:types`                | Regenerate `packages/db-types` after a migration                  |
| `pnpm create-admin --email ...` | Create or promote an admin                                        |

First time running e2e: `pnpm --filter @booksaga/web exec playwright install chromium`.

## How credits and plans work

- 11 plans: FE + 5 OTOs + 5 downsells (`packages/shared/src/plans.ts`).
- Credits are **one-time grants** added when a plan is assigned (no monthly refill). They stack across plans.
- Every AI action reserves credits first, then commits on success or refunds on failure
  (`supabase/migrations/*_credit_functions.sql`).

## Database changes

Only through `supabase/migrations/*.sql`. Never edit the production schema by hand.
Production go-live: `supabase link --project-ref <ref>` then `supabase db push`.
