import {
  ResellerDashboard,
  type FranchiseAsset,
  type ResellerCustomer,
} from '@/components/reseller/reseller-dashboard';
import { Gate } from '@/components/billing/gate';
import { getAccount } from '@/lib/account';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Reseller & Franchise' };
export const dynamic = 'force-dynamic';

export default async function ResellerPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Reseller &amp; Franchise</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Hand out BookSaga accounts under your own brand, and use the promo kit to sell them.
        </p>
      </header>

      <Gate
        check={{ kind: 'reseller', licenseCount: 0 }}
        feature="Reseller licences"
        planCode="oto5"
        description="Create customer accounts, track licences, and grab the franchise promo kit."
      >
        <ResellerContent />
      </Gate>
    </div>
  );
}

async function ResellerContent() {
  const { user, account } = await getAccount();
  const db = getAdminDb();

  // Licences are provisioned up to the plan limit the first time the dashboard is opened.
  const maxLicences = account.entitlements.maxResellLicenses;
  const { count: existing } = await db
    .from('reseller_licenses')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id);
  const missing = Math.max(0, maxLicences - (existing ?? 0));
  if (missing > 0) {
    await db.from('reseller_licenses').insert(
      Array.from({ length: missing }, () => ({ owner_id: user.id, status: 'available' as const })),
    );
  }

  const [{ data: licences }, { data: assets }] = await Promise.all([
    db
      .from('reseller_licenses')
      .select('id, status, customer_id, used_at')
      .eq('owner_id', user.id)
      .order('created_at'),
    db
      .from('franchise_assets')
      .select('id, kind, title, description, url')
      .eq('is_published', true)
      .order('sort_order'),
  ]);

  const customerIds = (licences ?? [])
    .map((licence) => licence.customer_id)
    .filter((id): id is string => Boolean(id));

  const { data: profiles } = customerIds.length
    ? await db.from('profiles').select('id, name, email, created_at').in('id', customerIds)
    : { data: [] as { id: string; name: string; email: string; created_at: string }[] };

  const customers: ResellerCustomer[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    createdAt: profile.created_at,
  }));

  const available = (licences ?? []).filter((licence) => licence.status === 'available').length;
  const used = (licences ?? []).filter((licence) => licence.status === 'used').length;

  return (
    <ResellerDashboard
      customers={customers}
      available={available}
      used={used}
      maxLicences={maxLicences}
      assets={(assets ?? []) as FranchiseAsset[]}
    />
  );
}
