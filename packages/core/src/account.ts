import {
  isPlanCode,
  resolveEntitlements,
  type CreditPool,
  type Entitlements,
  type PlanCode,
} from '@booksaga/shared';
import type { DbClient } from './db';

export interface AccountProfile {
  id: string;
  parentAgencyId: string | null;
  resellerOwnerId: string | null;
}

export type Balances = Record<CreditPool, number>;

export interface ClientAllotment {
  allotment: number;
  used: number;
  remaining: number;
}

export interface Account {
  /** Plans that decide this account's FEATURES (an agency client uses the owner's plans). */
  plans: PlanCode[];
  entitlements: Entitlements;
  /** What this user can actually spend, per pool. */
  balances: Balances;
  isAgencyClient: boolean;
  isResellerCustomer: boolean;
  /** Only for agency clients. */
  clientAllotment: ClientAllotment | null;
}

const EMPTY_BALANCES: Balances = { main: 0, audio: 0, agency: 0 };

export async function loadActivePlans(db: DbClient, userId: string): Promise<PlanCode[]> {
  const { data, error } = await db
    .from('user_plans')
    .select('plan_code')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(`Failed to load plans: ${error.message}`);
  return (data ?? []).map((r) => r.plan_code).filter(isPlanCode);
}

export async function loadBalances(db: DbClient, userId: string): Promise<Balances> {
  const { data, error } = await db
    .from('credit_balances')
    .select('pool, balance')
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to load balances: ${error.message}`);
  const out = { ...EMPTY_BALANCES };
  for (const row of data ?? []) {
    if (row.pool === 'main' || row.pool === 'audio' || row.pool === 'agency') {
      out[row.pool] = row.balance;
    }
  }
  return out;
}

/**
 * Load plans, entitlements and spendable balances.
 * Pass a client that can read the owner's rows when the user is an agency client
 * (use the service-role client for that case).
 */
export async function loadAccount(db: DbClient, profile: AccountProfile): Promise<Account> {
  if (profile.parentAgencyId) {
    const ownerId = profile.parentAgencyId;
    const [ownerPlans, ownerBalances, link] = await Promise.all([
      loadActivePlans(db, ownerId),
      loadBalances(db, ownerId),
      db
        .from('agency_clients')
        .select('allotment, used')
        .eq('owner_id', ownerId)
        .eq('client_id', profile.id)
        .maybeSingle(),
    ]);
    const allotment = link.data?.allotment ?? 0;
    const used = link.data?.used ?? 0;
    const remaining = Math.max(allotment - used, 0);
    return {
      plans: ownerPlans,
      entitlements: resolveEntitlements(ownerPlans),
      // A client has no pool of their own: spendable agency credits are capped by their allotment.
      balances: {
        main: 0,
        audio: ownerBalances.audio,
        agency: Math.min(remaining, ownerBalances.agency),
      },
      isAgencyClient: true,
      isResellerCustomer: false,
      clientAllotment: { allotment, used, remaining },
    };
  }

  const isResellerCustomer = profile.resellerOwnerId !== null;
  const [plans, balances] = await Promise.all([
    loadActivePlans(db, profile.id),
    loadBalances(db, profile.id),
  ]);
  return {
    plans,
    entitlements: resolveEntitlements(plans, { isResellerCustomer }),
    balances,
    isAgencyClient: false,
    isResellerCustomer,
    clientAllotment: null,
  };
}
