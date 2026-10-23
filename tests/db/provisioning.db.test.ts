import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  adjustCredits,
  grantPlan,
  loadAccount,
  provisionAccount,
  resetPassword,
  revokePlan,
} from '@booksaga/core';
import { admin, anonClient, balanceOf, db, makeUser } from './helpers';

const createdIds: string[] = [];
afterAll(async () => {
  await Promise.all(createdIds.map((id) => admin.auth.admin.deleteUser(id)));
});

const newEmail = () => `prov-${randomUUID()}@booksaga.test`;

async function provision(
  plans: Parameters<typeof provisionAccount>[1]['plans'],
  email = newEmail(),
) {
  const r = await provisionAccount(db, {
    email,
    name: 'Buyer',
    plans,
    source: 'manual',
    credentialsPending: false,
  });
  if (r.created) createdIds.push(r.userId);
  return r;
}

describe('provisionAccount', () => {
  it('creates a working account, grants plans, and adds their one-time credits', async () => {
    const r = await provision(['fe', 'oto1']);
    expect(r.created).toBe(true);
    expect(r.password).toBeTruthy();
    expect(await balanceOf(r.userId, 'main')).toBe(3300);

    // The generated credentials really work.
    const c = anonClient();
    const { error } = await c.auth.signInWithPassword({ email: r.email, password: r.password! });
    expect(error).toBeNull();

    const account = await loadAccount(db, {
      id: r.userId,
      parentAgencyId: null,
      resellerOwnerId: null,
    });
    expect(account.plans.sort()).toEqual(['fe', 'oto1']);
    expect(account.entitlements.maxSeries).toBeNull();
    expect(account.balances.main).toBe(3300);
  });

  it('records one purchase per plan and an audit entry', async () => {
    const r = await provision(['fe', 'oto3_lite']);
    const purchases = await db
      .from('purchases')
      .select('product_id, platform, amount')
      .eq('user_id', r.userId);
    expect(purchases.data?.map((p) => p.product_id).sort()).toEqual(['fe', 'oto3_lite']);
    expect(purchases.data?.every((p) => p.platform === 'manual')).toBe(true);
    expect(await balanceOf(r.userId, 'audio')).toBe(300);

    const audit = await db
      .from('audit_log')
      .select('action, target')
      .eq('target', `user:${r.userId}`);
    expect(audit.data?.[0]?.action).toBe('user.create');
  });

  it('is idempotent: same email + plans again creates nothing and adds no credits', async () => {
    const email = newEmail();
    const first = await provision(['fe'], email);
    const second = await provisionAccount(db, {
      email: email.toUpperCase(),
      plans: ['fe'],
      source: 'manual',
      credentialsPending: false,
    });
    expect(second.created).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(second.password).toBeUndefined();
    expect(second.plans[0]?.granted).toBe(false);
    expect(await balanceOf(first.userId, 'main')).toBe(300);
    const purchases = await db.from('purchases').select('id').eq('user_id', first.userId);
    expect(purchases.data).toHaveLength(1);
  });

  it('adds an OTO to an existing account later (credits stack)', async () => {
    const first = await provision(['fe']);
    const upgrade = await provisionAccount(db, {
      email: first.email,
      plans: ['oto1_lite'],
      source: 'manual',
      credentialsPending: false,
    });
    expect(upgrade.created).toBe(false);
    expect(await balanceOf(first.userId, 'main')).toBe(1300);
  });

  it('flags credentials as pending when requested', async () => {
    const r = await provisionAccount(db, {
      email: newEmail(),
      plans: ['fe'],
      source: 'csv',
      credentialsPending: true,
    });
    createdIds.push(r.userId);
    const { data } = await db
      .from('profiles')
      .select('credentials_pending')
      .eq('id', r.userId)
      .single();
    expect(data?.credentials_pending).toBe(true);
  });

  it('rejects malformed emails', async () => {
    await expect(
      provisionAccount(db, {
        email: 'not-an-email',
        plans: ['fe'],
        source: 'manual',
        credentialsPending: false,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('handles 10 parallel provisions of the same email without duplicates or double credits', async () => {
    const email = newEmail();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        provisionAccount(db, { email, plans: ['fe'], source: 'csv', credentialsPending: true }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBeGreaterThan(0);
    const id = (ok[0] as PromiseFulfilledResult<{ userId: string }>).value.userId;
    createdIds.push(id);
    const profiles = await db.from('profiles').select('id').ilike('email', email);
    expect(profiles.data).toHaveLength(1);
    expect(await balanceOf(id, 'main')).toBe(300);
  });
});

describe('revokePlan / refunds', () => {
  it('removes the plan features and takes back its credits only', async () => {
    const r = await provision(['fe', 'oto1']);
    const res = await revokePlan(db, { userId: r.userId, planCode: 'oto1' });
    expect(res.revoked).toBe(true);
    expect(res.creditsRemoved.main).toBe(3000);
    expect(await balanceOf(r.userId, 'main')).toBe(300);

    const account = await loadAccount(db, {
      id: r.userId,
      parentAgencyId: null,
      resellerOwnerId: null,
    });
    expect(account.plans).toEqual(['fe']);
    expect(account.entitlements.maxSeries).toBe(3);
  });

  it('is a no-op for a plan the user does not hold', async () => {
    const r = await provision(['fe']);
    const res = await revokePlan(db, { userId: r.userId, planCode: 'oto4' });
    expect(res.revoked).toBe(false);
    expect(await balanceOf(r.userId, 'main')).toBe(300);
  });

  it('can re-grant a revoked plan (new grant, new credits)', async () => {
    const r = await provision(['fe', 'oto1_lite']);
    await revokePlan(db, { userId: r.userId, planCode: 'oto1_lite' });
    expect(await balanceOf(r.userId, 'main')).toBe(300);
    const again = await grantPlan(db, {
      userId: r.userId,
      planCode: 'oto1_lite',
      source: 'manual',
    });
    expect(again.granted).toBe(true);
    expect(await balanceOf(r.userId, 'main')).toBe(1300);
  });
});

describe('account helpers', () => {
  it('gives reseller customers 100 credits and FE-only features', async () => {
    const owner = await makeUser();
    const customer = await makeUser({ resellerOwnerId: owner.id });
    await grantPlan(db, { userId: customer.id, planCode: 'fe', source: 'manual' });
    const account = await loadAccount(db, {
      id: customer.id,
      parentAgencyId: null,
      resellerOwnerId: owner.id,
    });
    expect(account.balances.main).toBe(100);
    expect(account.isResellerCustomer).toBe(true);
  });

  it('resolves an agency client to the owner features and the allotment-capped agency balance', async () => {
    const owner = await makeUser();
    await grantPlan(db, { userId: owner.id, planCode: 'fe', source: 'manual' });
    await grantPlan(db, { userId: owner.id, planCode: 'oto1', source: 'manual' });
    await grantPlan(db, { userId: owner.id, planCode: 'oto4_lite', source: 'manual' });
    const client = await makeUser({ parentAgencyId: owner.id });
    await db
      .from('agency_clients')
      .insert({ owner_id: owner.id, client_id: client.id, allotment: 150 });

    const account = await loadAccount(db, {
      id: client.id,
      parentAgencyId: owner.id,
      resellerOwnerId: null,
    });
    expect(account.isAgencyClient).toBe(true);
    expect(account.entitlements.lengthPresets).toContain('full');
    expect(account.balances.agency).toBe(150); // min(allotment 150, pool 2000)
    expect(account.balances.main).toBe(0);
    expect(account.clientAllotment).toEqual({ allotment: 150, used: 0, remaining: 150 });
  });

  it('adjustCredits maps database errors to AppError codes', async () => {
    const r = await provision(['fe']);
    const adm = await makeUser({ role: 'admin' });
    await expect(
      adjustCredits(db, { userId: r.userId, pool: 'main', amount: 5, actorId: adm.id, reason: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      adjustCredits(db, {
        userId: r.userId,
        pool: 'main',
        amount: -9999,
        actorId: adm.id,
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(
      await adjustCredits(db, {
        userId: r.userId,
        pool: 'main',
        amount: 25,
        actorId: adm.id,
        reason: 'bonus',
      }),
    ).toBe(325);
  });

  it('resetPassword issues a new working password and invalidates the old one', async () => {
    const r = await provision(['fe']);
    const newPassword = await resetPassword(db, r.userId);
    const ok = await anonClient().auth.signInWithPassword({
      email: r.email,
      password: newPassword,
    });
    expect(ok.error).toBeNull();
    const old = await anonClient().auth.signInWithPassword({
      email: r.email,
      password: r.password!,
    });
    expect(old.error).not.toBeNull();
  });
});
