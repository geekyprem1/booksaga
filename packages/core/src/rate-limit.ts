import { createHash } from 'node:crypto';
import { AppError } from '@booksaga/shared';
import type { Queues } from './queue';

const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

/** One atomic counter/expiry per identity. Never store email addresses or IPs in Redis keys. */
export async function checkRateLimit(
  queues: Queues,
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const key = `booksaga:rate:${scope}:${createHash('sha256').update(identity).digest('hex')}`;
  let timer: NodeJS.Timeout | undefined;
  try {
    const operation = async () => {
      const client = await queues.system.getBackend().client;
      client.defineCommand('booksagaRateLimit', { numberOfKeys: 1, lua: SCRIPT });
      return (await client.runCommand('booksagaRateLimit', [key, windowMs])) as [number, number];
    };
    const [count, ttl] = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Rate limiter unavailable')), 2000);
      }),
    ]);
    if (count > limit)
      throw new AppError('RATE_LIMITED', 'Too many requests. Please try again shortly.', {
        retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
      });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'QUEUE_UNAVAILABLE',
      'The service is temporarily unavailable. Please try again shortly.',
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
