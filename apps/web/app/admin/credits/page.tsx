import Link from 'next/link';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';

export const metadata = { title: 'Credit ledger · Admin' };
export const dynamic = 'force-dynamic';
const statuses = ['grant', 'reserved', 'committed', 'refunded', 'adjust', 'revoked'] as const;
const pools = ['main', 'audio', 'agency'] as const;
const size = 50;

export default async function CreditLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; status?: string; pool?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const user = params.user?.trim() ?? '';
  const validUser = !user || z.uuid().safeParse(user).success;
  const status = statuses.find((s) => s === params.status) ?? '';
  const pool = pools.find((p) => p === params.pool) ?? '';
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = getAdminDb()
    .from('credit_ledger')
    .select('id, user_id, acting_user_id, pool, amount, status, reason, job_id, created_at', {
      count: 'exact',
    })
    .order('id', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (user && validUser) query = query.eq('user_id', user);
  if (status) query = query.eq('status', status);
  if (pool) query = query.eq('pool', pool);
  const result = validUser ? await query : { data: [], count: 0, error: null };
  if (result.error) throw new Error(`Could not load credit ledger: ${result.error.message}`);
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / size));
  const pageLink = (n: number) => {
    const q = new URLSearchParams();
    if (user) q.set('user', user);
    if (status) q.set('status', status);
    if (pool) q.set('pool', pool);
    q.set('page', String(n));
    return `/admin/credits?${q}`;
  };
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold">Credit ledger</h1>
        <p className="text-sm text-muted-foreground">
          Grants, usage, refunds and adjustments, newest first.
        </p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          Account ID
          <Input name="user" defaultValue={user} placeholder="Paste a user ID" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Pool
          <Select name="pool" defaultValue={pool}>
            <option value="">All pools</option>
            {pools.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit">Filter</Button>
      </form>
      {!validUser && (
        <p role="alert" className="text-sm text-destructive">
          Enter a valid user ID.
        </p>
      )}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="sr-only">Credit ledger entries</caption>
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              {['When', 'Account', 'Pool', 'Amount', 'Status', 'Reason', 'Job'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(result.data ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="text-violet-300 hover:underline"
                    href={`/admin/users/${row.user_id}`}
                  >
                    {row.user_id}
                  </Link>
                  {row.acting_user_id && row.acting_user_id !== row.user_id && (
                    <p className="text-xs text-muted-foreground">
                      Acting user: {row.acting_user_id}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">{row.pool}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.amount > 0 ? '+' : ''}
                  {row.amount}
                </td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">{row.reason ?? '—'}</td>
                <td className="px-4 py-3">
                  {row.job_id ? (
                    <Link
                      className="text-violet-300 hover:underline"
                      href={`/admin/jobs/${row.job_id}`}
                    >
                      View job
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {!result.data?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No matching entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <div className="flex items-center justify-between text-sm">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Button asChild variant="secondary">
              <Link href={pageLink(page - 1)}>Previous</Link>
            </Button>
          )}
          {page < pages && (
            <Button asChild variant="secondary">
              <Link href={pageLink(page + 1)}>Next</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
