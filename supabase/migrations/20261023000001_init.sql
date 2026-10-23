-- BookSaga 0001: core schema (M1)
-- Tables: profiles, plans, purchases, user_plans, jobs, credit_balances, credit_ledger, credit_costs,
--         agency_clients, app_settings, audit_log, notifications, ai_usage_log
-- Also: updated_at triggers, auth.users -> profiles trigger, storage buckets.
-- RLS policies live in 0002, credit functions in 0003, reference data in 0004.

create extension if not exists moddatetime with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  parent_agency_id uuid references public.profiles (id) on delete set null,
  reseller_owner_id uuid references public.profiles (id) on delete set null,
  avatar_url text,
  last_active_at timestamptz,
  credentials_pending boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_not_both_parent check (parent_agency_id is null or reseller_owner_id is null)
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_parent_agency_idx on public.profiles (parent_agency_id) where parent_agency_id is not null;
create index profiles_reseller_owner_idx on public.profiles (reseller_owner_id) where reseller_owner_id is not null;
create index profiles_credentials_pending_idx on public.profiles (created_at) where credentials_pending;

-- ---------------------------------------------------------------------------
-- plans (config table, pk = code). 11 plans: FE + 5 OTOs + 5 downsells.
-- ---------------------------------------------------------------------------
create table public.plans (
  code text primary key,
  name text not null,
  level text not null check (level in ('FE', 'OTO1', 'OTO2', 'OTO3', 'OTO4', 'OTO5')),
  is_downsell boolean not null default false,
  price_usd numeric(8, 2) not null default 0,
  limits jsonb not null default '{}'::jsonb,
  -- ONE-TIME credit grants added when the plan is granted (no monthly refill).
  grant_main_credits integer not null default 0 check (grant_main_credits >= 0),
  grant_audio_credits integer not null default 0 check (grant_audio_credits >= 0),
  grant_agency_credits integer not null default 0 check (grant_agency_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('manual', 'csv', 'warriorplus', 'jvzoo', 'launchpad')),
  txn_id text,
  product_id text,
  amount numeric(10, 2),
  status text not null default 'completed'
    check (status in ('completed', 'refunded', 'chargeback', 'cancelled')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index purchases_platform_txn_key on public.purchases (platform, txn_id) where txn_id is not null;
create index purchases_user_idx on public.purchases (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- user_plans: one row per granted plan. A user can hold each plan once while active.
-- ---------------------------------------------------------------------------
create table public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_code text not null references public.plans (code),
  source text not null default 'manual'
    check (source in ('manual', 'csv', 'warriorplus', 'jvzoo', 'launchpad', 'reseller', 'agency', 'system')),
  purchase_id uuid references public.purchases (id) on delete set null,
  granted_by uuid references public.profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- Credits actually granted by this row, e.g. {"main":300,"audio":0,"agency":0}. Used on refund.
  credits_granted jsonb not null default '{"main":0,"audio":0,"agency":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_plans_active_key on public.user_plans (user_id, plan_code) where status = 'active';
create index user_plans_user_idx on public.user_plans (user_id);
create index user_plans_purchase_idx on public.user_plans (purchase_id) where purchase_id is not null;

-- ---------------------------------------------------------------------------
-- jobs: mirror of queue state, read by the UI via Realtime.
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- series_plan | book | rewrite | cover | export | audiobook | boxset | enhance | arc_extend | ...
  type text not null,
  ref_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'active', 'completed', 'failed', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  step_label text,
  meta jsonb not null default '{}'::jsonb,
  error text,
  attempts integer not null default 0,
  credits_reserved integer not null default 0,
  ledger_id bigint,
  -- Format `{type}-{refId}-v{n}`. No ':' (BullMQ custom job ids must not contain it).
  idempotency_key text not null,
  heartbeat_at timestamptz,
  cancel_requested boolean not null default false,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_idempotency_key_format check (idempotency_key !~ ':')
);
create unique index jobs_idempotency_key_key on public.jobs (idempotency_key);
create index jobs_user_status_idx on public.jobs (user_id, status);
create index jobs_ref_idx on public.jobs (ref_id) where ref_id is not null;
create index jobs_reaper_idx on public.jobs (status, heartbeat_at) where status in ('queued', 'active');
-- A user can only have ONE queued/active book job (prevents two parallel clicks = two jobs).
create unique index jobs_one_active_book_per_user on public.jobs (user_id)
  where type = 'book' and status in ('queued', 'active');

-- ---------------------------------------------------------------------------
-- credits
-- ---------------------------------------------------------------------------
create table public.credit_balances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pool text not null check (pool in ('main', 'audio', 'agency')),
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pool)
);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  -- Owner of the pool that was charged/credited.
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Who triggered the action (differs from user_id for agency clients).
  acting_user_id uuid references public.profiles (id) on delete set null,
  pool text not null check (pool in ('main', 'audio', 'agency')),
  -- Signed: grants are +, debits are -.
  amount integer not null,
  status text not null
    check (status in ('grant', 'reserved', 'committed', 'refunded', 'adjust', 'revoked')),
  user_plan_id uuid references public.user_plans (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  reason text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_job_idx on public.credit_ledger (job_id) where job_id is not null;
-- Idempotency: a plan grants (and revokes) credits to a pool at most once.
create unique index credit_ledger_grant_once on public.credit_ledger (user_plan_id, pool)
  where status = 'grant';
create unique index credit_ledger_revoke_once on public.credit_ledger (user_plan_id, pool)
  where status = 'revoked';

create table public.credit_costs (
  action text primary key,
  credits integer not null check (credits >= 0),
  pool text not null default 'main' check (pool in ('main', 'audio')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- agency clients (owner allots a share of the one-time agency pool to each client)
-- ---------------------------------------------------------------------------
create table public.agency_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  allotment integer not null default 100 check (allotment >= 0),
  used integer not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_clients_not_self check (owner_id <> client_id)
);
create index agency_clients_owner_idx on public.agency_clients (owner_id);

-- ---------------------------------------------------------------------------
-- settings, audit, notifications, AI usage
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.ai_usage_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  provider text not null,
  model text not null,
  purpose text,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  images integer not null default 0,
  audio_seconds numeric(10, 2) not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_log_created_idx on public.ai_usage_log (created_at desc);
create index ai_usage_log_user_idx on public.ai_usage_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'plans', 'purchases', 'user_plans', 'jobs', 'credit_balances',
    'credit_costs', 'agency_clients', 'app_settings'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function extensions.moddatetime(updated_at)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- auth.users -> profiles. Role is NEVER read from user metadata.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when an admin changes the auth email.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Storage buckets (8). Private except template-assets and branding.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cover-art',       'cover-art',       false, 20971520,  array['image/png', 'image/jpeg', 'image/webp']),
  ('covers',          'covers',          false, 52428800,  array['image/png', 'image/jpeg', 'application/pdf']),
  ('exports',         'exports',         false, 524288000, null),
  ('audio',           'audio',           false, 524288000, array['audio/mpeg', 'audio/wav', 'application/zip']),
  ('uploads',         'uploads',         false, 10485760,  array['image/png', 'image/jpeg', 'image/webp']),
  ('avatars',         'avatars',         false, 2097152,   array['image/png', 'image/jpeg', 'image/webp']),
  ('template-assets', 'template-assets', true,  10485760,  array['image/png', 'image/jpeg', 'image/webp']),
  ('branding',        'branding',        true,  10485760,  null)
on conflict (id) do nothing;
