/**
 * Validate a post-login redirect target. Only same-origin absolute paths are allowed, which blocks
 * open redirects such as `//evil.com`, `/\evil.com` or `https://evil.com`.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  // Never bounce back into the auth pages.
  if (/^\/(login|auth)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
