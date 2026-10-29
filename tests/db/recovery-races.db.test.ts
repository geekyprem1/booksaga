import { afterAll, expect, it, vi } from 'vitest';
import type { Queues } from '@booksaga/core';
import { handleStuck, hasLiveQueueJob } from '../../apps/worker/src/cron/reaper';
import { balanceOf, cleanupUsers, db, grantPlan, makeRunner, makeUser, reserve } from './helpers';

afterAll(cleanupUsers);

it('recognizes live original and recovered queue jobs, but not finished ones', async () => {
  const user = await makeUser();
  const row = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `live-${user.id}`,
      status: 'active',
    })
    .select('*')
    .single();
  expect(row.error).toBeNull();
  const getJob = vi.fn(async (id: string) =>
    id.endsWith('-r1') ? { getState: async () => 'active' } : { getState: async () => 'failed' },
  );
  const queues = { text: { getJob } } as unknown as Queues;
  expect(await hasLiveQueueJob(queues, row.data!)).toBe(true);
  getJob.mockImplementation(async () => ({ getState: async () => 'completed' }));
  expect(await hasLiveQueueJob(queues, row.data!)).toBe(false);
});

it('does not overwrite an immediately started recovered job', async () => {
  const user = await makeUser();
  const heartbeat = new Date(Date.now() - 600000).toISOString();
  const inserted = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `recovery-${user.id}`,
      status: 'active',
      heartbeat_at: heartbeat,
      started_at: heartbeat,
    })
    .select('*')
    .single();
  expect(inserted.error).toBeNull();
  const add = vi.fn(async () => {
    const current = await db.from('jobs').select('*').eq('id', inserted.data!.id).single();
    const runner = makeRunner(current.data!);
    expect(await runner.start()).toBe(true);
    runner.stopHeartbeat();
  });
  const result = await handleStuck(
    db,
    { text: { add } } as unknown as Queues,
    inserted.data!,
    'test recovery',
  );
  expect(result).toBe('requeued');
  const after = await db.from('jobs').select('status, meta').eq('id', inserted.data!.id).single();
  expect(after.data?.status).toBe('active');
  expect(after.data?.meta).toMatchObject({ reaped: 1 });
});

it('does not recover a stale snapshot after its heartbeat changed', async () => {
  const user = await makeUser();
  const old = new Date(Date.now() - 600000).toISOString();
  const inserted = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `heartbeat-${user.id}`,
      status: 'active',
      heartbeat_at: old,
    })
    .select('*')
    .single();
  expect(inserted.error).toBeNull();
  await db
    .from('jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', inserted.data!.id);
  const add = vi.fn();
  expect(
    await handleStuck(db, { text: { add } } as unknown as Queues, inserted.data!, 'test recovery'),
  ).toBe('skipped');
  expect(add).not.toHaveBeenCalled();
});

it('allows a previously started book to resume and handle its cancellation', async () => {
  const user = await makeUser();
  const inserted = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'book',
      idempotency_key: `resume-${user.id}`,
      status: 'queued',
      cancel_requested: true,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  expect(inserted.error).toBeNull();
  const runner = makeRunner(inserted.data!);
  expect(await runner.start()).toBe(true);
  expect(await runner.isCancelRequested()).toBe(true);
  runner.stopHeartbeat();
});

it('refunds and fails an abandoned job at the retry limit, but ignores a refreshed heartbeat', async () => {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  const reservation = await reserve(user.id, 'main', 10);
  expect(reservation.error).toBeNull();
  const heartbeat = new Date(Date.now() - 600000).toISOString();
  const inserted = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `limit-${user.id}`,
      status: 'active',
      heartbeat_at: heartbeat,
      ledger_id: reservation.data!,
      credits_reserved: 10,
      meta: { reaped: 2 },
    })
    .select('*')
    .single();
  expect(inserted.error).toBeNull();
  const add = vi.fn();
  const queues = { text: { add } } as unknown as Queues;
  await db
    .from('jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', inserted.data!.id);
  expect(await handleStuck(db, queues, inserted.data!, 'stale')).toBe('skipped');
  expect(await balanceOf(user.id, 'main')).toBe(290);
  await db.from('jobs').update({ heartbeat_at: heartbeat }).eq('id', inserted.data!.id);
  expect(await handleStuck(db, queues, inserted.data!, 'stale')).toBe('failed');
  expect(await balanceOf(user.id, 'main')).toBe(300);
  const job = await db.from('jobs').select('status').eq('id', inserted.data!.id).single();
  expect(job.data?.status).toBe('failed');
  expect(
    (await db.from('credit_ledger').select('status').eq('id', reservation.data!).single()).data
      ?.status,
  ).toBe('refunded');
  expect(add).not.toHaveBeenCalled();
});
