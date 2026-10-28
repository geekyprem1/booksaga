import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Coins,
  Headphones,
  Hourglass,
  Library,
  Link2,
  Plus,
  Users,
} from 'lucide-react';
import { DashboardHero } from '@/components/dashboard/hero';
import { QuickActions } from '@/components/dashboard/quick-actions';
import {
  RecommendedTemplates,
  type RecommendedTemplate,
} from '@/components/dashboard/recommended-templates';
import { SeriesCard, type DashboardSeries } from '@/components/dashboard/series-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/button';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const RECENT_SERIES = 4;
const RECOMMENDED = 6;
const SIGNED_URL_SECONDS = 3600;

export default async function DashboardPage() {
  const { user, account } = await getAccount();
  const db = getAdminDb();

  const templatesTier = account.entitlements.templatesTier;
  const templatesLocked = templatesTier === 'none';

  // Totals cover every series the user owns, not just the recent ones shown as cards.
  const [recent, allBooks, templateRows] = await Promise.all([
    db
      .from('series')
      .select('id, title, genre, planned_books', { count: 'exact' })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(RECENT_SERIES),
    db
      .from('books')
      .select('id, series_id, part_number, status, word_count, continuity_report, series!inner(user_id, deleted_at)')
      .eq('series.user_id', user.id)
      .is('series.deleted_at', null),
    (() => {
      const query = db
        .from('templates')
        .select('id, slug, category, title, premise, genre, length_preset, planned_books, cover_path')
        .eq('is_published', true)
        .order('sort_order')
        .limit(60);
      return templatesTier === 'lite' ? query.eq('tier', 'lite') : query;
    })(),
  ]);

  const totalSeries = recent.count ?? 0;
  const books = allBooks.data ?? [];
  const written = books.filter((b) => b.status === 'generated');
  const words = written.reduce((sum, b) => sum + (b.word_count ?? 0), 0);
  const inProgress = books.filter((b) => b.status === 'generating').length;
  const continuityReady = written.filter((b) => b.continuity_report !== null).length;

  // --- recent series cards -------------------------------------------------------------------
  const recentRows = recent.data ?? [];
  const booksBySeries = new Map<string, typeof books>();
  for (const book of books) {
    const list = booksBySeries.get(book.series_id) ?? [];
    list.push(book);
    booksBySeries.set(book.series_id, list);
  }

  const recentBookIds = recentRows.flatMap((s) => (booksBySeries.get(s.id) ?? []).map((b) => b.id));
  const { data: coverRows } = recentBookIds.length
    ? await db
        .from('covers')
        .select('book_id, final_path')
        .in('book_id', recentBookIds)
        .eq('type', 'ebook')
        .eq('is_active', true)
    : { data: [] as { book_id: string; final_path: string | null }[] };

  const coverPathByBook = new Map(
    (coverRows ?? []).filter((c) => c.final_path).map((c) => [c.book_id, c.final_path as string]),
  );

  const seriesCards: DashboardSeries[] = await Promise.all(
    recentRows.map(async (item) => {
      const parts = (booksBySeries.get(item.id) ?? []).sort((a, z) => a.part_number - z.part_number);
      // The card shows the cover of the earliest part that has one.
      const coverPath = parts.map((p) => coverPathByBook.get(p.id)).find(Boolean);
      const signed = coverPath
        ? await db.storage.from('covers').createSignedUrl(coverPath, SIGNED_URL_SECONDS)
        : null;
      return {
        id: item.id,
        title: item.title,
        genre: item.genre,
        planned: item.planned_books,
        done: parts.filter((p) => p.status === 'generated').length,
        coverUrl: signed?.data?.signedUrl ?? null,
        parts: parts.map((p) => ({ number: p.part_number, status: p.status })),
      };
    }),
  );

  // --- recommended templates: one per category so the row is varied -----------------------------
  const seenCategories = new Set<string>();
  const picked = (templateRows.data ?? [])
    .filter((row) => {
      if (seenCategories.has(row.category)) return false;
      seenCategories.add(row.category);
      return true;
    })
    .slice(0, RECOMMENDED);

  const templates: RecommendedTemplate[] = await Promise.all(
    picked.map(async (row) => {
      const signed = row.cover_path
        ? await db.storage.from('covers').createSignedUrl(row.cover_path, SIGNED_URL_SECONDS)
        : null;
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        genre: row.genre,
        premise: row.premise,
        plannedBooks: row.planned_books,
        lengthPreset: row.length_preset,
        coverUrl: signed?.data?.signedUrl ?? null,
      };
    }),
  );

  const firstName = (user.name || user.email).split(/[\s@]/)[0] ?? 'there';
  const b = account.balances;

  const summary =
    written.length > 0
      ? `${written.length} book${written.length === 1 ? '' : 's'} written · ${formatNumber(words)} words across ${totalSeries} series. Keep the story going.`
      : 'Create, design and publish stunning multi-part book series with the power of AI.';

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero firstName={firstName} summary={summary} />

      <section
        aria-label="Stats"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          icon={Library}
          label="Total Series"
          value={formatNumber(totalSeries)}
          hint="View all series"
          tone="violet"
          href="/my-series"
        />
        <StatCard
          icon={BookOpen}
          label="Total Books"
          value={formatNumber(books.length)}
          hint="Across all series"
          tone="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed Books"
          value={formatNumber(written.length)}
          hint={`${formatNumber(words)} words written`}
          tone="green"
        />
        <StatCard
          icon={Hourglass}
          label="In Progress"
          value={formatNumber(inProgress)}
          hint="Currently generating"
          tone="amber"
        />
        <StatCard
          icon={Link2}
          label="Continuity Ready"
          value={formatNumber(continuityReady)}
          hint="Continuity checked"
          tone="pink"
        />
        {account.isAgencyClient ? (
          <StatCard
            icon={Coins}
            label="Agency Credits"
            value={formatNumber(b.agency)}
            hint={
              account.clientAllotment
                ? `${formatNumber(account.clientAllotment.used)} of ${formatNumber(account.clientAllotment.allotment)} used`
                : undefined
            }
            tone="teal"
          />
        ) : (
          <StatCard
            icon={Coins}
            label="Credits Left"
            value={formatNumber(b.main)}
            hint="One-time credits"
            tone="teal"
          />
        )}
        {account.entitlements.audiobook || b.audio > 0 ? (
          <StatCard
            icon={Headphones}
            label="Audiobook Credits"
            value={formatNumber(b.audio)}
            tone="sky"
          />
        ) : null}
        {!account.isAgencyClient && (account.entitlements.maxClients > 0 || b.agency > 0) ? (
          <StatCard icon={Users} label="Agency Pool" value={formatNumber(b.agency)} tone="green" />
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="recent-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-title" className="flex items-center gap-2 text-lg font-semibold">
              <Library className="size-4.5 text-violet-300" aria-hidden="true" /> Your Recent Series
            </h2>
            {totalSeries > 0 ? (
              <Link
                href="/my-series"
                className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200"
              >
                View all series <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          {seriesCards.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
              <BookOpen className="size-8 text-violet-300" aria-hidden="true" />
              <p className="font-semibold">No series yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your first series starts with a single idea. Part 1 is written in minutes.
              </p>
              <Button asChild>
                <Link href="/create-series">
                  <Plus aria-hidden="true" /> Create your first series
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {seriesCards.map((series) => (
                <SeriesCard key={series.id} series={series} />
              ))}
            </div>
          )}
        </section>

        <QuickActions templatesLocked={templatesLocked} />
      </div>

      <RecommendedTemplates templates={templates} locked={templatesLocked} />
    </div>
  );
}
