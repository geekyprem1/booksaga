import type { ReactNode } from 'react';
import { can, type CapabilityCheck } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { LockedCard } from './locked-card';

/**
 * Server-side feature gate (T6.1). The same capability is checked again with `assertCan` inside
 * every OTO server action, so hiding the UI is convenience — never the security boundary.
 */
export async function Gate({
  check,
  feature,
  planCode,
  description,
  children,
}: {
  check: CapabilityCheck;
  feature: string;
  planCode: string;
  description?: string;
  children: ReactNode;
}) {
  const { account } = await getAccount();
  if (can(account.entitlements, check)) return <>{children}</>;
  return <LockedCard feature={feature} planCode={planCode} description={description} />;
}
