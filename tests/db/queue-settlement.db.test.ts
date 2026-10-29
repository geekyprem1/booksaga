import { afterAll, expect, it, vi } from 'vitest';
import {
  enqueueJob,
  createQueues,
  closeQueues,
  redisConnectionOptions,
  type Queues,
} from '@booksaga/core';
import { balanceOf, cleanupUsers, db, grantPlan, makeUser } from './helpers';

afterAll(cleanupUsers);
const liveQueues = createQueues(redisConnectionOptions(process.env.REDIS_URL!));
afterAll(() => closeQueues(liveQueues));

it('links a reservation inside the debit transaction and rejects a second reservation for the same job', async () => {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  const job = await db
    .from('jobs')
    .insert({ user_id: user.id, type: 'enhance', idempotency_key: `atomic-${user.id}` })
    .select('id')
    .single();
  expect(job.error).toBeNull();
  const args = { p_user: user.id, p_pool: 'main', p_amount: 1, p_job: job.data!.id };
  const first = await db.rpc('reserve_credits', args);
  expect(first.error).toBeNull();
  expect(
    (await db.from('jobs').select('ledger_id').eq('id', job.data!.id).single()).data?.ledger_id,
  ).toBe(first.data);
  expect((await db.rpc('reserve_credits', args)).error).not.toBeNull();
  expect(await balanceOf(user.id, 'main')).toBe(299);
  await db.rpc('refund_credits', { p_ledger: first.data! });
  expect(await balanceOf(user.id, 'main')).toBe(300);
});

it('links a reservation before enqueue and refunds it if the queue rejects the job', async () => {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  const add = vi.fn(async (_type, payload: { jobId: string; ledgerId: number }) => {
    const row = await db.from('jobs').select('ledger_id').eq('id', payload.jobId).single();
    expect(row.data?.ledger_id).toBe(payload.ledgerId);
    throw new Error('test queue unavailable');
  });
  const queues = { system: liveQueues.system, text: { add } } as unknown as Queues;
  await expect(
    enqueueJob(db, queues, {
      type: 'enhance',
      userId: user.id,
      refId: null,
      source: { ownerId: user.id, pool: 'main' },
      action: 'enhance',
      amount: 1,
    }),
  ).rejects.toMatchObject({ code: 'QUEUE_UNAVAILABLE' });
  expect(await balanceOf(user.id, 'main')).toBe(300);
  const job = await db.from('jobs').select('status, ledger_id').eq('user_id', user.id).single();
  expect(job.data?.status).toBe('cancelled');
  const ledger = await db
    .from('credit_ledger')
    .select('status')
    .eq('id', job.data!.ledger_id!)
    .single();
  expect(ledger.data?.status).toBe('refunded');
});

it('uses one stable admin retry for the same failed attempt even after completion', async () => {
  const user = await makeUser();
  const add = vi.fn(async () => ({}));
  const queues = { system: liveQueues.system, text: { add } } as unknown as Queues;
  const input = {
    type: 'enhance' as const,
    userId: user.id,
    refId: null,
    amount: 0,
    skipCredits: true,
    retryOfJobId: crypto.randomUUID(),
  };
  const first = await enqueueJob(db, queues, input);
  await db.from('jobs').update({ status: 'completed' }).eq('id', first.jobId);
  const second = await enqueueJob(db, queues, input);
  expect(second.jobId).toBe(first.jobId);
  expect(second.deduplicated).toBe(true);
  expect(add).toHaveBeenCalledTimes(1);
});
