import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { JOB_TYPES } from '@booksaga/core';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { jobStatusVariant } from '@/lib/admin/job-status';
import { getQueueCounts } from '@/lib/admin/stats';
import { getAdminDb } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Jobs · Admin' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const STATUSES = ['queued', 'active', 'completed', 'failed', 'cancelled'] as const;

interface SearchParams {
  status?: string;
  type?: string;
  page?: string;
}

function href(params: { status?: string; type?: string; page?: number }) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.type) qs.set('type', params.type);
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  const s = qs.toString();
  return s ? `/admin/jobs?${s}` : '/admin/jobs';
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const status = STATUSES.find((s) => s === sp.status) ?? '';
  const type = (JOB_TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type ?? '') : '';

  let query = getAdminDb()
    .from('jobs')
    .select(
      'id, type, status, progress, step_label, error, created_at, finished_at, user_id, profiles(email)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);

  const [{ data, count, error }, queues] = await Promise.all([query, getQueueCounts()]);
  if (error) throw new Error(`Failed to load jobs: ${error.message}`);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Jobs</h1>
        <p className="text-sm text-muted-foreground">Queues and every generation job, newest first.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queues</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {queues === null ? (
            <p role="status" className="text-sm text-amber-300">
              Redis did not answer, so live queue counts are unavailable.
            </p>
          ) : (
            <table className="w-full min-w-120 text-sm">
              <caption className="sr-only">BullMQ queue counts</caption>
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  {['Queue', 'Waiting', 'Active', 'Delayed', 'Failed', 'Completed'].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn('py-1 font-semibold', i === 0 ? 'text-left' : 'text-right')}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.name} className="border-t border-border/60">
                    <th scope="row" className="py-1.5 text-left font-medium">
                      {q.name}
                    </th>
                    <td className="py-1.5 text-right">{q.waiting}</td>
                    <td className="py-1.5 text-right">{q.active}</td>
                    <td className="py-1.5 text-right">{q.delayed}</td>
                    <td className={cn('py-1.5 text-right', q.failed > 0 && 'text-red-300')}>
                      {q.failed}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">{q.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {['', ...STATUSES].map((s) => (
            <Link
              key={s || 'all'}
              href={href({ status: s, type })}
              aria-current={status === s ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                status === s
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {s || 'All statuses'}
            </Link>
          ))}
        </nav>
        <nav aria-label="Filter by type" className="flex flex-wrap gap-1.5">
          {['', ...JOB_TYPES].map((t) => (
            <Link
              key={t || 'all'}
              href={href({ status, type: t })}
              aria-current={type === t ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                type === t
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t || 'All types'}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-208 text-left text-sm">
          <caption className="sr-only">Jobs</caption>
          <thead className="border-b border-border text-xs text-muted-foreground uppercase">
            <tr>
              {['Created', 'User', 'Type', 'Status', 'Progress', 'Detail'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((job) => (
              <tr key={job.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                  <Link className="hover:underline" href={`/admin/jobs/${job.id}`}>
                    {new Date(job.created_at).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link className="hover:underline" href={`/admin/users/${job.user_id}`}>
                    {job.profiles?.email ?? job.user_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{job.type}</td>
                <td className="px-4 py-3">
                  <Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{job.progress}%</td>
                <td className="max-w-sm px-4 py-3 text-xs break-words text-muted-foreground">
                  {job.error ?? job.step_label ?? '—'}
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No jobs match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="secondary"
              size="sm"
              className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
            >
              <Link href={href({ status, type, page: page - 1 })}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className={page >= pages ? 'pointer-events-none opacity-50' : ''}
            >
              <Link href={href({ status, type, page: page + 1 })}>
                Next <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
