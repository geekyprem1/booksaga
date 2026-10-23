'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `Rs-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

const createInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
});

/**
 * Create a reseller customer (T6.19): an FE account owned by this reseller, funded with the FE
 * one-time grant, consuming one licence.
 */
export async function createResellerCustomerAction(
  raw: z.infer<typeof createInput>,
): Promise<ActionResult<{ email: string; password: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { name, email } = createInput.parse(raw);
    const db = getAdminDb();

    const { account } = await getAccount();
    const { count } = await db
      .from('reseller_licenses')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('status', 'used');
    assertCan(account.entitlements, { kind: 'reseller', licenseCount: count ?? 0 });

    // Licences are provisioned lazily up to the plan limit (50 for Lite, 100 for full).
    const max = account.entitlements.maxResellLicenses;
    const { count: total } = await db
      .from('reseller_licenses')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    const missing = Math.max(0, max - (total ?? 0));
    if (missing > 0) {
      await db.from('reseller_licenses').insert(
        Array.from({ length: missing }, () => ({ owner_id: user.id, status: 'available' as const })),
      );
    }

    const { data: licence } = await db
      .from('reseller_licenses')
      .select('id')
      .eq('owner_id', user.id)
      .eq('status', 'available')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (!licence) {
      throw new AppError('LIMIT_REACHED', 'You have no unused licences left.');
    }

    const password = generatePassword();
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? 'unknown error';
      throw new AppError(
        message.includes('already') ? 'VALIDATION' : 'INTERNAL',
        message.includes('already')
          ? 'An account with that email already exists.'
          : `Could not create the customer: ${message}`,
      );
    }

    const customerId = created.data.user.id;

    const { error: profileError } = await db
      .from('profiles')
      .update({ name, reseller_owner_id: user.id })
      .eq('id', customerId);
    if (profileError) {
      await db.auth.admin.deleteUser(customerId).catch(() => undefined);
      throw new AppError('INTERNAL', `Could not finish the customer account: ${profileError.message}`);
    }

    // FE plan + its one-time credits.
    const { data: plan, error: planError } = await db
      .from('user_plans')
      .insert({ user_id: customerId, plan_code: 'fe', source: 'reseller' })
      .select('id')
      .single();
    if (planError || !plan) {
      await db.auth.admin.deleteUser(customerId).catch(() => undefined);
      throw new AppError('INTERNAL', `Could not grant the plan: ${planError?.message}`);
    }
    await db.rpc('grant_plan_credits', { p_user_plan: plan.id });

    await db
      .from('reseller_licenses')
      .update({ status: 'used', customer_id: customerId, used_at: new Date().toISOString() })
      .eq('id', licence.id);

    revalidatePath('/reseller');
    return { email, password };
  });
}

const revokeInput = z.object({ customerId: z.string().uuid() });

/** Revoke a customer (T6.19): the licence returns to the pool, the account keeps existing. */
export async function revokeResellerCustomerAction(
  raw: z.infer<typeof revokeInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { customerId } = revokeInput.parse(raw);
    const db = getAdminDb();

    const { data: licence } = await db
      .from('reseller_licenses')
      .select('id, customer_id')
      .eq('owner_id', user.id)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (!licence) throw new AppError('NOT_FOUND', 'That customer is not yours.');

    await db
      .from('user_plans')
      .update({ status: 'revoked' })
      .eq('user_id', customerId)
      .eq('status', 'active');

    await db
      .from('reseller_licenses')
      .update({ status: 'available', customer_id: null, used_at: null })
      .eq('id', licence.id);

    revalidatePath('/reseller');
    return undefined;
  });
}
