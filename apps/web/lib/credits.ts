import 'server-only';
import {
  DEFAULT_CREDIT_COSTS,
  type CreditAction,
  type CreditCost,
} from '@booksaga/shared';
import { getAdminDb } from '@/lib/supabase/admin';

/**
 * Live credit costs from `credit_costs` (admin-editable), with the code defaults as a fallback so a
 * missing row never blocks a purchase.
 */
export async function getCreditCost(action: CreditAction): Promise<CreditCost> {
  const { data } = await getAdminDb()
    .from('credit_costs')
    .select('credits, pool')
    .eq('action', action)
    .maybeSingle();

  const pool = data?.pool === 'audio' ? 'audio' : 'main';
  return {
    credits: data?.credits ?? DEFAULT_CREDIT_COSTS[action].credits,
    pool,
  };
}

export async function getCreditCosts(
  actions: readonly CreditAction[],
): Promise<Record<string, CreditCost>> {
  const entries = await Promise.all(
    actions.map(async (action) => [action, await getCreditCost(action)] as const),
  );
  return Object.fromEntries(entries);
}
