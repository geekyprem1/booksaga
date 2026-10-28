/**
 * Client-side rate limiting for AI providers.
 *
 * `RateLimiter` spaces call starts evenly (60 000 / rpm ms apart) instead of allowing a burst, which
 * matches strict provider limits such as Replicate's "6 requests per minute with a burst of 1" on
 * low-credit accounts. Limits are per process: with several workers, divide the RPM between them.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  private nextSlot = 0;

  /** `rpm` of 0 (or less) disables limiting. */
  constructor(private readonly rpm: number) {}

  /** Resolves when the caller may start its request. Calls are served in order. */
  async wait(): Promise<void> {
    if (!(this.rpm > 0)) return;
    const interval = 60_000 / this.rpm;
    const now = Date.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + interval;
    if (start > now) await sleep(start - now);
  }
}

/**
 * Run a request and, on HTTP 429, wait for the provider's `retry_after` (seconds, from the JSON
 * body or the `Retry-After` header; 10s when absent) and try again, up to `maxRetries` times.
 * The final response is returned as-is so the caller keeps its normal error handling.
 */
export async function retryOn429(
  run: () => Promise<Response>,
  maxRetries = 3,
): Promise<Response> {
  let response = await run();
  for (let attempt = 0; attempt < maxRetries && response.status === 429; attempt++) {
    const waitSeconds = await retryAfterSeconds(response);
    await sleep(Math.min(waitSeconds, 60) * 1000 + 500);
    response = await run();
  }
  return response;
}

async function retryAfterSeconds(response: Response): Promise<number> {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header;
  try {
    const body = (await response.clone().json()) as { retry_after?: unknown };
    if (typeof body.retry_after === 'number' && body.retry_after > 0) return body.retry_after;
  } catch {
    // Not JSON: fall through to the default.
  }
  return 10;
}
