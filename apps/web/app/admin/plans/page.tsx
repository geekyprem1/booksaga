import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { planLimitsSchema } from '@booksaga/shared';
import { PlanControls } from '@/components/admin/plan-controls';

export const metadata = { title: 'Plans & costs · Admin' };
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  await requireAdmin();
  const db = getAdminDb();
  const [plans, costs, settings] = await Promise.all([
    db.from('plans').select('code, name, limits').order('code'),
    db.from('credit_costs').select('action, credits, pool').order('action'),
    db.from('app_settings').select('value').eq('key', 'limits').single(),
  ]);
  if (plans.error || costs.error || settings.error)
    throw new Error('Could not load plan settings.');
  const entries = (plans.data ?? []).map((p) => ({
    ...p,
    limits: planLimitsSchema.parse(p.limits),
  }));
  const cap = (settings.data.value as { daily_book_cap?: number } | null)?.daily_book_cap ?? 10;
  return <PlanControls plans={entries} costs={costs.data ?? []} dailyCap={cap} />;
}
