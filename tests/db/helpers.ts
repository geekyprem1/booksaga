import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, type DbClient } from '@booksaga/core';
import type { PlanCode } from '@booksaga/shared';
import { JobRunner, type JobRow } from '../../apps/worker/src/lib/jobs';

// Load .env.local (written by `pnpm env:local`) when running outside the dev server.
const envFile = resolve(import.meta.dirname, '../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Start local Supabase (pnpm db:start) and run pnpm env:local first.`,
    );
  }
  return v;
}

const url = need('NEXT_PUBLIC_SUPABASE_URL');
const anonKey = need('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY');

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Service-role client (bypasses RLS). */
export const admin: SupabaseClient = createClient(url, serviceKey, noSession);

/** Same, typed with the generated Database types (for the @booksaga/core services). */
export const db: DbClient = createAdminClient(url, serviceKey);

export function makeRunner(job: JobRow, ownsLock?: () => Promise<boolean>): JobRunner {
  return new JobRunner(db, job, { url, key: serviceKey, ownsLock });
}

export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, noSession);
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Client signed in as this user (RLS applies). */
  client: SupabaseClient;
}

const created: string[] = [];

export async function makeUser(
  opts: {
    name?: string;
    role?: 'user' | 'admin';
    parentAgencyId?: string;
    resellerOwnerId?: string;
  } = {},
): Promise<TestUser> {
  const email = `test-${randomUUID()}@booksaga.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: opts.name ?? 'Test User' },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.push(data.user.id);

  const patch: Record<string, unknown> = {};
  if (opts.role) patch.role = opts.role;
  if (opts.parentAgencyId) patch.parent_agency_id = opts.parentAgencyId;
  if (opts.resellerOwnerId) patch.reseller_owner_id = opts.resellerOwnerId;
  if (Object.keys(patch).length > 0) {
    const { error: e } = await admin.from('profiles').update(patch).eq('id', data.user.id);
    if (e) throw new Error(`profile patch failed: ${e.message}`);
  }

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  return { id: data.user.id, email, password, client };
}

export async function cleanupUsers(): Promise<void> {
  const ids = created.splice(0);
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)));
}

/** Insert a user_plans row (as the service role) and grant its one-time credits. */
export async function grantPlan(userId: string, plan: PlanCode): Promise<string> {
  const { data, error } = await admin
    .from('user_plans')
    .insert({ user_id: userId, plan_code: plan, source: 'manual' })
    .select('id')
    .single();
  if (error || !data) throw new Error(`grantPlan insert failed: ${error?.message}`);
  const { error: rpcError } = await admin.rpc('grant_plan_credits', { p_user_plan: data.id });
  if (rpcError) throw new Error(`grant_plan_credits failed: ${rpcError.message}`);
  return data.id as string;
}

export async function balanceOf(
  userId: string,
  pool: 'main' | 'audio' | 'agency',
): Promise<number> {
  const { data, error } = await admin
    .from('credit_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('pool', pool)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.balance as number | undefined) ?? 0;
}

export function reserve(
  userId: string,
  pool: 'main' | 'audio' | 'agency',
  amount: number,
  actingUser: string | null = null,
) {
  return admin.rpc('reserve_credits', {
    p_user: userId,
    p_pool: pool,
    p_amount: amount,
    p_job: null,
    p_reason: 'test',
    p_acting_user: actingUser,
  });
}
