import 'server-only';
import { createQueues, redisConnectionOptions, type Queues } from '@booksaga/core';

/**
 * One BullMQ queue registry per server process. Cached on globalThis so Next.js dev HMR does not
 * leak Redis connections on every reload.
 */
const globalForQueues = globalThis as unknown as { __booksagaQueues?: Queues };

export function getQueues(): Queues {
  if (!globalForQueues.__booksagaQueues) {
    globalForQueues.__booksagaQueues = createQueues(
      redisConnectionOptions(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    );
  }
  return globalForQueues.__booksagaQueues;
}
