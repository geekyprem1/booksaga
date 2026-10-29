import { afterAll, expect, it } from 'vitest';
import { cleanupUsers, db, grantPlan, makeRunner, makeUser, reserve } from './helpers';

afterAll(cleanupUsers);

it('does not start a queued job after cancellation is requested or after it finishes', async () => {
  const user = await makeUser();
  const inserted = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `start-test-${user.id}`,
      status: 'queued',
    })
    .select('*')
    .single();
  expect(inserted.error).toBeNull();
  const snapshot = inserted.data!;
  await db.from('jobs').update({ cancel_requested: true }).eq('id', snapshot.id);
  const runner = makeRunner(snapshot);
  expect(await runner.start()).toBe(false);
  const pending = await db.from('jobs').select('status').eq('id', snapshot.id).single();
  expect(pending.data?.status).toBe('queued');
  await db.from('jobs').update({ status: 'cancelled' }).eq('id', snapshot.id);
  expect(await makeRunner(snapshot).start()).toBe(false);
  const finished = await db.from('jobs').select('status').eq('id', snapshot.id).single();
  expect(finished.data?.status).toBe('cancelled');
});

it('does not claim a failed job was refunded when its reservation cannot be refunded', async () => {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  const reservation = await reserve(user.id, 'main', 1);
  expect(reservation.error).toBeNull();
  await db.rpc('commit_credits', { p_ledger: reservation.data! });
  const job = await db
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'enhance',
      idempotency_key: `fail-test-${user.id}`,
      status: 'active',
      ledger_id: reservation.data!,
    })
    .select('*')
    .single();
  expect(job.error).toBeNull();
  const runner = makeRunner(job.data!);
  expect(await runner.start()).toBe(true);
  await runner.fail('Test failure');
  const result = await db.from('jobs').select('status, error').eq('id', job.data!.id).single();
  expect(result.data?.status).toBe('failed');
  expect(result.data?.error).toContain('refund could not be confirmed');
  const notification = await db
    .from('notifications')
    .select('body')
    .eq('user_id', user.id)
    .eq('type', 'job_failed')
    .single();
  expect(notification.data?.body).toContain('refund could not be confirmed');
});
