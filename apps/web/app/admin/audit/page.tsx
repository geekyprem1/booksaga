import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAdminDb } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Audit log · Admin' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const GROUPS = [
  { label: 'All', prefix: '' },
  { label: 'Users', prefix: 'user.' },
  { label: 'Plans', prefix: 'plan.' },
  { label: 'Credits', prefix: 'credits.' },
];

interface SearchParams {
  action?: string;
  page?: string;
}

function href(action: string, page: number) {
  const qs = new URLSearchParams();
  if (action) qs.set('action', action);
  if (page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `/admin/audit?${s}` : '/admin/audit';
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const prefix = GROUPS.find((g) => g.prefix === sp.action)?.prefix ?? '';

  let query = getAdminDb()
    .from('audit_log')
    .select('id, action, target, meta, created_at, profiles(email, name)', { count: 'exact' })
    .order('id', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (prefix) query = query.like('action', `${prefix}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load audit log: ${error.message}`);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every admin action, newest first.</p>
      </div>

      <nav aria-label="Filter" className="flex gap-1.5">
        {GROUPS.map((g) => (
          <Link
            key={g.label}
            href={href(g.prefix, 1)}
            aria-current={prefix === g.prefix ? 'true' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold',
              prefix === g.prefix
                ? 'border-primary bg-primary/20 text-violet-100'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {g.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-176 text-left text-sm">
          <caption className="sr-only">Audit log</caption>
          <thead className="border-b border-border text-xs text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                When
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Actor
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Action
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Target
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(e.created_at).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-4 py-3">
                  {e.profiles?.email ?? <span className="text-muted-foreground">system</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge>{e.action}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {e.target?.startsWith('user:') ? (
                    <Link className="hover:underline" href={`/admin/users/${e.target.slice(5)}`}>
                      {e.target}
                    </Link>
                  ) : (
                    (e.target ?? '—')
                  )}
                </td>
                <td className="max-w-xs px-4 py-3 font-mono text-xs break-words text-muted-foreground">
                  {JSON.stringify(e.meta)}
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Nothing logged yet.
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
              <Link href={href(prefix, page - 1)}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className={page >= pages ? 'pointer-events-none opacity-50' : ''}
            >
              <Link href={href(prefix, page + 1)}>
                Next <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
