import 'server-only';
import { createAdminClient, type DbClient } from '@booksaga/core';
import { getServerEnv } from '@booksaga/shared';
import { assertWritable } from '@/lib/auth/view-as';

let client: DbClient | undefined;

/**
 * Service-role client: bypasses RLS. Server-only (this module cannot be imported from a client
 * component). Always authorise the caller (requireUser / requireAdmin) before using it.
 */
export function getAdminDb(): DbClient {
  if (!client) {
    const env = getServerEnv();
    client = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      fetch: async (input, init) => {
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        const url = new URL(input instanceof Request ? input.url : String(input));
        const signsReadOnlyUrl =
          method.toUpperCase() === 'POST' && url.pathname.startsWith('/storage/v1/object/sign/');
        if (!['GET', 'HEAD'].includes(method.toUpperCase()) && !signsReadOnlyUrl)
          await assertWritable();
        return fetch(input, init);
      },
    });
  }
  return client;
}
