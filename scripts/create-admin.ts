#!/usr/bin/env tsx
/**
 * Create (or promote) an admin account.
 *
 *   pnpm create-admin --email admin@local.test [--name "Admin"] [--password "..."] [--no-plans]
 *
 * By default the admin also receives every full plan (FE + OTO1-5) so all modules can be tested.
 * Without --password a strong one is generated and printed ONCE.
 */
import { parseArgs } from 'node:util';
import {
  createAdminClient,
  isValidEmail,
  normalizeEmail,
  provisionAccount,
  writeAudit,
} from '@booksaga/core';
import { getServerEnv, type PlanCode } from '@booksaga/shared';

const FULL_PLANS: PlanCode[] = ['fe', 'oto1', 'oto2', 'oto3', 'oto4', 'oto5'];

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string', default: 'Admin' },
      password: { type: 'string' },
      'no-plans': { type: 'boolean', default: false },
    },
  });

  if (!values.email || !isValidEmail(values.email)) {
    console.error(
      'Usage: pnpm create-admin --email you@example.com [--name "Name"] [--password "..."] [--no-plans]',
    );
    process.exit(1);
  }
  if (values.password !== undefined && values.password.length < 8) {
    console.error('The password must be at least 8 characters.');
    process.exit(1);
  }

  const env = getServerEnv();
  const db = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const email = normalizeEmail(values.email);

  const result = await provisionAccount(db, {
    email,
    name: values.name,
    plans: values['no-plans'] ? [] : FULL_PLANS,
    source: 'manual',
    credentialsPending: false,
  });

  const { error: roleError } = await db
    .from('profiles')
    .update({ role: 'admin', status: 'active' })
    .eq('id', result.userId);
  if (roleError) throw new Error(`Could not set the admin role: ${roleError.message}`);

  let password = result.password;
  if (values.password) {
    const { error } = await db.auth.admin.updateUserById(result.userId, {
      password: values.password,
    });
    if (error) throw new Error(`Could not set the password: ${error.message}`);
    password = values.password;
  } else if (!result.created) {
    // Existing account: keep the current password unless asked to change it.
    password = undefined;
  }

  await writeAudit(db, {
    actorId: result.userId,
    action: 'user.make_admin',
    target: `user:${result.userId}`,
    meta: { email },
  });

  console.log(
    result.created ? `Created admin ${email}` : `Promoted existing account ${email} to admin`,
  );
  console.log(`Login URL: ${env.APP_URL.replace(/\/$/, '')}/login`);
  console.log(`Email:     ${email}`);
  console.log(
    password
      ? `Password:  ${password}`
      : 'Password:  (unchanged — pass --password to set a new one)',
  );
  if (result.created || values.password) {
    console.log('\nStore this password now; it is not saved anywhere.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
