import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  KeyRound,
  Layers,
  UserCheck,
  UserX,
  Users,
  Zap,
} from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOverviewStats, getQueueCounts, type CostRow } from '@/lib/admin/stats';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

const usd = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  });

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  href?: string;
}) {
  const body = (
    <Card className={href ? 'transition-colors hover:bg-muted/40' : undefined}>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/20">
          <Icon className="size-5 text-violet-200" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-extrabold">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl focus-visible:outline-offset-4">
      {body}
    </Link>
  ) : (
    body
  );
}

function CostTable({ title, rows, empty }: { title: string; rows: CostRow[]; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="py-1 text-left font-semibold">
                  Name
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Calls
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-border/60">
                  <td className="max-w-48 truncate py-1.5 pr-2">{row.label}</td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {formatNumber(row.calls)}
                  </td>
                  <td className="py-1.5 text-right font-medium">{usd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  const [stats, queues] = await Promise.all([getOverviewStats(), getQueueCounts()]);
  const queueDepth = queues ? queues.reduce((sum, q) => sum + q.waiting + q.active, 0) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Accounts, generation and AI spend.</p>
      </div>

      <section aria-label="Accounts" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total users"
          value={formatNumber(stats.users.total)}
          icon={Users}
          href="/admin/users"
        />
        <StatCard
          label="Active"
          value={formatNumber(stats.users.active)}
          hint={`${formatNumber(stats.activeToday)} generated something today`}
          icon={UserCheck}
          href="/admin/users?status=active"
        />
        <StatCard
          label="Suspended"
          value={formatNumber(stats.users.suspended)}
          icon={UserX}
          href="/admin/users?status=suspended"
        />
        <StatCard
          label="Pending credentials"
          value={formatNumber(stats.users.pendingCredentials)}
          icon={KeyRound}
          href="/admin/users?pending=1"
        />
      </section>

      <section aria-label="Generation" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Books written"
          value={formatNumber(stats.books.today)}
          hint={`${formatNumber(stats.books.week)} in 7 days · ${formatNumber(stats.books.month)} in 30 days`}
          icon={BookOpen}
        />
        <StatCard
          label="Queue depth"
          value={queueDepth === null ? 'n/a' : formatNumber(queueDepth)}
          hint={queueDepth === null ? 'Redis did not answer' : 'waiting + active (scheduled cron jobs not counted)'}
          icon={Layers}
          href="/admin/jobs"
        />
        <StatCard
          label="Failed jobs"
          value={formatNumber(stats.failedJobs.today)}
          hint={`${formatNumber(stats.failedJobs.week)} in 7 days`}
          icon={AlertTriangle}
          href="/admin/jobs?status=failed"
        />
        <StatCard
          label="AI cost (30 days)"
          value={usd(stats.ai.totalMonth)}
          hint={`${usd(stats.ai.totalWeek)} in the last 7 days`}
          icon={Zap}
        />
      </section>

      {stats.ai.truncated ? (
        <p role="status" className="text-sm text-amber-300">
          The usage log is large: AI cost figures cover the most recent 20,000 calls only.
        </p>
      ) : null}

      <section aria-label="AI cost breakdown" className="grid gap-4 lg:grid-cols-3">
        <CostTable title="By provider" rows={stats.ai.byProvider} empty="No AI calls logged yet." />
        <CostTable title="By action" rows={stats.ai.byPurpose} empty="No AI calls logged yet." />
        <CostTable
          title="Top users"
          rows={stats.ai.topUsers}
          empty="No AI calls logged yet."
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Getting started <Badge variant="muted">tip</Badge>
          </CardTitle>
          <CardDescription>
            Create buyer accounts under Users, assign the FE and any OTOs they bought, then copy
            their login details to send them.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
