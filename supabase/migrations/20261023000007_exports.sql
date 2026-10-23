-- BookSaga 0006: exports (M5)
--
-- One row per export run. `files` maps a format to its object path in the `exports` bucket; the
-- bucket already exists from 0001. Files expire after 30 days and are cleaned by the
-- `export_cleanup` cron.

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid references public.books (id) on delete cascade,
  series_id uuid references public.series (id) on delete cascade,
  formats text[] not null default '{}',
  -- { epub: "path", pdf: "path", docx: "path", metadata: "path", cover: "path", zip: "path" }
  files jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exports_has_target check (book_id is not null or series_id is not null)
);
create index exports_user_idx on public.exports (user_id, created_at desc);
create index exports_book_idx on public.exports (book_id) where book_id is not null;
create index exports_expiry_idx on public.exports (expires_at) where status = 'ready';

create trigger set_updated_at before update on public.exports
  for each row execute function extensions.moddatetime(updated_at);

alter table public.exports enable row level security;

create policy exports_select on public.exports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.exports to authenticated;
grant all on public.exports to service_role;
