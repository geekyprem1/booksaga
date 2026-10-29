import { createHmac, timingSafeEqual } from 'node:crypto';

export const VIEW_AS_COOKIE = 'booksaga-view-as';
export const VIEW_AS_TTL_SECONDS = 30 * 60;
export interface ViewAsState {
  adminId: string;
  userId: string;
  expiresAt: number;
}

export function signViewAs(state: ViewAsState, secret: string): string {
  const data = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}

export function parseViewAs(
  value: string | undefined,
  secret: string,
  allowExpired = false,
): ViewAsState | null {
  if (!value || value.length > 1000) return null;
  const [data, signature, extra] = value.split('.');
  if (!data || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(data).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const state = JSON.parse(Buffer.from(data, 'base64url').toString()) as ViewAsState;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuid.test(state.adminId) &&
      uuid.test(state.userId) &&
      Number.isFinite(state.expiresAt) &&
      (allowExpired || state.expiresAt > Date.now())
      ? state
      : null;
  } catch {
    return null;
  }
}
