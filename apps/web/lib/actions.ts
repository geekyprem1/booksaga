import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isAppError, type AppErrorCode } from '@booksaga/shared';

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: { code: AppErrorCode; message: string } };

/**
 * Wrap a Server Action body: AppErrors and validation errors become typed results the UI can
 * map to toasts / upgrade CTAs. Next.js control-flow errors (redirect, notFound) pass through.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (isAppError(err)) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return {
        ok: false,
        error: { code: 'VALIDATION', message: first ? first.message : 'Invalid input.' },
      };
    }
    console.error('[action] unexpected error', err);
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
    };
  }
}
