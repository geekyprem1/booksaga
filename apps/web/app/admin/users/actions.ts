'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  adjustCredits,
  provisionAccount,
  resetPassword,
  revokePlan,
  writeAudit,
} from '@booksaga/core';
import { AppError, CREDIT_POOLS, PLAN_CODES, getServerEnv } from '@booksaga/shared';
import { runAction, type ActionResult } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

const uuid = z.uuid();
const planCode = z.enum(PLAN_CODES);

export interface Credentials {
  email: string;
  password: string;
  loginUrl: string;
}

function loginUrl(): string {
  return `${getServerEnv().APP_URL.replace(/\/$/, '')}/login`;
}

export interface CreateUserResult {
  userId: string;
  created: boolean;
  credentials?: Credentials;
  grantedPlans: string[];
  alreadyHeld: string[];
}

const createSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address.')),
  name: z.string().trim().max(120).default(''),
  plans: z.array(planCode).min(1, 'Select at least one plan.'),
});

export async function createUserAction(input: unknown): Promise<ActionResult<CreateUserResult>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = createSchema.parse(input);
    const result = await provisionAccount(getAdminDb(), {
      email: data.email,
      name: data.name,
      plans: data.plans,
      source: 'manual',
      actorId: admin.id,
      // The password is shown to the admin right now, so nothing is pending.
      credentialsPending: false,
    });
    revalidatePath('/admin/users');
    return {
      userId: result.userId,
      created: result.created,
      credentials:
        result.created && result.password
          ? { email: result.email, password: result.password, loginUrl: loginUrl() }
          : undefined,
      grantedPlans: result.plans.filter((p) => p.granted).map((p) => p.planCode),
      alreadyHeld: result.plans.filter((p) => !p.granted).map((p) => p.planCode),
    };
  });
}

export async function grantPlanAction(input: unknown): Promise<ActionResult<{ granted: boolean }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId, plan } = z.object({ userId: uuid, plan: planCode }).parse(input);
    const db = getAdminDb();
    const profile = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (!profile.data) throw new AppError('NOT_FOUND', 'User not found.');

    const result = await provisionAccount(db, {
      email: profile.data.email,
      plans: [plan],
      source: 'manual',
      actorId: admin.id,
      credentialsPending: false,
    });
    revalidatePath(`/admin/users/${userId}`);
    return { granted: result.plans.some((p) => p.granted) };
  });
}

export async function revokePlanAction(
  input: unknown,
): Promise<ActionResult<{ creditsRemoved: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId, plan } = z.object({ userId: uuid, plan: planCode }).parse(input);
    const db = getAdminDb();
    const res = await revokePlan(db, { userId, planCode: plan, purchaseStatus: 'cancelled' });
    if (!res.revoked) throw new AppError('NOT_FOUND', 'The user does not hold this plan.');
    await writeAudit(db, {
      actorId: admin.id,
      action: 'plan.revoke',
      target: `user:${userId}`,
      meta: { plan, credits_removed: res.creditsRemoved },
    });
    revalidatePath(`/admin/users/${userId}`);
    const c = res.creditsRemoved;
    return { creditsRemoved: c.main + c.audio + c.agency };
  });
}

export async function setStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId, status } = z
      .object({ userId: uuid, status: z.enum(['active', 'suspended']) })
      .parse(input);
    if (userId === admin.id) throw new AppError('FORBIDDEN', 'You cannot change your own status.');

    const db = getAdminDb();
    const { error } = await db.from('profiles').update({ status }).eq('id', userId);
    if (error) throw new AppError('INTERNAL', error.message);
    // A suspended user is blocked on their very next request: requireUser() re-reads the status.
    await writeAudit(db, {
      actorId: admin.id,
      action: status === 'suspended' ? 'user.suspend' : 'user.activate',
      target: `user:${userId}`,
    });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/users');
    return undefined;
  });
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult<Credentials>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId } = z.object({ userId: uuid }).parse(input);
    const db = getAdminDb();
    const profile = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (!profile.data) throw new AppError('NOT_FOUND', 'User not found.');

    const password = await resetPassword(db, userId);
    await db.from('profiles').update({ credentials_pending: false }).eq('id', userId);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'user.reset_password',
      target: `user:${userId}`,
    });
    revalidatePath(`/admin/users/${userId}`);
    return { email: profile.data.email, password, loginUrl: loginUrl() };
  });
}

export async function adjustCreditsAction(
  input: unknown,
): Promise<ActionResult<{ balance: number }>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z
      .object({
        userId: uuid,
        pool: z.enum(CREDIT_POOLS),
        amount: z
          .number()
          .int()
          .refine((n) => n !== 0, 'Amount cannot be zero.'),
        reason: z.string().trim().min(3, 'Please give a reason (min 3 characters).').max(300),
      })
      .parse(input);
    const db = getAdminDb();
    const balance = await adjustCredits(db, {
      userId: data.userId,
      pool: data.pool,
      amount: data.amount,
      actorId: admin.id,
      reason: data.reason,
    });
    await writeAudit(db, {
      actorId: admin.id,
      action: 'credits.adjust',
      target: `user:${data.userId}`,
      meta: { pool: data.pool, amount: data.amount, reason: data.reason, balance },
    });
    revalidatePath(`/admin/users/${data.userId}`);
    return { balance };
  });
}

export async function markCredentialsSentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId } = z.object({ userId: uuid }).parse(input);
    const db = getAdminDb();
    await db.from('profiles').update({ credentials_pending: false }).eq('id', userId);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'user.credentials_sent',
      target: `user:${userId}`,
    });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/users');
    return undefined;
  });
}

export async function updateNameAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { userId, name } = z
      .object({ userId: uuid, name: z.string().trim().max(120) })
      .parse(input);
    const db = getAdminDb();
    const { error } = await db.from('profiles').update({ name }).eq('id', userId);
    if (error) throw new AppError('INTERNAL', error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'user.update',
      target: `user:${userId}`,
      meta: { name },
    });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/users');
    return undefined;
  });
}
