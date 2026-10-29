import 'server-only';
import { cookies } from 'next/headers';
import { AppError, getServerEnv } from '@booksaga/shared';
import { parseViewAs, VIEW_AS_COOKIE } from './view-as-token';

export async function getViewAsState(allowExpired = false) {
  return parseViewAs(
    (await cookies()).get(VIEW_AS_COOKIE)?.value,
    getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    allowExpired,
  );
}

export async function assertWritable(): Promise<void> {
  if (await getViewAsState(true)) {
    throw new AppError('FORBIDDEN', 'View as user is read-only. Return to admin to make changes.');
  }
}
