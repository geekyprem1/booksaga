import Link from 'next/link';
import { ChevronLeft, ChevronRight, KeyRound, Search } from 'lucide-react';
import { isPlanCode, PLANS } from '@booksaga/shared';
import { CreateUserDialog } from '@/components/admin/create-user-dialog';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAdminDb } from '@/lib/supabase/admin';
import { cn, formatNumber } from '@/lib/utils';

export const metadata = { title: 'Users · Admin' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  status?: string;
  pending?: string;
  page?: string;
}

/** Remove characters that would break out of a PostgREST `or()` filter. */
function sanitizeSearch(q: string): string {
  return q
    .replace(/[,()*%\\"']/g, ' ')
    .trim()
    .slice(0, 80);
}

function buildHref(params: SearchParams, patch: Partial<SearchParams>): string {
  const merged = { ...params, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/users?${s}` : '/admin/users';
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = sanitizeSearch(params.q ?? '');
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const status =
    params.status === 'active' || params.status === 'suspended' ? params.status : undefined;
  const pendingOnly = params.pending === '1';

  let query = getAdminDb()
    .from('profiles')
    .select(
      'id, name, email, role, status, credentials_pending, created_at, user_plans!user_plans_user_id_fkey(plan_code, status), credit_balances(pool, balance)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  if (status) query = query.eq('status', status);
  if (pendingOnly) query = query.eq('credentials_pending', true);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load users: ${error.message}`);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Users</h1>
          <p className="text-sm text-muted-foreground">{formatNumber(total)} accounts</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/admin/users" className="relative min-w-64 flex-1 sm:max-w-sm">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={q}
            aria-label="Search users"
            placeholder="Search by name or email…"
            className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm placeholder:text-muted-foreground/70"
          />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {pendingOnly ? <input type="hidden" name="pending" value="1" /> : null}
        </form>
        <nav aria-label="Filters" className="flex flex-wrap gap-1.5">
          {[
            {
              label: 'All',
              patch: { status: undefined, pending: undefined },
              on: !status && !pendingOnly,
            },
            {
              label: 'Active',
              patch: { status: 'active', pending: undefined },
              on: status === 'active',
            },
            {
              label: 'Suspended',
              patch: { status: 'suspended', pending: undefined },
              on: status === 'suspended',
            },
            {
              label: 'Pending credentials',
              patch: { status: undefined, pending: '1' },
              on: pendingOnly,
            },
          ].map((f) => (
            <Link
              key={f.label}
              href={buildHref(params, { ...f.patch, page: undefined })}
              aria-current={f.on ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                f.on
                  ? 'border-primary bg-primary/20 text-violet-100'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-176 text-left text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="border-b border-border text-xs text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                User
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Plans
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Credits
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => {
              const plans = (u.user_plans ?? [])
                .filter((p) => p.status === 'active' && isPlanCode(p.plan_code))
                .map((p) => p.plan_code);
              const main = (u.credit_balances ?? []).find((b) => b.pool === 'main')?.balance ?? 0;
              return (
                <tr
                  key={u.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">
                      {u.name || u.email}
                    </Link>
                    <div className="text-xs text-muted-foreground">{u.name ? u.email : null}</div>
                    {u.role === 'admin' ? <Badge className="mt-1">Admin</Badge> : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {plans.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        plans.map((code) => (
                          <Badge
                            key={code}
                            variant={
                              PLANS[code as keyof typeof PLANS].isDownsell ? 'muted' : 'default'
                            }
                          >
                            {code.toUpperCase().replace('_', ' ')}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(main)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={u.status === 'active' ? 'success' : 'danger'}>
                        {u.status}
                      </Badge>
                      {u.credentials_pending ? (
                        <Badge variant="warning">
                          <KeyRound className="size-3" aria-hidden="true" /> pending
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No users match.
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
              <Link href={buildHref(params, { page: String(page - 1) })} aria-disabled={page <= 1}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="sm"
              className={page >= pages ? 'pointer-events-none opacity-50' : ''}
            >
              <Link
                href={buildHref(params, { page: String(page + 1) })}
                aria-disabled={page >= pages}
              >
                Next <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
