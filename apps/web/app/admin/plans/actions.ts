'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { writeAudit } from '@booksaga/core';
import { CREDIT_ACTIONS, PLAN_CODES, planLimitsSchema } from '@booksaga/shared';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction } from '@/lib/actions';

export async function savePlanLimits(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z.object({ code: z.enum(PLAN_CODES), limits: planLimitsSchema }).parse(input);
    const db = getAdminDb();
    const old = await db.from('plans').select('limits').eq('code', data.code).single();
    if (old.error) throw new Error(old.error.message);
    const result = await db.from('plans').update({ limits: data.limits }).eq('code', data.code);
    if (result.error) throw new Error(result.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'plan.limits',
      target: `plan:${data.code}`,
      meta: { before: old.data.limits, after: data.limits },
    });
    revalidatePath('/admin/plans');
    return undefined;
  });
}

export async function saveCreditCost(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z
      .object({ action: z.enum(CREDIT_ACTIONS), credits: z.number().int().min(0).max(100000) })
      .parse(input);
    const db = getAdminDb();
    const old = await db.from('credit_costs').select('credits').eq('action', data.action).single();
    if (old.error) throw new Error(old.error.message);
    const result = await db
      .from('credit_costs')
      .update({ credits: data.credits })
      .eq('action', data.action);
    if (result.error) throw new Error(result.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'credits.cost',
      target: `credit_cost:${data.action}`,
      meta: { before: old.data.credits, after: data.credits },
    });
    revalidatePath('/admin/plans');
    return undefined;
  });
}

export async function saveDailyCap(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const cap = z.number().int().min(1).max(100000).parse(input);
    const db = getAdminDb();
    const old = await db.from('app_settings').select('value').eq('key', 'limits').single();
    if (old.error) throw new Error(old.error.message);
    const previous = (old.data.value ?? {}) as Record<string, string | number | boolean | null>;
    const result = await db
      .from('app_settings')
      .update({ value: { ...previous, daily_book_cap: cap } })
      .eq('key', 'limits');
    if (result.error) throw new Error(result.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'credits.daily_cap',
      target: 'settings:limits',
      meta: { before: previous.daily_book_cap, after: cap },
    });
    revalidatePath('/admin/plans');
    return undefined;
  });
}
