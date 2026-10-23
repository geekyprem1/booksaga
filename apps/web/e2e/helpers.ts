import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

// Playwright runs from apps/web; the shared local env file lives at the repo root.
const rootEnv = resolve(process.cwd(), '../../.env.local');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface Account {
  id: string;
  email: string;
  password: string;
}

const created: string[] = [];

/** Create a confirmed account straight through the service role, with optional plans. */
export async function createAccount(
  opts: { role?: 'user' | 'admin'; plans?: string[]; name?: string } = {},
): Promise<Account> {
  const email = `e2e-${randomUUID()}@booksaga.test`;
  const password = `Pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: opts.name ?? 'E2E User' },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.push(data.user.id);

  if (opts.role === 'admin') {
    await service.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
  }
  for (const plan of opts.plans ?? []) {
    const { data: up, error: upErr } = await service
      .from('user_plans')
      .insert({ user_id: data.user.id, plan_code: plan, source: 'manual' })
      .select('id')
      .single();
    if (upErr || !up) throw new Error(`plan insert failed: ${upErr?.message}`);
    const { error: rpcErr } = await service.rpc('grant_plan_credits', { p_user_plan: up.id });
    if (rpcErr) throw new Error(`grant failed: ${rpcErr.message}`);
  }
  return { id: data.user.id, email, password };
}

export async function cleanupAccounts(): Promise<void> {
  const ids = created.splice(0);
  await Promise.all(ids.map((id) => service.auth.admin.deleteUser(id)));
}

/** Fill and submit the login form without waiting for the outcome (use for negative tests). */
export async function attemptLogin(
  page: Page,
  who: { email: string; password: string },
  next?: string,
) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Sign in and wait until the app has navigated away from /login. */
export async function login(page: Page, who: { email: string; password: string }, next?: string) {
  await attemptLogin(page, who, next);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** The inline form error (Next.js also renders its own role=alert route announcer). */
export const formError = (page: Page) => page.locator('form p[role="alert"]');
