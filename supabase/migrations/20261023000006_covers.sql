-- BookSaga 0006: covers + images (M4)
--
-- `covers` holds every generated cover for a book: the original AI art (text-less), the flattened
-- output that ships to KDP, and the layer JSON the editor works with. `is_active` marks the one
-- cover per (book, type) that the rest of the app shows — enforced by a partial unique index.
--
-- `images` is the user's library (their uploads and AI art they chose to keep).

create table public.covers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  type text not null default 'ebook' check (type in ('ebook', 'paperback', 'audiobook', 'boxset')),
  -- Original generated artwork (no text) in the `cover-art` bucket.
  art_path text,
  -- Flattened, KDP-ready file in the `covers` bucket (JPG for ebook, PDF for paperback wrap).
  final_path text,
  -- Konva-compatible layer list: [{ kind, text, x, y, w, align, size, weight, color, effects }]
  layers jsonb,
  mode text not null default 'overlay' check (mode in ('overlay', 'ai_text')),
  prompt text,
  is_active boolean not null default false,
  -- Paperback wrap needs the interior page count; the wrap goes stale when the book is re-exported.
  page_count integer,
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index covers_book_idx on public.covers (book_id, type, created_at desc);
-- Only one active cover per book and type.
create unique index covers_one_active on public.covers (book_id, type) where is_active;

create table public.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Path inside the `uploads` bucket: {userId}/images/{id}.{ext}
  path text not null,
  source text not null default 'upload' check (source in ('ai', 'upload')),
  prompt text,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index images_user_idx on public.images (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.covers
  for each row execute function extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- RLS: owners read their own covers/images; writes go through the service role.
-- ---------------------------------------------------------------------------
alter table public.covers enable row level security;
alter table public.images enable row level security;

create policy covers_select on public.covers for select to authenticated
  using (
    exists (
      select 1 from public.books b
      where b.id = covers.book_id and (select public.owns_series(b.series_id))
    )
    or (select public.is_admin())
  );

create policy images_select on public.images for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.covers, public.images to authenticated;
grant all on public.covers, public.images to service_role;
