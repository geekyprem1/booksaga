import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isPlanCode, PLANS, type PlanCode } from '@booksaga/shared';
import {
  AdjustCreditsForm,
  EditNameForm,
  GrantPlanForm,
  MarkSentButton,
  ResetPasswordButton,
  RevokePlanButton,
  StatusToggle,
} from '@/components/admin/user-controls';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';
import { z } from 'zod';
import { startViewAsAction } from '../view-as-actions';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'User · Admin' };
export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const admin = await requireAdmin();
  const db = getAdminDb();

  const [profileRes, plansRes, balancesRes, ledgerRes, purchasesRes] = await Promise.all([
    db.from('profiles').select('*').eq('id', id).maybeSingle(),
    db
      .from('user_plans')
      .select('id, plan_code, status, source, granted_at, revoked_at')
      .eq('user_id', id)
      .order('granted_at', { ascending: false }),
    db.from('credit_balances').select('pool, balance').eq('user_id', id),
    db
      .from('credit_ledger')
      .select('id, pool, amount, status, reason, created_at')
      .eq('user_id', id)
      .order('id', { ascending: false })
      .limit(15),
    db
      .from('purchases')
      .select('id, platform, product_id, amount, status, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const profile = profileRes.data;
  if (!profile) notFound();

  const plans = plansRes.data ?? [];
  const activePlans = plans
    .filter((p) => p.status === 'active' && isPlanCode(p.plan_code))
    .map((p) => p.plan_code as PlanCode);
  const balance = (pool: string) =>
    (balancesRes.data ?? []).find((b) => b.pool === pool)?.balance ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/users"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All users
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{profile.name || profile.email}</h1>
          <Badge variant={profile.status === 'active' ? 'success' : 'danger'}>
            {profile.status}
          </Badge>
          {profile.role === 'admin' ? <Badge>Admin</Badge> : null}
          {profile.credentials_pending ? (
            <Badge variant="warning">credentials pending</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.email} · joined {fmt(profile.created_at)} · last active{' '}
          {fmt(profile.last_active_at)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.role !== 'admin' && profile.status === 'active' ? (
          <form action={startViewAsAction}>
            <input type="hidden" name="userId" value={id} />
            <Button type="submit" variant="secondary" className="min-h-11">
              View as user (read-only)
            </Button>
          </form>
        ) : null}
        <StatusToggle
          userId={id}
          status={profile.status === 'suspended' ? 'suspended' : 'active'}
          isSelf={id === admin.id}
        />
        <ResetPasswordButton userId={id} />
        {profile.credentials_pending ? <MarkSentButton userId={id} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <EditNameForm userId={id} name={profile.name} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Granting a plan adds its one-time credits. Revoking takes back what it granted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ul className="flex flex-col divide-y divide-border">
            {plans.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">No plans yet.</li>
            ) : null}
            {plans.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-semibold">
                  {isPlanCode(p.plan_code) ? PLANS[p.plan_code].name : p.plan_code}
                </span>
                <Badge variant={p.status === 'active' ? 'success' : 'muted'}>{p.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {p.source} · {fmt(p.granted_at)}
                  {p.revoked_at ? ` · revoked ${fmt(p.revoked_at)}` : ''}
                </span>
                {p.status === 'active' && isPlanCode(p.plan_code) ? (
                  <span className="ml-auto">
                    <RevokePlanButton userId={id} plan={p.plan_code} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <GrantPlanForm userId={id} held={activePlans} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credits</CardTitle>
          <CardDescription>
            One-time credits. Use adjustments for bonuses or support fixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid gap-3 sm:grid-cols-3">
            {(['main', 'audio', 'agency'] as const).map((pool) => (
              <div key={pool} className="rounded-xl border border-border bg-background/40 p-4">
                <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                  {pool} pool
                </dt>
                <dd className="mt-1 text-2xl font-extrabold tabular-nums">
                  {formatNumber(balance(pool))}
                </dd>
              </div>
            ))}
          </dl>
          <AdjustCreditsForm userId={id} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-136 text-left text-sm">
              <caption className="mb-2 text-left text-xs font-semibold text-muted-foreground uppercase">
                Recent ledger
              </caption>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Pool
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Type
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {(ledgerRes.data ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 text-xs text-muted-foreground">{fmt(l.created_at)}</td>
                    <td className="py-2 pr-4">{l.pool}</td>
                    <td
                      className={`py-2 pr-4 text-right tabular-nums ${l.amount < 0 ? 'text-rose-300' : 'text-green-300'}`}
                    >
                      {l.amount > 0 ? '+' : ''}
                      {formatNumber(l.amount)}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="muted">{l.status}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{l.reason ?? '—'}</td>
                  </tr>
                ))}
                {(ledgerRes.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-muted-foreground">
                      No credit activity yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {(purchasesRes.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-medium">{p.product_id ?? '—'}</span>
                <Badge variant="muted">{p.platform}</Badge>
                <Badge variant={p.status === 'completed' ? 'success' : 'danger'}>{p.status}</Badge>
                <span className="text-xs text-muted-foreground">
                  {p.amount != null ? `$${p.amount}` : ''} · {fmt(p.created_at)}
                </span>
              </li>
            ))}
            {(purchasesRes.data ?? []).length === 0 ? (
              <li className="py-3 text-muted-foreground">No purchases.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
