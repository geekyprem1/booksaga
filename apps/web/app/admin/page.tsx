import Link from 'next/link';
import { KeyRound, UserCheck, UserX, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

export const metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const db = getAdminDb();
  const head = { count: 'exact' as const, head: true };

  const [total, active, suspended, pending] = await Promise.all([
    db.from('profiles').select('id', head),
    db.from('profiles').select('id', head).eq('status', 'active'),
    db.from('profiles').select('id', head).eq('status', 'suspended'),
    db.from('profiles').select('id', head).eq('credentials_pending', true),
  ]);

  const stats = [
    { label: 'Total users', value: total.count ?? 0, icon: Users, href: '/admin/users' },
    {
      label: 'Active',
      value: active.count ?? 0,
      icon: UserCheck,
      href: '/admin/users?status=active',
    },
    {
      label: 'Suspended',
      value: suspended.count ?? 0,
      icon: UserX,
      href: '/admin/users?status=suspended',
    },
    {
      label: 'Pending credentials',
      value: pending.count ?? 0,
      icon: KeyRound,
      href: '/admin/users?pending=1',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Admin overview</h1>
        <p className="text-sm text-muted-foreground">Accounts, plans and credits.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href} className="rounded-xl focus-visible:outline-offset-4">
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/20">
                  <Icon className="size-5 text-violet-200" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-2xl leading-none font-extrabold">{formatNumber(value)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Create buyer accounts under Users, assign the FE and any OTOs they bought, then copy
            their login details to send them.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
