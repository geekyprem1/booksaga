import { AppError, PLANS, isPlanCode, type PlanCode } from '@booksaga/shared';
import { writeAudit } from './audit';
import { mapCreditError } from './credits';
import type { DbClient } from './db';
import { generatePassword } from './password';

export type ProvisionSource = 'manual' | 'csv' | 'launchpad' | 'warriorplus' | 'jvzoo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email)) && email.length <= 254;
}

export interface UpsertUserResult {
  userId: string;
  created: boolean;
  /** Only set when the account was just created (or the password was just reset). */
  password?: string;
}

/** Find an account by email (case-insensitive) or create it with a generated password. */
export async function upsertUser(
  db: DbClient,
  input: { email: string; name?: string; credentialsPending: boolean },
): Promise<UpsertUserResult> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email))
    throw new AppError('VALIDATION', `Invalid email address: ${input.email}`);

  const existing = await db.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existing.error) throw new Error(`Lookup failed: ${existing.error.message}`);
  if (existing.data) return { userId: existing.data.id, created: false };

  const password = generatePassword();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: input.name?.trim() ?? '' },
  });
  if (error || !data.user) {
    // A concurrent request may have created the same user; fall back to the existing account.
    const again = await db.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (again.data) return { userId: again.data.id, created: false };
    throw new AppError(
      'INTERNAL',
      `Could not create the account: ${error?.message ?? 'unknown error'}`,
    );
  }

  if (input.credentialsPending) {
    await db.from('profiles').update({ credentials_pending: true }).eq('id', data.user.id);
  }
  return { userId: data.user.id, created: true, password };
}

export interface GrantPlanResult {
  userPlanId: string;
  planCode: PlanCode;
  /** False when the user already held this plan (nothing changed, no credits added). */
  granted: boolean;
  credits: { main: number; audio: number; agency: number };
}

const NO_CREDITS = { main: 0, audio: 0, agency: 0 };

/** Record a purchase row (manual/csv/launchpad grants are tracked like real sales). */
export async function recordPurchase(
  db: DbClient,
  input: {
    userId: string;
    platform: ProvisionSource;
    planCode: PlanCode;
    txnId?: string;
    amount?: number;
  },
): Promise<string> {
  const { data, error } = await db
    .from('purchases')
    .insert({
      user_id: input.userId,
      platform: input.platform,
      txn_id: input.txnId ?? null,
      product_id: input.planCode,
      amount: input.amount ?? PLANS[input.planCode].priceUsd,
      status: 'completed',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to record purchase: ${error?.message}`);
  return data.id;
}

/**
 * Give a user a plan and its ONE-TIME credits. Idempotent: holding the plan already is a no-op.
 */
export async function grantPlan(
  db: DbClient,
  input: {
    userId: string;
    planCode: PlanCode;
    source: ProvisionSource;
    grantedBy?: string | null;
    purchaseId?: string | null;
  },
): Promise<GrantPlanResult> {
  const { userId, planCode } = input;
  if (!isPlanCode(planCode)) throw new AppError('VALIDATION', `Unknown plan: ${planCode}`);

  const existing = await db
    .from('user_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_code', planCode)
    .eq('status', 'active')
    .maybeSingle();
  if (existing.data) {
    return { userPlanId: existing.data.id, planCode, granted: false, credits: NO_CREDITS };
  }

  const inserted = await db
    .from('user_plans')
    .insert({
      user_id: userId,
      plan_code: planCode,
      source: input.source,
      granted_by: input.grantedBy ?? null,
      purchase_id: input.purchaseId ?? null,
    })
    .select('id')
    .single();

  if (inserted.error || !inserted.data) {
    if (inserted.error?.code === '23505') {
      // Lost a race with a concurrent grant of the same plan.
      const again = await db
        .from('user_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('plan_code', planCode)
        .eq('status', 'active')
        .maybeSingle();
      if (again.data)
        return { userPlanId: again.data.id, planCode, granted: false, credits: NO_CREDITS };
    }
    throw new Error(`Failed to grant plan: ${inserted.error?.message}`);
  }

  const { data, error } = await db.rpc('grant_plan_credits', { p_user_plan: inserted.data.id });
  if (error) throw mapCreditError(error);
  const credits = (data ?? NO_CREDITS) as { main: number; audio: number; agency: number };
  return { userPlanId: inserted.data.id, planCode, granted: true, credits };
}

export interface RevokePlanResult {
  /** False when the user did not hold the plan. */
  revoked: boolean;
  /** Credits taken back, per pool (never more than the remaining balance). */
  creditsRemoved: { main: number; audio: number; agency: number };
}

/** Refund/chargeback/manual revoke: end the plan and take back what it granted. */
export async function revokePlan(
  db: DbClient,
  input: {
    userId: string;
    planCode: PlanCode;
    /** Status to put on the linked purchase (admin revoke = cancelled, webhooks = refunded/chargeback). */
    purchaseStatus?: 'refunded' | 'chargeback' | 'cancelled';
  },
): Promise<RevokePlanResult> {
  const row = await db
    .from('user_plans')
    .select('id, purchase_id')
    .eq('user_id', input.userId)
    .eq('plan_code', input.planCode)
    .eq('status', 'active')
    .maybeSingle();
  if (!row.data) return { revoked: false, creditsRemoved: NO_CREDITS };

  const upd = await db
    .from('user_plans')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', row.data.id);
  if (upd.error) throw new Error(`Failed to revoke plan: ${upd.error.message}`);

  if (row.data.purchase_id) {
    await db
      .from('purchases')
      .update({ status: input.purchaseStatus ?? 'cancelled' })
      .eq('id', row.data.purchase_id);
  }

  const { data, error } = await db.rpc('revoke_plan_credits', { p_user_plan: row.data.id });
  if (error) throw mapCreditError(error);
  return {
    revoked: true,
    creditsRemoved: (data ?? NO_CREDITS) as RevokePlanResult['creditsRemoved'],
  };
}

/** Set a fresh generated password (admin "reset password"). Returns the plaintext once. */
export async function resetPassword(db: DbClient, userId: string): Promise<string> {
  const password = generatePassword();
  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) throw new AppError('INTERNAL', `Could not reset the password: ${error.message}`);
  return password;
}

export interface ProvisionInput {
  email: string;
  name?: string;
  plans: PlanCode[];
  source: ProvisionSource;
  actorId?: string | null;
  /** True when the credentials still have to be delivered to the buyer (CSV, webhooks). */
  credentialsPending: boolean;
  txnId?: string;
}

export interface ProvisionResult {
  userId: string;
  email: string;
  created: boolean;
  password?: string;
  plans: GrantPlanResult[];
}

/**
 * The one entry point for "this person bought these plans": create or find the account, record a
 * purchase per newly granted plan, grant plans + one-time credits, and write the audit log.
 * Used by the admin UI, CSV import and (later) the WarriorPlus/JVZoo webhooks.
 */
export async function provisionAccount(
  db: DbClient,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const email = normalizeEmail(input.email);
  const user = await upsertUser(db, {
    email,
    name: input.name,
    credentialsPending: input.credentialsPending,
  });

  const results: GrantPlanResult[] = [];
  for (const planCode of new Set(input.plans)) {
    const alreadyHeld = await db
      .from('user_plans')
      .select('id')
      .eq('user_id', user.userId)
      .eq('plan_code', planCode)
      .eq('status', 'active')
      .maybeSingle();

    const purchaseId = alreadyHeld.data
      ? null
      : await recordPurchase(db, {
          userId: user.userId,
          platform: input.source,
          planCode,
          txnId: input.txnId ? `${input.txnId}:${planCode}` : undefined,
        });

    results.push(
      await grantPlan(db, {
        userId: user.userId,
        planCode,
        source: input.source,
        grantedBy: input.actorId ?? null,
        purchaseId,
      }),
    );
  }

  await writeAudit(db, {
    actorId: input.actorId ?? null,
    action: user.created ? 'user.create' : 'user.grant_plans',
    target: `user:${user.userId}`,
    meta: {
      email,
      source: input.source,
      plans: results.filter((r) => r.granted).map((r) => r.planCode),
      already_held: results.filter((r) => !r.granted).map((r) => r.planCode),
    },
  });

  return {
    userId: user.userId,
    email,
    created: user.created,
    password: user.password,
    plans: results,
  };
}
