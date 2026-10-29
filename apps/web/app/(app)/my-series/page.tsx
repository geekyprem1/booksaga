import Link from 'next/link';
import { BookOpen, Plus, Search } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { SeriesCardActions } from '@/components/series/series-card-actions';
import { Roadmap, type RoadmapPart } from '@/components/series/roadmap';
import { LibraryLive } from '@/components/series/library-live';
import type { LengthPreset } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { getCreditCosts } from '@/lib/credits';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'My Series' };
export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'active', 'completed', 'archived'] as const;

function sanitize(value: string): string {
  return value
    .replace(/[,()*%\\"']/g, ' ')
    .trim()
    .slice(0, 80);
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

  const [{ data: books }, { account }, creditCosts] = await Promise.all([
    ids.length
      ? db
          .from('books')
          .select('id, series_id, part_number, title, premise, status, length_preset, word_count')
          .in('series_id', ids)
          .order('part_number')
      : Promise.resolve({ data: [] }),
    getAccount(),
    getCreditCosts(['book_short', 'book_standard', 'book_full']),
  ]);
  const bookIds = (books ?? []).map((book) => book.id);
  const [{ data: covers }, { data: chapters }, { data: jobs }] = await Promise.all([
    bookIds.length
      ? db
          .from('covers')
          .select('book_id, final_path')
          .in('book_id', bookIds)
          .eq('type', 'ebook')
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
    bookIds.length
      ? db.from('chapters').select('book_id').in('book_id', bookIds)
      : Promise.resolve({ data: [] }),
    bookIds.length
      ? db
          .from('jobs')
          .select('id, ref_id, status, progress, step_label')
          .eq('type', 'book')
          .in('ref_id', bookIds)
          .in('status', ['queued', 'active'])
      : Promise.resolve({ data: [] }),
  ]);
  const coverUrls = new Map<string, string>();
  await Promise.all(
    (covers ?? []).map(async (cover) => {
      if (!cover.final_path) return;
      const { data } = await db.storage.from('covers').createSignedUrl(cover.final_path, 3600);
      if (data?.signedUrl) coverUrls.set(cover.book_id, data.signedUrl);
    }),
  );
  const chapterCounts = new Map<string, number>();
  for (const chapter of chapters ?? [])
    chapterCounts.set(chapter.book_id, (chapterCounts.get(chapter.book_id) ?? 0) + 1);
  const activeJobs = new Map(
    (jobs ?? []).filter((job) => job.ref_id).map((job) => [job.ref_id!, job]),
  );
  const partsBySeries = new Map<string, RoadmapPart[]>();
  for (const book of books ?? []) {
    const job = activeJobs.get(book.id);
    const parts = partsBySeries.get(book.series_id) ?? [];
    parts.push({
      id: book.id,
      partNumber: book.part_number,
      title: book.title,
      premise: book.premise,
      status: book.status as RoadmapPart['status'],
      jobStatus: (job?.status as 'queued' | 'active' | undefined) ?? null,
      lengthPreset: book.length_preset as LengthPreset,
      wordCount: book.word_count ?? 0,
      chapterCount: chapterCounts.get(book.id) ?? 0,
      jobId: job?.id ?? null,
      jobProgress: job?.progress ?? 0,
      jobStep: job?.step_label ?? null,
      coverUrl: coverUrls.get(book.id) ?? null,
    });
    partsBySeries.set(book.series_id, parts);
  }
  const costs: Record<LengthPreset, number> = {
    short: creditCosts.book_short?.credits ?? 10,
    standard: creditCosts.book_standard?.credits ?? 20,
    full: creditCosts.book_full?.credits ?? 35,
  };
  const credits = account.isAgencyClient ? account.balances.agency : account.balances.main;

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

  return (
    <LibraryLive
      userId={user.id}
      seriesIds={ids}
      pending={activeJobs.size > 0 || (books ?? []).some((book) => book.status === 'generating')}
      enabled={!trash}
    >
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
          <div className="flex min-w-0 flex-col gap-4">
            {list.map((item) => {
              const stats = bySeries.get(item.id) ?? { written: 0, total: 0, words: 0 };
              return (
                <article
                  key={item.id}
                  aria-label={`Series: ${item.title}`}
                  className="min-w-0 rounded-xl border border-border bg-card/40 p-3"
                >
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/series/${item.id}`}
                        className="text-base font-bold hover:underline"
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
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/series/${item.id}`}>Open</Link>
                      </Button>
                      <SeriesCardActions seriesId={item.id} status={item.status} inTrash={trash} />
                    </div>
                  </header>
                  <Roadmap
                    seriesId={item.id}
                    parts={partsBySeries.get(item.id) ?? []}
                    credits={credits}
                    costs={costs}
                    allowedPresets={account.entitlements.lengthPresets as LengthPreset[]}
                    plannedBooks={item.planned_books}
                    maxBooks={account.entitlements.maxBooksPerSeries}
                    genre={item.genre}
                    readOnly={trash}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </LibraryLive>
  );
}
