import { afterAll, describe, expect, it } from 'vitest';
import { admin, balanceOf, cleanupUsers, grantPlan, makeUser, reserve } from './helpers';

afterAll(cleanupUsers);

describe('grant_plan_credits (one-time, stacking, idempotent)', () => {
  it('FE grants 300 main credits once; calling again does not double', async () => {
    const u = await makeUser();
    const upId = await grantPlan(u.id, 'fe');
    expect(await balanceOf(u.id, 'main')).toBe(300);

    const again = await admin.rpc('grant_plan_credits', { p_user_plan: upId });
    expect(again.error).toBeNull();
    expect(await balanceOf(u.id, 'main')).toBe(300);
  });

  it('stacks: FE + Unlimited Lite + Unlimited = 4,300', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');
    await grantPlan(u.id, 'oto1_lite');
    await grantPlan(u.id, 'oto1');
    expect(await balanceOf(u.id, 'main')).toBe(4300);
  });

  it('puts audio and agency grants in their own pools', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');
    await grantPlan(u.id, 'oto3');
    await grantPlan(u.id, 'oto4_lite');
    expect(await balanceOf(u.id, 'main')).toBe(300);
    expect(await balanceOf(u.id, 'audio')).toBe(1000);
    expect(await balanceOf(u.id, 'agency')).toBe(2000);
  });

  it('plans without credits (DFY, Reseller) grant nothing', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'oto2');
    await grantPlan(u.id, 'oto5');
    expect(await balanceOf(u.id, 'main')).toBe(0);
  });

  it('reseller customers get 100 instead of 300 on FE', async () => {
    const owner = await makeUser();
    const customer = await makeUser({ resellerOwnerId: owner.id });
    await grantPlan(customer.id, 'fe');
    expect(await balanceOf(customer.id, 'main')).toBe(100);
  });
});

describe('reserve / commit / refund', () => {
  it('reserve debits immediately; commit is idempotent and keeps the debit', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');

    const r = await reserve(u.id, 'main', 20);
    expect(r.error).toBeNull();
    const ledger = r.data as number;
    expect(await balanceOf(u.id, 'main')).toBe(280);

    const c1 = await admin.rpc('commit_credits', { p_ledger: ledger });
    const c2 = await admin.rpc('commit_credits', { p_ledger: ledger });
    expect(c1.data).toBe('committed');
    expect(c2.data).toBe('already_committed');
    expect(await balanceOf(u.id, 'main')).toBe(280);
  });

  it('refund restores credits and is idempotent', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');
    const ledger = (await reserve(u.id, 'main', 35)).data as number;
    expect(await balanceOf(u.id, 'main')).toBe(265);

    const r1 = await admin.rpc('refund_credits', { p_ledger: ledger, p_reason: 'job failed' });
    const r2 = await admin.rpc('refund_credits', { p_ledger: ledger, p_reason: 'job failed' });
    expect(r1.data).toBe('refunded');
    expect(r2.data).toBe('already_refunded');
    expect(await balanceOf(u.id, 'main')).toBe(300);
  });

  it('cannot refund a committed reservation or commit a refunded one', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');
    const committed = (await reserve(u.id, 'main', 10)).data as number;
    await admin.rpc('commit_credits', { p_ledger: committed });
    expect((await admin.rpc('refund_credits', { p_ledger: committed })).data).toBe(
      'not_refundable',
    );

    const refunded = (await reserve(u.id, 'main', 10)).data as number;
    await admin.rpc('refund_credits', { p_ledger: refunded });
    expect((await admin.rpc('commit_credits', { p_ledger: refunded })).data).toBe('refunded');
    expect(await balanceOf(u.id, 'main')).toBe(290);
  });

  it('rejects a reservation larger than the balance', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe');
    const r = await reserve(u.id, 'main', 301);
    expect(r.error?.message).toContain('INSUFFICIENT_CREDITS');
    expect(await balanceOf(u.id, 'main')).toBe(300);
  });

  it('rejects a reservation when the user has no balance row at all', async () => {
    const u = await makeUser();
    const r = await reserve(u.id, 'main', 1);
    expect(r.error?.message).toContain('INSUFFICIENT_CREDITS');
  });

  it('20 parallel reservations never overspend', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe'); // 300 credits
    const results = await Promise.all(Array.from({ length: 20 }, () => reserve(u.id, 'main', 20)));
    const ok = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error?.message.includes('INSUFFICIENT_CREDITS')).length;
    expect(ok).toBe(15); // 15 x 20 = 300
    expect(failed).toBe(5);
    expect(await balanceOf(u.id, 'main')).toBe(0);
  });
});

describe('agency client allotment', () => {
  it('charges the owner agency pool, enforces the client allotment, refunds it back', async () => {
    const owner = await makeUser();
    await grantPlan(owner.id, 'fe');
    await grantPlan(owner.id, 'oto4_lite'); // 2,000 agency credits
    const client = await makeUser({ parentAgencyId: owner.id });
    const link = await admin
      .from('agency_clients')
      .insert({ owner_id: owner.id, client_id: client.id, allotment: 100 });
    expect(link.error).toBeNull();

    const first = await reserve(owner.id, 'agency', 60, client.id);
    expect(first.error).toBeNull();
    expect(await balanceOf(owner.id, 'agency')).toBe(1940);
    expect(await balanceOf(owner.id, 'main')).toBe(300); // owner's own credits untouched

    const over = await reserve(owner.id, 'agency', 50, client.id);
    expect(over.error?.message).toContain('CLIENT_ALLOTMENT_EXHAUSTED');
    expect(await balanceOf(owner.id, 'agency')).toBe(1940);

    await admin.rpc('refund_credits', { p_ledger: first.data as number, p_reason: 'failed' });
    expect(await balanceOf(owner.id, 'agency')).toBe(2000);
    const { data } = await admin
      .from('agency_clients')
      .select('used')
      .eq('client_id', client.id)
      .single();
    expect(data?.used).toBe(0);

    const again = await reserve(owner.id, 'agency', 100, client.id);
    expect(again.error).toBeNull();
  });

  it('rejects an unknown client', async () => {
    const owner = await makeUser();
    await grantPlan(owner.id, 'oto4');
    const stranger = await makeUser();
    const r = await reserve(owner.id, 'agency', 5, stranger.id);
    expect(r.error?.message).toContain('CLIENT_NOT_FOUND');
  });
});

describe('revoke_plan_credits (refund / chargeback)', () => {
  it('takes back what the plan granted but never below zero', async () => {
    const u = await makeUser();
    const upId = await grantPlan(u.id, 'fe'); // 300
    const l = (await reserve(u.id, 'main', 250)).data as number;
    await admin.rpc('commit_credits', { p_ledger: l }); // user spent 250 -> balance 50

    const r = await admin.rpc('revoke_plan_credits', { p_user_plan: upId });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ main: 50 });
    expect(await balanceOf(u.id, 'main')).toBe(0);

    // idempotent
    await admin.rpc('revoke_plan_credits', { p_user_plan: upId });
    expect(await balanceOf(u.id, 'main')).toBe(0);
  });

  it('only removes the revoked plan, keeping credits from other plans', async () => {
    const u = await makeUser();
    await grantPlan(u.id, 'fe'); // 300
    const unlimited = await grantPlan(u.id, 'oto1'); // 3,000
    await admin.rpc('revoke_plan_credits', { p_user_plan: unlimited });
    expect(await balanceOf(u.id, 'main')).toBe(300);
  });
});

describe('adjust_credits (admin bonus / support)', () => {
  it('adds, deducts, requires a reason, and refuses to go negative', async () => {
    const u = await makeUser();
    const admUser = await makeUser({ role: 'admin' });
    await grantPlan(u.id, 'fe');

    const add = await admin.rpc('adjust_credits', {
      p_user: u.id,
      p_pool: 'main',
      p_amount: 50,
      p_actor: admUser.id,
      p_reason: 'support bonus',
    });
    expect(add.data).toBe(350);

    const noReason = await admin.rpc('adjust_credits', {
      p_user: u.id,
      p_pool: 'main',
      p_amount: 5,
      p_actor: admUser.id,
      p_reason: '  ',
    });
    expect(noReason.error?.message).toContain('REASON_REQUIRED');

    const tooMuch = await admin.rpc('adjust_credits', {
      p_user: u.id,
      p_pool: 'main',
      p_amount: -1000,
      p_actor: admUser.id,
      p_reason: 'oops',
    });
    expect(tooMuch.error?.message).toContain('ADJUSTMENT_EXCEEDS_BALANCE');
    expect(await balanceOf(u.id, 'main')).toBe(350);
  });
});

describe('jobs constraints', () => {
  const job = (userId: string, key: string, type = 'book') => ({
    user_id: userId,
    type,
    idempotency_key: key,
  });

  it('allows only one queued/active book job per user (parallel inserts)', async () => {
    const u = await makeUser();
    const results = await Promise.all([
      admin.from('jobs').insert(job(u.id, `book-${crypto.randomUUID()}-v1`)),
      admin.from('jobs').insert(job(u.id, `book-${crypto.randomUUID()}-v1`)),
      admin.from('jobs').insert(job(u.id, `book-${crypto.randomUUID()}-v1`)),
    ]);
    const ok = results.filter((r) => !r.error).length;
    const dup = results.filter((r) => r.error?.code === '23505').length;
    expect(ok).toBe(1);
    expect(dup).toBe(2);
  });

  it('allows a new book job once the previous one has finished', async () => {
    const u = await makeUser();
    const k1 = `book-${crypto.randomUUID()}-v1`;
    expect((await admin.from('jobs').insert(job(u.id, k1))).error).toBeNull();
    await admin.from('jobs').update({ status: 'completed' }).eq('idempotency_key', k1);
    expect(
      (await admin.from('jobs').insert(job(u.id, `book-${crypto.randomUUID()}-v1`))).error,
    ).toBeNull();
  });

  it('does not limit non-book jobs', async () => {
    const u = await makeUser();
    const results = await Promise.all([
      admin.from('jobs').insert(job(u.id, `cover-${crypto.randomUUID()}-v1`, 'cover')),
      admin.from('jobs').insert(job(u.id, `cover-${crypto.randomUUID()}-v1`, 'cover')),
    ]);
    expect(results.every((r) => !r.error)).toBe(true);
  });

  it('enforces unique idempotency keys', async () => {
    const u = await makeUser();
    const key = `cover-${crypto.randomUUID()}-v1`;
    expect((await admin.from('jobs').insert(job(u.id, key, 'cover'))).error).toBeNull();
    expect((await admin.from('jobs').insert(job(u.id, key, 'cover'))).error?.code).toBe('23505');
  });

  it("rejects idempotency keys containing ':' (BullMQ restriction)", async () => {
    const u = await makeUser();
    const r = await admin
      .from('jobs')
      .insert(job(u.id, `cover:${crypto.randomUUID()}:v1`, 'cover'));
    expect(r.error?.code).toBe('23514');
  });
});
