import { AgencyClients, type AgencyClientRow } from '@/components/agency/agency-clients';
import { Gate } from '@/components/billing/gate';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Agency' };
export const dynamic = 'force-dynamic';

export default async function AgencyPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Agency</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Give clients their own login. They generate from your agency pool, and every client has a
          credit allotment you control.
        </p>
      </header>

      <Gate
        check={{ kind: 'agency', clientCount: 0 }}
        feature="Agency client accounts"
        planCode="oto4"
        description="Create client logins, hand over credentials, and cap what each one can spend."
      >
        <AgencyContent />
      </Gate>
    </div>
  );
}

async function AgencyContent() {
  const { user, account } = await getAccount();
  const db = getAdminDb();

  const { data: links } = await db
    .from('agency_clients')
    .select('client_id, status, allotment, used, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  const clientIds = (links ?? []).map((link) => link.client_id);

  const [{ data: profiles }, { data: seriesRows }] = await Promise.all([
    clientIds.length
      ? db.from('profiles').select('id, name, email').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
    clientIds.length
      ? db.from('series').select('user_id').in('user_id', clientIds).is('deleted_at', null)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const seriesCount = new Map<string, number>();
  for (const row of seriesRows ?? []) {
    seriesCount.set(row.user_id, (seriesCount.get(row.user_id) ?? 0) + 1);
  }

  const clients: AgencyClientRow[] = (links ?? []).map((link) => ({
    clientId: link.client_id,
    name: profileById.get(link.client_id)?.name ?? '',
    email: profileById.get(link.client_id)?.email ?? '',
    status: link.status as 'active' | 'suspended',
    allotment: link.allotment,
    used: link.used,
    seriesCount: seriesCount.get(link.client_id) ?? 0,
    createdAt: link.created_at,
  }));

  return (
    <AgencyClients
      clients={clients}
      poolBalance={account.balances.agency}
      maxClients={account.entitlements.maxClients}
      planName={account.plans.includes('oto4') ? 'Agency plan' : 'Agency lite'}
    />
  );
}
