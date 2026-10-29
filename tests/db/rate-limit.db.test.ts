import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import {
  checkRateLimit,
  closeQueues,
  createQueues,
  enqueueJob,
  redisConnectionOptions,
} from '@booksaga/core';
import { balanceOf, cleanupUsers, db, grantPlan, makeUser } from './helpers';

const queues = createQueues(redisConnectionOptions(process.env.REDIS_URL!));
afterAll(async () => {
  await closeQueues(queues);
  await cleanupUsers();
});

it('atomically limits parallel requests and allows requests after expiry', async () => {
  const id = randomUUID();
  const results = await Promise.allSettled(
    Array.from({ length: 30 }, () => checkRateLimit(queues, 'test', id, 10, 1000)),
  );
  expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(10);
  for (const result of results)
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'RATE_LIMITED' });
  await new Promise((resolve) => setTimeout(resolve, 1050));
  await expect(checkRateLimit(queues, 'test', id, 10, 1000)).resolves.toBeUndefined();
});

it('rejects throttled generation before creating a job or reserving credits', async () => {
  const user = await makeUser();
  await grantPlan(user.id, 'fe');
  await Promise.all(
    Array.from({ length: 30 }, () => checkRateLimit(queues, 'jobs', user.id, 30, 60000)),
  );
  await expect(
    enqueueJob(db, queues, {
      userId: user.id,
      type: 'enhance',
      refId: null,
      action: 'enhance',
      amount: 1,
      source: { ownerId: user.id, pool: 'main' },
    }),
  ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  expect((await db.from('jobs').select('id').eq('user_id', user.id)).data).toHaveLength(0);
  expect(await balanceOf(user.id, 'main')).toBe(300);
});
