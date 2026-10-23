import 'server-only';
import { cache } from 'react';
import { loadAccount, type Account } from '@booksaga/core';
import { requireUser, type SessionUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

/**
 * Signed-in user + their plans, entitlements and spendable credits. Cached per request, so layouts
 * and pages can both call it. Uses the service role because agency clients need to read the
 * owner's pools; the user id always comes from the verified session.
 */
export const getAccount = cache(async (): Promise<{ user: SessionUser; account: Account }> => {
  const user = await requireUser();
  const account = await loadAccount(getAdminDb(), {
    id: user.id,
    parentAgencyId: user.parentAgencyId,
    resellerOwnerId: user.resellerOwnerId,
  });
  return { user, account };
});

/** The balance shown in the credits pill: agency clients spend from their allotment. */
export function primaryBalance(account: Account): number {
  return account.isAgencyClient ? account.balances.agency : account.balances.main;
}
