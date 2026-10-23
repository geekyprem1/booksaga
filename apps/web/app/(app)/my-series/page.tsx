import Link from 'next/link';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SeriesCardActions } from '@/components/series/series-card-actions';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'My Series' };
export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'active', 'completed', 'archived'] as const;

function sanitize(value: string): string {
  return value.replace(/[,()*%\\"']/g, ' ').trim().slice(0, 80);
}

export default async function MySeriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    genre?: string;
    sort?: string;
    view?: string;
    trash?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const db = getAdminDb();

  const q = sanitize(params.q ?? '');
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number])
    ? params.status
    : undefined;
  const genre = sanitize(params.genre ?? '');
  const sort = params.sort === 'name' ? 'name' : 'recent';
  const view = params.view === 'list' ? 'list' : 'grid';
  const trash = params.trash === '1';

  let query = db.from('series').select('*').eq('user_id', user.id);
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
  if (q) query = query.or(`title.ilike.%${q}%,idea.ilike.%${q}%,pen_name.ilike.%${q}%`);
  if (status) query = query.eq('status', status);
  if (genre) query = query.eq('genre', genre);
  query =
    sort === 'name'
      ? query.order('title', { ascending: true })
      : query.order('updated_at', { ascending: false });

  const { data: series } = await query;
  const list = series ?? [];
  const ids = list.map((s) => s.id);

  const { data: books } = ids.length
    ? await db.from('books').select('series_id, status, word_count').in('series_id', ids)
    : { data: [] as { series_id: string; status: string; word_count: number | null }[] };

  const bySeries = new Map<string, { written: number; total: number; words: number }>();
  for (const book of books ?? []) {
    const entry = bySeries.get(book.series_id) ?? { written: 0, total: 0, words: 0 };
    entry.total += 1;
    if (book.status === 'generated') {
      entry.written += 1;
      entry.words += book.word_count ?? 0;
    }
    bySeries.set(book.series_id, entry);
  }

  const { data: allSeries } = await db
    .from('series')
    .select('genre, pen_name')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  const genres = [...new Set((allSeries ?? []).map((s) => s.genre))].sort();

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q, status, genre, sort, view, trash: trash ? '1' : undefined, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const s = next.toString();
    return s ? `/my-series?${s}` : '/my-series';
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{trash ? 'Trash' : 'My Series'}</h1>
          <p className="mt-1 text-muted-foreground">
            {trash
              ? 'Deleted series stay here for 30 days, then they are purged.'
              : `${list.length} series · pick up where you left off.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href={trash ? '/my-series' : '/my-series?trash=1'}>
              {trash ? 'Back to My Series' : 'Trash'}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/create-series">
              <Plus aria-hidden="true" /> New series
            </Link>
          </Button>
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        {trash ? <input type="hidden" name="trash" value="1" /> : null}
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            aria-label="Search series"
            placeholder="Search title, idea or pen name…"
            className="pl-9"
          />
        </div>
        <Select name="status" defaultValue={status ?? ''} aria-label="Status" className="w-36">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select name="genre" defaultValue={genre} aria-label="Genre" className="w-44">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={sort} aria-label="Sort" className="w-36">
          <option value="recent">Recently updated</option>
          <option value="name">Name (A–Z)</option>
        </Select>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <Link
            href={qs({ view: 'grid' })}
            aria-current={view === 'grid' ? 'true' : undefined}
            className={`px-3 py-2 text-xs ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            Grid
          </Link>
          <Link
            href={qs({ view: 'list' })}
            aria-current={view === 'list' ? 'true' : undefined}
            className={`px-3 py-2 text-xs ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
          >
            List
          </Link>
        </div>
      </form>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <BookOpen className="size-7 text-violet-300" aria-hidden="true" />
            <p className="font-semibold">{trash ? 'Trash is empty' : 'No series yet'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {trash
                ? 'Deleted series will appear here.'
                : 'Turn one idea into a connected, KDP-ready series.'}
            </p>
            {!trash ? (
              <Button asChild>
                <Link href="/create-series">Create your first series</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            view === 'grid'
              ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
              : 'flex flex-col gap-3'
          }
        >
          {list.map((item) => {
            const stats = bySeries.get(item.id) ?? { written: 0, total: 0, words: 0 };
            return (
              <Card key={item.id} className={view === 'list' ? 'p-1' : undefined}>
                <CardContent
                  className={
                    view === 'list'
                      ? 'flex flex-wrap items-center justify-between gap-4 p-3'
                      : 'flex h-full flex-col gap-3 p-4'
                  }
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/series/${item.id}`}
                      className="text-lg font-bold hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.genre} · {item.pen_name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge
                        variant={
                          item.status === 'active'
                            ? 'success'
                            : item.status === 'archived'
                              ? 'muted'
                              : 'default'
                        }
                      >
                        {item.status}
                      </Badge>
                      <Badge variant="muted">
                        {stats.written}/{item.planned_books} parts
                      </Badge>
                      {stats.words > 0 ? (
                        <Badge variant="muted">{formatNumber(stats.words)} words</Badge>
                      ) : null}
                    </div>
                    {view === 'grid' ? (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.idea}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/series/${item.id}`}>Open</Link>
                    </Button>
                    <SeriesCardActions
                      seriesId={item.id}
                      status={item.status}
                      inTrash={trash}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
