import type { AiClient } from '@booksaga/ai';
import type { JobRunner } from './jobs';

/** Discard an in-flight provider response after lock loss and prevent further paid calls. */
export function fenceAi(ai: AiClient, runner: JobRunner): AiClient {
  return new Proxy(ai, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        await runner.assertQueueLock();
        const result: unknown = await Reflect.apply(value, target, args);
        await runner.assertQueueLock();
        return result;
      };
    },
  });
}
