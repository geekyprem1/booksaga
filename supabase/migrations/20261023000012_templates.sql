-- BookSaga 0012: templates and Done-For-You content (T6.5)
--
-- `templates` powers the Series Templates page (lite = a handful per category, full = everything).
-- `dfy_ideas` and `dfy_packs` power the Done-For-You pages.

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  subtitle text,
  premise text not null,
  genre text not null,
  tone text,
  audience text,
  length_preset text not null default 'standard' check (length_preset in ('short', 'standard', 'full')),
  planned_books integer not null default 6 check (planned_books between 1 and 24),
  keywords text[] not null default '{}',
  cover_path text,
  tier text not null default 'lite' check (tier in ('lite', 'full')),
  uses integer not null default 0,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index templates_category_idx on public.templates (category, sort_order);
create index templates_tier_idx on public.templates (tier);

create trigger set_updated_at before update on public.templates
  for each row execute function extensions.moddatetime(updated_at);

create table public.dfy_ideas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  niche text not null,
  title text not null,
  premise text not null,
  hook text,
  keywords text[] not null default '{}',
  tier text not null default 'lite' check (tier in ('lite', 'full')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index dfy_ideas_niche_idx on public.dfy_ideas (niche, sort_order);

create table public.dfy_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  genre text not null,
  -- { blurbs: string[], keywords: string[], categories: string[] }
  contents jsonb not null default '{}'::jsonb,
  tier text not null default 'lite' check (tier in ('lite', 'full')),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.templates enable row level security;
alter table public.dfy_ideas enable row level security;
alter table public.dfy_packs enable row level security;

create policy templates_select on public.templates for select to authenticated
  using (is_published or (select public.is_admin()));
create policy dfy_ideas_select on public.dfy_ideas for select to authenticated
  using (is_published or (select public.is_admin()));
create policy dfy_packs_select on public.dfy_packs for select to authenticated
  using (is_published or (select public.is_admin()));

grant select on public.templates to authenticated;
grant select on public.dfy_ideas to authenticated;
grant select on public.dfy_packs to authenticated;
grant all on public.templates to service_role;
grant all on public.dfy_ideas to service_role;
grant all on public.dfy_packs to service_role;
