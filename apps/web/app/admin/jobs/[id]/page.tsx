import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { CancelJobButton } from '@/components/admin/cancel-job-button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jobStatusVariant } from '@/lib/admin/job-status';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Job · Admin' };
export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' }) : '—';

export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  await requireAdmin();

  const db = getAdminDb();
  const { data: job } = await db
    .from('jobs')
    .select('*, profiles(email, name)')
    .eq('id', id)
    .maybeSingle();
  if (!job) notFound();

  const [{ data: usage }, { data: ledger }] = await Promise.all([
    db
      .from('ai_usage_log')
      .select('id, provider, model, purpose, input_tokens, output_tokens, images, cost_usd, created_at')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
      .limit(200),
    job.ledger_id
      ? db.from('credit_ledger').select('*').eq('id', job.ledger_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const cost = (usage ?? []).reduce((sum, row) => sum + Number(row.cost_usd || 0), 0);
  const running = job.status === 'queued' || job.status === 'active';

  const facts: [string, React.ReactNode][] = [
    ['User', <Link key="u" className="hover:underline" href={`/admin/users/${job.user_id}`}>{job.profiles?.email ?? job.user_id}</Link>],
    ['Type', <span key="t" className="font-mono">{job.type}</span>],
    ['Target', <span key="r" className="font-mono">{job.ref_id ?? '—'}</span>],
    ['Progress', `${job.progress}%${job.step_label ? ` · ${job.step_label}` : ''}`],
    ['Attempts', String(job.attempts)],
    ['Credits reserved', String(job.credits_reserved)],
    ['Created', fmt(job.created_at)],
    ['Started', fmt(job.started_at)],
    ['Last heartbeat', fmt(job.heartbeat_at)],
    ['Finished', fmt(job.finished_at)],
    ['Cancel requested', job.cancel_requested ? 'yes' : 'no'],
    ['AI cost', `$${cost.toFixed(4)}`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/jobs"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All jobs
        </Link>
        <h1 className="text-2xl font-extrabold">Job {job.id.slice(0, 8)}</h1>
        <Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge>
        {running ? (
          <span className="ml-auto">
            <CancelJobButton jobId={job.id} />
          </span>
        ) : null}
      </div>

      {job.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm break-words text-rose-200"
        >
          {job.error}
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
              <dd className="text-sm break-words">{value}</dd>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
            {JSON.stringify(job.meta, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {ledger ? (
        <Card>
          <CardHeader>
            <CardTitle>Credit ledger entry</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {JSON.stringify(ledger, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-x-auto">
        <CardHeader>
          <CardTitle>AI calls ({usage?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full min-w-160 text-left text-sm">
            <caption className="sr-only">AI calls made by this job</caption>
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                {['When', 'Action', 'Model', 'In', 'Out', 'Cost'].map((h) => (
                  <th key={h} scope="col" className="py-1 pr-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(usage ?? []).map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                    {fmt(row.created_at)}
                  </td>
                  <td className="py-1.5 pr-3">{row.purpose ?? '—'}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{row.model}</td>
                  <td className="py-1.5 pr-3">{row.input_tokens || '—'}</td>
                  <td className="py-1.5 pr-3">{row.output_tokens || (row.images ? `${row.images} img` : '—')}</td>
                  <td className="py-1.5">${Number(row.cost_usd).toFixed(4)}</td>
                </tr>
              ))}
              {(usage ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No AI calls logged for this job.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
