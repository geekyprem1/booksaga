/** Child-process fixture: runs the production dispatcher against an isolated, mock-only queue. */
import { Worker } from 'bullmq';
import { createAi, type AiClient } from '@booksaga/ai';
import { createAdminClient, createQueues, redisConnectionOptions } from '@booksaga/core';
import { getServerEnv } from '@booksaga/shared';
import { handleJob, type Runtime } from '../index';

const [prefix, mode] = process.argv.slice(2);
if (!prefix?.startsWith('fencing-test-') || !['old', 'new'].includes(mode!)) {
  throw new Error('This fixture requires an isolated fencing-test queue and old/new mode.');
}
const env = getServerEnv();
if (env.AI_MODE !== 'mock') throw new Error('This fixture only supports mock AI.');
const db = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const connection = redisConnectionOptions(env.REDIS_URL);
const queues = createQueues(connection, { prefix });
const mock = createAi({ mode: 'mock', model: 'mock' });
let release: () => void;
const released = new Promise<void>((resolve) => {
  release = resolve;
});
const ai: AiClient = new Proxy(mock, {
  get(target, property, receiver) {
    if (property !== 'json') return Reflect.get(target, property, receiver);
    return async (...args: unknown[]) => {
      if (mode === 'old') {
        await worker.pause(true);
        process.send?.({ event: 'held' });
        await released;
      }
      const result = await Reflect.apply(target.json, target, args);
      return { ...result, data: { ...result.data, title: `${mode} worker result` } };
    };
  },
});
const runtime: Runtime = { env, db, ai, aiFast: ai, queues, workers: [] };
const worker = new Worker(
  'text',
  async (job, token) => {
    try {
      await handleJob(runtime, job, token);
      process.send?.({ event: 'done' });
    } catch (error) {
      process.send?.({
        event: 'rejected',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  { connection, prefix, stalledInterval: 100, lockDuration: 5000, skipLockRenewal: mode === 'old' },
);
worker.on('error', () => undefined); // The displaced BullMQ callback can no longer settle its lost lock.
process.on('message', (message) => {
  if (message === 'release') release();
});
await worker.waitUntilReady();
process.send?.({ event: 'ready' });
