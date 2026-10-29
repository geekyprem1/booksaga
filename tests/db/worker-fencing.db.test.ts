import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import {
  createAdminClient,
  createQueues,
  closeQueues,
  redisConnectionOptions,
} from '@booksaga/core';
import { verifyWorkerFencing } from '../../apps/worker/src/lib/jobs';
import { balanceOf, cleanupUsers, db, grantPlan, makeRunner, makeUser, reserve } from './helpers';

afterAll(cleanupUsers);

async function fixture() {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  const reservation = await reserve(user.id, 'main', 1);
  expect(reservation.error).toBeNull();
  const series = await db
    .from('series')
    .insert({
      user_id: user.id,
      title: 'Fencing',
      idea: 'Test',
      genre: 'Fantasy',
      pen_name: 'Author',
    })
    .select('id')
    .single();
  expect(series.error).toBeNull();
  const book = await db
    .from('books')
    .insert({
      series_id: series.data!.id,
      part_number: 1,
      title: 'Original',
      status: 'generated',
    })
    .select('id')
    .single();
  expect(book.error).toBeNull();
  const job = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'metadata',
      ref_id: book.data!.id,
      status: 'queued',
      idempotency_key: `fencing-${user.id}`,
      ledger_id: reservation.data!,
      credits_reserved: 1,
    })
    .select('*')
    .single();
  expect(job.error).toBeNull();
  return { user, bookId: book.data!.id, job: job.data!, ledgerId: reservation.data! };
}

it('rejects stale content, heartbeat, result and credit requests at the database boundary', async () => {
  await verifyWorkerFencing(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { bookId, job, user, ledgerId } = await fixture();
  const old = makeRunner(job);
  expect(await old.start()).toBe(true);
  old.stopHeartbeat();
  const current = await db.from('jobs').select('*').eq('id', job.id).single();
  const replacement = makeRunner(current.data!);
  expect(await replacement.start()).toBe(true);
  try {
    const rawStale = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        headers: { 'x-worker-job': job.id, 'x-worker-token': old.executionToken },
      },
    );
    for (const request of [
      rawStale.from('books').update({ title: 'Corrupt' }).eq('id', bookId),
      rawStale
        .from('jobs')
        .update({ heartbeat_at: new Date().toISOString(), meta: { result: 'Corrupt' } })
        .eq('id', job.id),
      rawStale.rpc('refund_credits', { p_ledger: ledgerId }),
      rawStale.rpc('finish_worker_job', {
        p_job: job.id,
        p_token: old.executionToken,
        p_status: 'failed',
        p_refund: true,
      }),
    ]) {
      const result = await request;
      expect(result.error?.message).toContain('JOB_LEASE_LOST');
    }
    expect((await db.from('books').select('title').eq('id', bookId).single()).data?.title).toBe(
      'Original',
    );
    expect(
      (await db.from('credit_ledger').select('status').eq('id', ledgerId).single()).data?.status,
    ).toBe('reserved');
    await replacement.db.from('books').update({ title: 'Replacement' }).eq('id', bookId);
    await replacement.complete({ title: 'Only owner completes' });
    expect(await balanceOf(user.id, 'main')).toBe(299);
    expect((await db.from('notifications').select('id').eq('user_id', user.id)).data).toHaveLength(
      1,
    );
  } finally {
    replacement.stopHeartbeat();
  }
});

it('permits only one claimant from concurrent snapshots and never starts after Redis ownership loss', async () => {
  const { job } = await fixture();
  const one = makeRunner(job);
  const two = makeRunner(job);
  try {
    const started = await Promise.all([one.start(), two.start()]);
    expect(started.filter(Boolean)).toHaveLength(1);
    const current = await db.from('jobs').select('*').eq('id', job.id).single();
    await expect(makeRunner(current.data!, async () => false).start()).rejects.toThrow(
      'JOB_LEASE_LOST',
    );
  } finally {
    one.stopHeartbeat();
    two.stopHeartbeat();
  }
});

function child(mode: string, prefix: string) {
  const process = fork(resolve('apps/worker/src/testing/fencing-worker.ts'), [prefix, mode], {
    execArgv: ['--import', 'tsx'],
    env: { ...globalThis.process.env, AI_MODE: 'mock' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const events: Array<{ event: string; message?: string }> = [];
  let output = '';
  process.stdout?.on('data', (data) => {
    output += String(data);
  });
  process.stderr?.on('data', (data) => {
    output += String(data);
  });
  process.on('message', (message) => events.push(message as { event: string }));
  return {
    process,
    async wait(event: string) {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const match = events.find((entry) => entry.event === event);
        if (match) return match;
        if (process.exitCode !== null) throw new Error(`Child exited: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${mode}:${event}: ${output}`);
    },
  };
}

async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  await exited;
}

it('fences a paused old process after BullMQ lock loss and replacement by a second worker', async () => {
  const { job, bookId, user, ledgerId } = await fixture();
  const prefix = `fencing-test-${user.id}`;
  const queues = createQueues(redisConnectionOptions(process.env.REDIS_URL!), { prefix });
  let old: ReturnType<typeof child> | undefined;
  let fresh: ReturnType<typeof child> | undefined;
  try {
    old = child('old', prefix);
    await old.wait('ready');
    await queues.text.add(
      'metadata',
      { jobId: job.id, userId: user.id, refId: bookId },
      { jobId: job.idempotency_key, attempts: 1 },
    );
    await old.wait('held');
    const redis = await queues.text.getBackend().client;
    await redis.del(queues.text.toKey(`${job.idempotency_key}:lock`));
    fresh = child('new', prefix);
    await fresh.wait('ready');
    await fresh.wait('done');
    old.process.send('release');
    expect((await old.wait('rejected')).message).toContain('JOB_LEASE_LOST');
    const book = await db.from('books').select('title').eq('id', bookId).single();
    expect(book.data?.title).toBe('new worker result');
    const finished = await db.from('jobs').select('status, error').eq('id', job.id).single();
    expect(finished.data).toMatchObject({ status: 'completed', error: null });
    expect(
      (await db.from('credit_ledger').select('status').eq('id', ledgerId).single()).data?.status,
    ).toBe('committed');
    expect(await balanceOf(user.id, 'main')).toBe(299);
    expect((await db.from('notifications').select('id').eq('user_id', user.id)).data).toHaveLength(
      1,
    );
  } finally {
    await Promise.all([stop(old?.process), stop(fresh?.process)]);
    await queues.text.obliterate({ force: true });
    await closeQueues(queues);
  }
}, 60000);
