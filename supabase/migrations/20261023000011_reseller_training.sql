-- BookSaga 0011: reseller, franchise and training (T6.18, T6.21)

-- ---------------------------------------------------------------------------
-- Reseller licences: one licence = the right to create one FE customer account.
-- ---------------------------------------------------------------------------
create table public.reseller_licenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'available'
    check (status in ('available', 'used', 'revoked')),
  customer_id uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reseller_licenses_owner_idx on public.reseller_licenses (owner_id, status);
create index reseller_licenses_customer_idx on public.reseller_licenses (customer_id)
  where customer_id is not null;

create trigger set_updated_at before update on public.reseller_licenses
  for each row execute function extensions.moddatetime(updated_at);

alter table public.reseller_licenses enable row level security;
create policy reseller_licenses_select on public.reseller_licenses for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.reseller_licenses to authenticated;
grant all on public.reseller_licenses to service_role;

-- ---------------------------------------------------------------------------
-- Franchise kit assets (T6.20): sales pages, swipes, banners, demo videos.
-- ---------------------------------------------------------------------------
create table public.franchise_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sales_page', 'swipe', 'banner', 'video', 'other')),
  title text not null,
  description text,
  url text,
  storage_path text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index franchise_assets_kind_idx on public.franchise_assets (kind, sort_order);

create trigger set_updated_at before update on public.franchise_assets
  for each row execute function extensions.moddatetime(updated_at);

alter table public.franchise_assets enable row level security;
create policy franchise_assets_select on public.franchise_assets for select to authenticated
  using (is_published or (select public.is_admin()));
grant select on public.franchise_assets to authenticated;
grant all on public.franchise_assets to service_role;

-- ---------------------------------------------------------------------------
-- Training (T6.21)
-- ---------------------------------------------------------------------------
create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules (id) on delete cascade,
  title text not null,
  description text,
  video_url text,
  duration_minutes integer,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);
create index training_lessons_module_idx on public.training_lessons (module_id, sort_order);

create table public.training_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.training_lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.training_modules enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_progress enable row level security;

create policy training_modules_select on public.training_modules for select to authenticated
  using (is_published or (select public.is_admin()));
create policy training_lessons_select on public.training_lessons for select to authenticated
  using (is_published or (select public.is_admin()));
create policy training_progress_select on public.training_progress for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.training_modules to authenticated;
grant select on public.training_lessons to authenticated;
grant select on public.training_progress to authenticated;
grant all on public.training_modules to service_role;
grant all on public.training_lessons to service_role;
grant all on public.training_progress to service_role;

-- Starter curriculum so the page is never empty.
insert into public.training_modules (slug, title, description, sort_order) values
  ('start-here', 'Start Here', 'The 30-minute path from idea to your first generated book.', 1),
  ('publishing', 'Publishing on KDP', 'Upload, link the series, and stay out of review trouble.', 2),
  ('scaling', 'Scaling an Agency', 'Client accounts, allotments and delivering on time.', 3)
on conflict (slug) do nothing;

insert into public.training_lessons (module_id, title, description, video_url, duration_minutes, sort_order)
select m.id, v.title, v.description, v.video_url, v.duration, v.ord
from public.training_modules m
join (values
  ('start-here', 'Create your first series', 'Idea, genre, length preset and the 9-part plan.', null, 7, 1),
  ('start-here', 'Understand the roadmap', 'What each part is, and when the next one unlocks.', null, 5, 2),
  ('start-here', 'Covers that sell', 'Cover Studio, style lock and the paperback wrap.', null, 9, 3),
  ('publishing', 'Export and pre-flight', 'EPUB, print PDF, metadata and the KDP preview checks.', null, 8, 1),
  ('publishing', 'Linking a series', 'Series titles, reading order and the Read Next page.', null, 6, 2),
  ('scaling', 'Agency clients', 'Create a login, set an allotment, watch the pool.', null, 10, 1)
) as v(slug, title, description, video_url, duration, ord) on v.slug = m.slug
where not exists (
  select 1 from public.training_lessons l where l.module_id = m.id and l.title = v.title
);
