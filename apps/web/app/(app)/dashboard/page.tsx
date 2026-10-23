import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Coins,
  Headphones,
  Layers,
  Library,
  Lock,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const PART_ICON = {
  generated: CheckCircle2,
  generating: Sparkles,
  ready: BookOpen,
  failed: BookOpen,
  locked: Lock,
} as const;

export default async function DashboardPage() {
  const { user, account } = await getAccount();
  const db = getAdminDb();

  const { data: series } = await db
    .from('series')
    .select('id, title, genre, pen_name, planned_books, status, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(4);

  const seriesIds = (series ?? []).map((s) => s.id);
  const { data: books } = seriesIds.length
    ? await db
        .from('books')
        .select('id, series_id, part_number, status, word_count, continuity_report')
        .in('series_id', seriesIds)
    : { data: [] as never[] };

  const allBooks = books ?? [];
  const written = allBooks.filter((b) => b.status === 'generated');
  const words = written.reduce((sum, b) => sum + (b.word_count ?? 0), 0);
  const inProgress = allBooks.filter((b) => b.status === 'generating').length;
  const continuityReady = written.filter((b) => b.continuity_report !== null).length;

  const booksBySeries = new Map<string, typeof allBooks>();
  for (const book of allBooks) {
    const list = booksBySeries.get(book.series_id) ?? [];
    list.push(book);
    booksBySeries.set(book.series_id, list);
  }

  const firstName = (user.name || user.email).split(/[\s@]/)[0];
  const b = account.balances;

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-8">
        <div
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/25 blur-3xl"
          aria-hidden="true"
        />
        <p className="text-xs font-semibold tracking-widest text-violet-300 uppercase">
          Welcome back, {firstName}
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl leading-tight font-extrabold md:text-4xl">
          Turn your ideas into <span className="text-brand-gradient">bestselling book series</span>
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          {written.length > 0
            ? `${written.length} book${written.length === 1 ? '' : 's'} written · ${formatNumber(words)} words across ${series?.length ?? 0} series.`
            : 'Create, design and publish multi-part book series with connected continuity.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/create-series">
              <Plus aria-hidden="true" /> Create New Series
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/my-series">My series</Link>
          </Button>
        </div>
      </section>

      <section aria-label="Stats" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Library}
          label="Series"
          value={String(series?.length ?? 0)}
          hint={inProgress > 0 ? `${inProgress} generating now` : 'none generating'}
          tone="bg-gradient-to-br from-blue to-indigo-500"
        />
        <Stat
          icon={BookOpen}
          label="Books written"
          value={String(written.length)}
          hint={`${formatNumber(words)} words`}
          tone="bg-gradient-to-br from-violet-500 to-fuchsia-500"
        />
        <Stat
          icon={CheckCircle2}
          label="Continuity checked"
          value={String(continuityReady)}
          hint="books with a continuity pass"
          tone="bg-gradient-to-br from-teal to-emerald"
        />
        {account.isAgencyClient ? (
          <Stat
            icon={Coins}
            label="Agency credits"
            value={formatNumber(b.agency)}
            hint={
              account.clientAllotment
                ? `${formatNumber(account.clientAllotment.used)} of ${formatNumber(account.clientAllotment.allotment)} used`
                : undefined
            }
            tone="bg-gradient-to-br from-amber to-orange-500"
          />
        ) : (
          <Stat
            icon={Coins}
            label="Credits left"
            value={formatNumber(b.main)}
            hint="one-time credits, no reset"
            tone="bg-gradient-to-br from-amber to-orange-500"
          />
        )}
        {account.entitlements.audiobook || b.audio > 0 ? (
          <Stat
            icon={Headphones}
            label="Audiobook credits"
            value={formatNumber(b.audio)}
            tone="bg-gradient-to-br from-sky-500 to-blue-600"
          />
        ) : null}
        {!account.isAgencyClient && (account.entitlements.maxClients > 0 || b.agency > 0) ? (
          <Stat
            icon={Users}
            label="Agency pool"
            value={formatNumber(b.agency)}
            tone="bg-gradient-to-br from-teal to-emerald"
          />
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent series</CardTitle>
              <CardDescription>Pick up where you left off.</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/my-series">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(series ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No series yet — your first one starts with an idea.
              </div>
            ) : (
              (series ?? []).map((item) => {
                const parts = (booksBySeries.get(item.id) ?? []).sort(
                  (a, z) => a.part_number - z.part_number,
                );
                const done = parts.filter((p) => p.status === 'generated').length;
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3"
                  >
                    <div className="min-w-0">
                      <Link href={`/series/${item.id}`} className="font-semibold hover:underline">
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.genre} · {item.pen_name} · {done}/{item.planned_books} parts
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1" aria-label="Parts">
                        {parts.slice(0, 12).map((part) => {
                          const Icon = PART_ICON[part.status as keyof typeof PART_ICON] ?? BookOpen;
                          return (
                            <span
                              key={part.id}
                              title={`Part ${part.part_number}: ${part.status}`}
                              className={`flex size-6 items-center justify-center rounded-md border ${
                                part.status === 'generated'
                                  ? 'border-success/40 bg-success/15 text-green-300'
                                  : part.status === 'locked'
                                    ? 'border-border text-muted-foreground'
                                    : 'border-primary/40 bg-primary/15 text-violet-200'
                              }`}
                            >
                              <Icon className="size-3" aria-hidden="true" />
                              <span className="sr-only">
                                Part {part.part_number}: {part.status}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/series/${item.id}`}>
                        {done > 0 ? 'Continue writing' : 'Open'}
                      </Link>
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/create-series">
                  <Plus aria-hidden="true" /> Create a series
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/templates">
                  <Layers aria-hidden="true" /> Browse templates
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-start">
                <Link href="/profile">Profile &amp; pen names</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your plan</CardTitle>
              <CardDescription>What is unlocked on your account.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {account.isAgencyClient ? (
                <Badge variant="muted">Agency client</Badge>
              ) : account.plans.length === 0 ? (
                <Badge variant="warning">No active plan</Badge>
              ) : (
                <Badge variant="default">{account.plans.length} active plan(s)</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className={`flex size-12 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="size-5 text-white" aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl leading-none font-extrabold">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          {hint ? <p className="text-xs text-muted-foreground/70">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
