/** Isolated mock worker used by scripts/load-test.ts; shares the production dispatcher. */
import { setTimeout } from 'node:timers/promises';
import { Worker } from 'bullmq';
import { createAi, type AiClient } from '@booksaga/ai';
import { createAdminClient, createQueues, redisConnectionOptions } from '@booksaga/core';
import { getServerEnv } from '@booksaga/shared';
import { handleJob, type Runtime } from '../index';

const [prefix, latencyArg, concurrencyArg] = process.argv.slice(2);
const env = getServerEnv();
if (!prefix?.startsWith('load-test-') || env.AI_MODE !== 'mock')
  throw new Error('Isolated mock queue required');
const connection = redisConnectionOptions(env.REDIS_URL);
const db = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const queues = createQueues(connection, { prefix });
const mock = createAi({ mode: 'mock', model: 'mock', db });
const ai: AiClient = new Proxy(mock, {
  get(target, property, receiver) {
    const method = Reflect.get(target, property, receiver);
    if (typeof method !== 'function') return method;
    return async (...args: unknown[]) => {
      await setTimeout(Number(latencyArg));
      return Reflect.apply(method, target, args);
    };
  },
});
const runtime: Runtime = { env, db, queues, ai, aiFast: ai, workers: [] };
const worker = new Worker('text', (job, token) => handleJob(runtime, job, token), {
  connection,
  prefix,
  concurrency: Number(concurrencyArg),
});
worker.on('error', (error) => console.error(error.message));
worker.on('failed', (_job, error) => console.error(error.message));
await worker.waitUntilReady();
process.send?.('ready');
