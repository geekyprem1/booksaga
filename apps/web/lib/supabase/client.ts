'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@booksaga/db-types';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser Supabase client (RLS applies). Used for Realtime subscriptions on the user's own rows.
 * Reads of privileged data still go through Server Actions.
 */
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}
