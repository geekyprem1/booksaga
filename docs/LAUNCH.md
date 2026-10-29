# BookSaga VPS launch guide

Updated 29 October 2026. Domain is undecided. Support: **softwarevh@gmail.com**. Refund window: **30 days**.

The owner will deploy through **GitHub → Coolify**. Use [SUPABASE_COOLIFY.md](./SUPABASE_COOLIFY.md)
and `docker/docker-compose.coolify.yml` for that path. The standalone VPS/Caddy steps below remain
available for deployment without Coolify. The combined Linux container readiness and functional
generation checks pass; results are saved in `CONTAINER_CHECK_REPORT.json`.

## Current scope

Core generation, editing, covers, exports and plan features are implemented. Worker ownership fencing, atomic credit/job settlement, read-only admin preview, rate limits, upload re-encoding and nonce CSP are added. The dependency audit has zero reported advisories after upgrading Sharp. Production web/worker images build locally; the Linux worker's real Chromium/font/canvas/ffmpeg smoke passes.

CSV import, WarriorPlus/JVZoo webhooks and SMTP/email are deferred by the owner. Buyers are provisioned through Admin → Users and credentials are delivered manually. Do not enable deferred integrations. The owner also requested skipping further 200-book load testing; no such test is required for the remaining work. A historical mock run completed before that instruction and cleaned up its temporary accounts.

Local verification does not certify the VPS or Supabase Cloud. Deployment, production backups/restore, monitoring and a real-provider smoke remain external steps.

## 1. Prepare infrastructure

Use a Linux VPS with Docker Engine and the Compose plugin. The original sizing target is 8 vCPU / 16 GB RAM. Use SSH keys, retain a tested SSH login and allow only the actual SSH port plus 80/443 through the firewall. Install unattended OS security updates. Put the checkout at `/opt/booksaga` and deploy a reviewed release/tag.

Create or select the production Supabase project. Keep signup disabled, set the site URL and allowed redirects to the chosen app URL, and apply **all migrations, including 13–15**:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase migration list
```

Verify the eight storage buckets and their policies. Apply all 16 migrations; migration 16 supplies explicit API-hook and sequence grants for new projects. Migration 13 installs the worker ownership hook on PostgREST; the worker refuses to process jobs if that hook is not active. Stop old worker versions before applying the fencing migration, then start the matching new worker image.

## 2. Configure a private preview without a domain

On the VPS:

```sh
cp docker/production.env.example .env.production
chmod 600 .env.production
```

Fill the Supabase Cloud URL, public anon key, private service-role key and other required settings. Generate the settings encryption key with `openssl rand -base64 32`. Keep server secrets in this file on the VPS; the Docker build context excludes env files. Only the public Supabase URL and anon key are build arguments.

The example uses:

```dotenv
APP_URL=http://localhost:8080
CADDYFILE=./Caddyfile.preview
HTTP_BIND=127.0.0.1
HTTP_PORT=8080
HTTPS_BIND=127.0.0.1
AI_MODE=mock
```

Build and start:

```sh
docker compose --env-file .env.production -f docker/docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker/docker-compose.prod.yml build
docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d
```

From your own computer, open the private tunnel:

```sh
ssh -L 8080:127.0.0.1:8080 YOUR_SSH_USER@YOUR_VPS_IP
```

Open `http://localhost:8080` while that connection is active. Caddy listens on the VPS loopback interface for this preview. Redis and worker health ports remain unpublished.

Create the admin from the worker container. The command generates credentials when no password is supplied; keep that output private:

```sh
docker compose --env-file .env.production -f docker/docker-compose.prod.yml exec worker node --import tsx scripts/create-admin.ts --email YOUR_ADMIN_EMAIL
```

## 3. When the domain is decided

Point its DNS to the VPS, then change:

```dotenv
APP_URL=https://YOUR_APP_DOMAIN
CADDYFILE=./Caddyfile
HTTP_BIND=0.0.0.0
HTTP_PORT=80
HTTPS_BIND=0.0.0.0
```

Update Supabase auth site/redirect URLs. Recreate the services with Compose. Caddy provisions HTTPS; the app applies HSTS when `APP_URL` is HTTPS. Changing the public Supabase URL or anon key requires rebuilding the web image because Next.js embeds those public values.

## 4. Operational checks

Verify all services are healthy, then sign in as admin and create one buyer manually. Confirm assigned features, credits, read-only preview, downloads and public policy pages. Set a real release image tag rather than relying on `local` for rollbacks.

For a real-provider smoke, set `AI_MODE=live`, fill the text/Replicate credentials and restart worker/web. Generate one Short book, one cover, an export and one audiobook chapter; record elapsed time and actual provider cost. This production smoke has not been performed locally on the new infrastructure. No 200-book load test is needed in the current scope.

Use `docker run --rm --shm-size=1g booksaga-worker:YOUR_TAG node --import tsx src/testing/container-smoke.ts` for an offline check of Chromium, embedded fonts, canvas and ffmpeg.

## 5. Backups and monitoring

Install PostgreSQL dump/restore clients compatible with the production database. Configure `SUPABASE_DB_URL`, `BACKUP_DIR` and `BACKUP_SSH_DEST` in the protected environment file. Create a `booksaga` system user, give it access to its backup directory and the offsite SSH key, and install the supplied systemd units:

```sh
sudo cp docker/booksaga-backup.service docker/booksaga-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now booksaga-backup.timer
```

Run the backup service manually once and inspect its log. The script creates a private custom-format dump, validates its archive listing, copies it offsite and retains eight weeks of local dumps. Archive validation is not a restore rehearsal.

A database dump does **not** include Supabase Storage object bytes. Configure separate backups of the bucket objects and test restoring both the database and objects to a disposable environment. Verify the provider's own backup/restore availability. These infrastructure checks remain pending until real services and destinations are available.

Configure external uptime monitoring for the HTTPS app and `/api/healthz`, and an internal check for the worker. Review failed jobs and AI costs in Admin. Docker log rotation is already configured.

## 6. Release and rollback

Keep prior web/worker image tags. Back up before deployment. Roll back both images to the previous matching release if needed, while retaining forward-compatible migrations; use a new migration for database fixes. Check readiness, buyer login, queued jobs and ledger state after any rollout.

See [ADMIN_RUNBOOK.md](./ADMIN_RUNBOOK.md) for manual delivery, refunds, job recovery and support workflows. The remaining deployment inputs are the VPS address/SSH user and the selected Supabase Cloud project; the public domain can be added later.
