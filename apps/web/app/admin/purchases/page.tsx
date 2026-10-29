import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Purchases · Admin' };
export const dynamic = 'force-dynamic';

const sources = ['manual', 'csv', 'launchpad', 'warriorplus', 'jvzoo'] as const;
const statuses = ['completed', 'refunded', 'chargeback', 'cancelled'] as const;
const size = 50;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const source = sources.find((s) => s === params.source) ?? '';
  const status = statuses.find((s) => s === params.status) ?? '';
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1));
  let query = getAdminDb()
    .from('purchases')
    .select(
      'id, user_id, platform, txn_id, product_id, amount, status, created_at, profiles(email)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (source) query = query.eq('platform', source);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load purchases: ${error.message}`);
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  const pageLink = (n: number) => {
    const q = new URLSearchParams();
    if (source) q.set('source', source);
    if (status) q.set('status', status);
    q.set('page', String(n));
    return `/admin/purchases?${q}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold">Purchases</h1>
        <p className="text-sm text-muted-foreground">
          Purchase records, refunds and chargebacks, newest first.
        </p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Source
          <Select name="source" defaultValue={source}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
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
        <Button type="submit">Filter</Button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <caption className="sr-only">Purchase records</caption>
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              {['Date', 'User', 'Source', 'Product', 'Transaction', 'Amount', 'Status'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="text-violet-300 hover:underline"
                    href={`/admin/users/${row.user_id}`}
                  >
                    {row.profiles?.email ?? row.user_id}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.platform}</td>
                <td className="px-4 py-3 break-all">{row.product_id ?? '—'}</td>
                <td className="px-4 py-3 break-all">{row.txn_id ?? '—'}</td>
                <td className="px-4 py-3">
                  {row.amount === null ? '—' : Number(row.amount).toFixed(2)}
                </td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No purchases match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageLink(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageLink(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
