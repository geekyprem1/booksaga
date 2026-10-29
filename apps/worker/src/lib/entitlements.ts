import { loadAccount, type DbClient } from '@booksaga/core';
import { assertCan, type CapabilityCheck } from '@booksaga/shared';

/** Recheck current access before a queued job uses paid features. */
export async function assertWorkerAccess(db: DbClient, userId: string, check: CapabilityCheck) {
  const { data: profile, error } = await db
    .from('profiles')
    .select('parent_agency_id, reseller_owner_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !profile) throw new Error('Could not load the job owner profile.');
  const account = await loadAccount(db, {
    id: userId,
    parentAgencyId: profile.parent_agency_id,
    resellerOwnerId: profile.reseller_owner_id,
  });
  assertCan(account.entitlements, check);
}
