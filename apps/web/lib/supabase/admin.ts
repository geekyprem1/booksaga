import 'server-only';
import { createAdminClient, type DbClient } from '@booksaga/core';
import { getServerEnv } from '@booksaga/shared';

let client: DbClient | undefined;

/**
 * Service-role client: bypasses RLS. Server-only (this module cannot be imported from a client
 * component). Always authorise the caller (requireUser / requireAdmin) before using it.
 */
export function getAdminDb(): DbClient {
  if (!client) {
    const env = getServerEnv();
    client = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}
