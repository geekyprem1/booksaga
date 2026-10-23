-- BookSaga 0009: audiobooks (T6.11)
--
-- One row per narration run. `chapters` holds the finished MP3s so a retry can resume where the
-- previous attempt stopped.

create table public.audiobooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  voice text not null,
  speed numeric(3, 2) not null default 1.00,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed')),
  -- [{ number, title, path, durationSec, chars }]
  chapters jsonb not null default '[]'::jsonb,
  zip_path text,
  cover_path text,
  total_seconds integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audiobooks_book_idx on public.audiobooks (book_id, created_at desc);
create index audiobooks_user_idx on public.audiobooks (user_id, created_at desc);

create trigger set_updated_at before update on public.audiobooks
  for each row execute function extensions.moddatetime(updated_at);

alter table public.audiobooks enable row level security;

create policy audiobooks_select on public.audiobooks for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.audiobooks to authenticated;
grant all on public.audiobooks to service_role;
