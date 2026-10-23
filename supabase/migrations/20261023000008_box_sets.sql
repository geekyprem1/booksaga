-- BookSaga 0008: box sets (T6.4)
--
-- A box set bundles several generated books of one series into a single EPUB (nested table of
-- contents) with an optional cover. Files live in the `exports` bucket.

create table public.box_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  title text not null,
  book_ids uuid[] not null default '{}',
  description text,
  cover_path text,
  epub_path text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index box_sets_series_idx on public.box_sets (series_id, created_at desc);
create index box_sets_user_idx on public.box_sets (user_id, created_at desc);

create trigger set_updated_at before update on public.box_sets
  for each row execute function extensions.moddatetime(updated_at);

alter table public.box_sets enable row level security;

create policy box_sets_select on public.box_sets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.box_sets to authenticated;
grant all on public.box_sets to service_role;
