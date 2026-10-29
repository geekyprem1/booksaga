# Supabase Cloud and Coolify

The app runs on your VPS through Coolify. Supabase Cloud provides Postgres, authentication,
Realtime and file storage. Redis and the background worker run alongside the web service in Coolify.
No CSV importer, payment webhook or SMTP setup is required in the current scope.

## 1. Create a fresh Supabase project

Create a project in the Supabase dashboard and choose a region close to your VPS. Save its database
password privately. This guide assumes a fresh production project, separate from the local test data.
You do not need to create application tables or upload local test users manually.

From the project's Connect dialog / API Keys settings, obtain:

| Supabase value                                 | Existing BookSaga environment variable |
| ---------------------------------------------- | -------------------------------------- |
| Project URL, `https://PROJECT_REF.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL`             |
| Publishable key, `sb_publishable_…`            | `NEXT_PUBLIC_SUPABASE_ANON_KEY`        |
| Secret key, `sb_secret_…`                      | `SUPABASE_SERVICE_ROLE_KEY`            |

The variable names in this repository are retained for compatibility; a publishable key is public,
and a secret key belongs only in the server/worker runtime. Legacy anon/service-role keys remain
compatible while enabled, but Supabase recommends the newer key types. Do not commit secret keys
to GitHub or mark the server secret as a browser/build variable.

## 2. Apply the database migrations from this repository

In a local terminal at the BookSaga repository root, with the Supabase CLI available:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
supabase migration list
```

Enter the database password when the CLI prompts. The project reference is the identifier in the
project URL. Review the dry-run list, then apply it to the intended project. All **16** migrations in
`supabase/migrations/` must appear as applied. The local default auth configuration is not pushed by
`db push`; configure the hosted Auth settings separately below.

Migrations create the schema, RLS policies, credit functions, default plans/costs/settings, storage
buckets and Realtime publication membership. They also install the worker ownership hook and
explicit Data API grants for fresh Supabase projects. The worker checks that this hook is active
before starting. Stop old worker binaries before rolling out the fencing migrations to an existing
deployment, and use the matching new application version.

Run migration pushes without `--include-seed`; local test fixtures are not production data.
Starter templates and DFY content are optional separate seed operations and are not created by
schema migration alone. Template artwork generation requires paid provider access.

## 3. Configure hosted Auth and check Storage

In Supabase Authentication:

- Keep the Email/password provider enabled.
- Disable **Allow new users to sign up**; accounts are created by BookSaga admin actions.
- Keep anonymous sign-ins disabled.
- Set **Site URL** to the public app URL generated/configured in Coolify.
- Add that app origin to the allowed redirect URLs where needed. Update these settings when the
  final domain changes. A temporary Coolify app URL can be used first.

No SMTP is required for manual delivery: the admin provisioning code creates confirmed users and
prints/copies their credentials. Password reset emails remain deferred.

In Storage, verify these eight buckets exist: `cover-art`, `covers`, `exports`, `audio`, `uploads`,
`avatars`, `template-assets`, `branding`. Only the last two are public. Migrations provide the bucket
policies; keep RLS enabled. Check your project's upload-size limits before exporting large files.
Local manuscripts, files and test accounts are not automatically copied to the Cloud project.

## 4. Deploy from GitHub in Coolify

Create a Git-based Application and select **Docker Compose** as the build strategy. Use:

```text
Base Directory: /
Docker Compose Location: /docker/docker-compose.coolify.yml
Public service: web
Internal web port: 3000
```

Use this Coolify-specific file, rather than the standalone VPS Compose file that starts its own
Caddy proxy and reads `.env.production`. Coolify manages domains/HTTPS and supplies env values from
its dashboard. Do not expose the `worker` or `redis` service publicly.

Set these required variables in Coolify:

```dotenv
APP_URL=https://YOUR_TEMPORARY_OR_FINAL_APP_HOST
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SECRET_KEY
SETTINGS_ENCRYPTION_KEY=YOUR_RANDOM_32_BYTE_BASE64_KEY
AI_MODE=mock
```

Generate the encryption key locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Both `NEXT_PUBLIC_…` values are passed as web Docker build arguments as well as runtime values;
ensure they are available at build time in Coolify. The service-role/secret key and provider keys
are runtime secrets. Changing public Supabase values requires rebuilding the web image.

Under Domains, select `web` and point the route at its internal port, for example
`https://YOUR_APP_HOST:3000`. The `:3000` identifies the receiving container port; the public site
still uses normal HTTPS. Set `APP_URL` to the actual public origin **without** the internal port.
You may use a Coolify-generated temporary domain until the final domain is chosen.

Redis uses a persistent volume and is wired internally by the Compose file. Start with `AI_MODE=mock`
to check the infrastructure. For live generation, set `AI_MODE=live`, `TEXT_API_KEY` and
`REPLICATE_API_TOKEN`, choose the text models and redeploy. Image model/quality remain fixed to the
project's low-quality GPT Image 2 policy.

## 5. Create the first admin

After migrations and deployment succeed, open the **worker** terminal in Coolify:

```sh
node --import tsx scripts/create-admin.ts --email YOUR_ADMIN_EMAIL
```

Save the generated password privately. Then log in at `/login` and use Admin → Users to provision
buyers. Do not create an admin by changing browser user metadata. The script grants the admin's
plans and credits through the same provisioning code as the app.

Verify `/api/healthz`, buyer login, one mock generation and downloads. The final real-provider smoke,
production backup/restore and monitoring setup remain infrastructure checks. Further 200-book load
testing is deferred at the owner's request.

## Official references

- [Supabase CLI workflow and migration pushes](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase API grants](https://supabase.com/docs/guides/api/securing-your-api)
- [Coolify Docker Compose applications](https://coolify.io/docs/applications/builds/docker-compose)
