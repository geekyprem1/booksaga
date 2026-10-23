import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@booksaga/db-types';

export type DbClient = SupabaseClient<Database>;
export type { Database };

/**
 * Service-role client. Bypasses RLS: only ever create it on the server / worker, never ship the
 * key to the browser.
 */
export function createAdminClient(url: string, serviceRoleKey: string): DbClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
