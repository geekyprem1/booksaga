-- BookSaga 0005: series, bible, books, chapters (M2)
--
-- Ownership model: everything hangs off `series.user_id`. Child tables are reachable through
-- `public.owns_series(series_id)` (SECURITY DEFINER, so no recursive RLS). Writes go through the
-- service role (Server Actions / worker); browsers only read their own rows.
--
-- Resumability: `books.outline`, `books.continuity_report`, `books.metadata` stay NULL until the
-- pipeline step that fills them has finished, and `chapters.status` is the per-chapter checkpoint.

-- ---------------------------------------------------------------------------
-- pen names (Create Series dropdown; full CRUD by the owner)
-- ---------------------------------------------------------------------------
create table public.pen_names (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index pen_names_user_idx on public.pen_names (user_id, created_at);

-- ---------------------------------------------------------------------------
-- series
-- ---------------------------------------------------------------------------
create table public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  idea text not null check (length(btrim(idea)) between 1 and 2000),
  genre text not null,
  is_fiction boolean not null default true,
  tone text not null default 'Engaging & Cinematic',
  audience text not null default 'Adults',
  pen_name text not null default '',
  planned_books integer not null default 5 check (planned_books between 1 and 30),
  language text not null default 'en' check (language = 'en'),
  -- trim, paper, bleed, pov, tense, autoCovers (PRD §8.3, §8.4)
  settings jsonb not null default
    '{"trim":"6x9","paper":"white","bleed":false,"pov":"third","tense":"past","autoCovers":false}'::jsonb,
  -- { overview, books:[{ partNumber, title, premise, question, cliffhanger }] } (series_plan step)
  arc jsonb,
  cover_style jsonb,
  -- templates ship in M6; kept as a plain uuid so the column does not need a later migration.
  template_id uuid,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  deleted_at timestamptz,
  search tsvector generated always as (to_tsvector('english', title || ' ' || idea)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index series_user_idx on public.series (user_id, created_at desc);
create index series_active_idx on public.series (user_id) where deleted_at is null;
create index series_search_idx on public.series using gin (search);

-- ---------------------------------------------------------------------------
-- books (one row per part; locked -> ready -> generating -> generated)
-- ---------------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  part_number integer not null check (part_number between 1 and 30),
  title text not null default '',
  subtitle text,
  premise text not null default '',
  length_preset text not null default 'standard' check (length_preset in ('short', 'standard', 'full')),
  status text not null default 'locked'
    check (status in ('locked', 'ready', 'generating', 'generated', 'failed')),
  -- { chapters:[{ number, title, beats, pov, characters, targetWords }], resolution, cliffhanger }
  outline jsonb,
  summary text,
  word_count integer not null default 0,
  -- { title, subtitle, blurb, keywords[], categories[], readNext, authorBio, alsoInSeries }
  metadata jsonb,
  -- { issues:[{ type, detail, chapterNumber, paragraph, resolved }] }
  continuity_report jsonb,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, part_number)
);
create index books_series_idx on public.books (series_id, part_number);
create index books_status_idx on public.books (series_id, status);

-- ---------------------------------------------------------------------------
-- chapters (content = TipTap JSON, content_text = plain text for search/AI/export)
-- ---------------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  number integer not null check (number >= 1),
  title text not null default '',
  content jsonb,
  content_text text not null default '',
  summary text,
  word_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'generating', 'done', 'failed')),
  search tsvector generated always as (to_tsvector('english', content_text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (book_id, number)
);
create index chapters_book_idx on public.chapters (book_id, number);
create index chapters_search_idx on public.chapters using gin (search);

create table public.chapter_versions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  content jsonb not null,
  content_text text not null default '',
  source text not null default 'ai' check (source in ('ai', 'user', 'rewrite')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index chapter_versions_chapter_idx on public.chapter_versions (chapter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- series bible (current snapshot + immutable history)
-- ---------------------------------------------------------------------------
create table public.series_bible (
  series_id uuid primary key references public.series (id) on delete cascade,
  -- { characters:{id:{...}}, locations:{id:{...}}, world:{...}, timeline:[...], threads:[...],
  --   glossary:{...}, style:{...}, conflicts:[...] }
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bible_versions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  version integer not null check (version >= 1),
  data jsonb not null,
  source text not null default 'ai' check (source in ('ai', 'user')),
  book_id uuid references public.books (id) on delete set null,
  chapter_id uuid references public.chapters (id) on delete set null,
  -- { added:[ids], updated:[ids], conflicts:[...] }
  diff jsonb,
  created_at timestamptz not null default now(),
  unique (series_id, version)
);
create index bible_versions_series_idx on public.bible_versions (series_id, version desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pen_names', 'series', 'books', 'chapters', 'series_bible']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function extensions.moddatetime(updated_at)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create function public.owns_series(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.series s
    where s.id = p_series and s.user_id = (select auth.uid())
  );
$$;

create function public.owns_book(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.books b
    join public.series s on s.id = b.series_id
    where b.id = p_book and s.user_id = (select auth.uid())
  );
$$;

create function public.owns_chapter(p_chapter uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    join public.books b on b.id = c.book_id
    join public.series s on s.id = b.series_id
    where c.id = p_chapter and s.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_series(uuid) from public, anon;
revoke all on function public.owns_book(uuid) from public, anon;
revoke all on function public.owns_chapter(uuid) from public, anon;
grant execute on function public.owns_series(uuid) to authenticated, service_role;
grant execute on function public.owns_book(uuid) to authenticated, service_role;
grant execute on function public.owns_chapter(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.pen_names enable row level security;
alter table public.series enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_versions enable row level security;
alter table public.series_bible enable row level security;
alter table public.bible_versions enable row level security;

-- pen names: the owner manages them from the UI.
create policy pen_names_owner on public.pen_names for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- series: owner, their agency owner (read-only), admins.
create policy series_select on public.series for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_agency_owner_of(user_id))
    or (select public.is_admin())
  );

create policy books_select on public.books for select to authenticated
  using (
    (select public.owns_series(series_id))
    or (select public.is_admin())
  );

create policy chapters_select on public.chapters for select to authenticated
  using (
    exists (
      select 1 from public.books b
      where b.id = chapters.book_id and (select public.owns_series(b.series_id))
    )
    or (select public.is_admin())
  );

create policy series_bible_select on public.series_bible for select to authenticated
  using ((select public.owns_series(series_id)) or (select public.is_admin()));

create policy bible_versions_select on public.bible_versions for select to authenticated
  using ((select public.owns_series(series_id)) or (select public.is_admin()));

create policy chapter_versions_select on public.chapter_versions for select to authenticated
  using ((select public.owns_chapter(chapter_id)) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.pen_names, public.series, public.books, public.chapters,
  public.chapter_versions, public.series_bible, public.bible_versions
  to authenticated;

-- The owner writes pen names directly (RLS-scoped); every other write is server-side.
grant insert, update, delete on public.pen_names to authenticated;

grant all on public.pen_names, public.series, public.books, public.chapters,
  public.chapter_versions, public.series_bible, public.bible_versions
  to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: roadmap + book cards update live
-- ---------------------------------------------------------------------------
alter table public.books replica identity full;
alter publication supabase_realtime add table public.books;
