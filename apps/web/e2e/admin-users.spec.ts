import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);

test.describe('admin: users', () => {
  test('create a buyer, copy-ready credentials work, credits and plans are applied', async ({
    page,
    browser,
  }) => {
    const admin = await createAccount({ role: 'admin', plans: ['fe'] });
    await login(page, admin);
    await page.goto('/admin/users');

    const email = `e2e-buyer-${Date.now()}@booksaga.test`;
    await page.getByRole('button', { name: 'Create user' }).click();
    const form = page.getByRole('dialog', { name: 'Create user' });
    await form.getByLabel('Name').fill('Bea Buyer');
    await form.getByLabel('Email').fill(email);
    // FE is pre-selected; add Unlimited (OTO1, $47).
    await expect(
      form.locator('label', { hasText: 'BookSaga Basic' }).getByRole('checkbox'),
    ).toBeChecked();
    await form.locator('label', { hasText: 'OTO1 · $47' }).getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Create user' }).click();

    const creds = page.getByRole('dialog', { name: 'User created' });
    await expect(creds).toBeVisible();
    await expect(creds.getByText(email)).toBeVisible();
    const password = (await creds.locator('dd').last().innerText()).trim();
    expect(password.length).toBeGreaterThanOrEqual(14);
    await expect(creds.getByRole('button', { name: 'Copy login details' })).toBeVisible();
    await creds.getByRole('button', { name: 'Close', exact: true }).first().click();

    // Track for cleanup.
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();
    expect(profile).toBeTruthy();

    // The new buyer can sign in with the generated password and sees 3,300 credits (300 + 3,000).
    const ctx = await browser.newContext({
      baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    });
    const buyer = await ctx.newPage();
    await login(buyer, { email, password });
    await expect(buyer).toHaveURL(/\/dashboard$/);
    await expect(buyer.getByText('3,300', { exact: true }).first()).toBeVisible();
    await ctx.close();

    await service.auth.admin.deleteUser(profile!.id);
  });

  test('users list supports search and shows plans and credits', async ({ page }) => {
    const admin = await createAccount({ role: 'admin', plans: ['fe'] });
    const target = await createAccount({ plans: ['fe', 'oto3_lite'], name: 'Searchable Sam' });
    await login(page, admin);
    await page.goto('/admin/users');
    await page.getByLabel('Search users').fill(target.email.slice(0, 20));
    await page.keyboard.press('Enter');
    const row = page.getByRole('row', { name: /Searchable Sam/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('OTO3 LITE');
    await expect(row).toContainText('300');
  });

  test('adjust credits requires a reason and updates the balance and audit log', async ({
    page,
  }) => {
    const admin = await createAccount({ role: 'admin', plans: ['fe'] });
    const target = await createAccount({ plans: ['fe'] });
    await login(page, admin);
    await page.goto(`/admin/users/${target.id}`);

    await page.getByLabel('Amount (±)').fill('50');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(/reason is required|Please give a reason/i)).toBeVisible();

    await page.getByLabel('Reason (required)').fill('E2E support bonus');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('New balance: 350')).toBeVisible();

    await page.goto('/admin/audit?action=credits.');
    await expect(page.getByText('credits.adjust').first()).toBeVisible();
  });

  test('revoking a plan takes back its credits; the admin cannot suspend themselves', async ({
    page,
  }) => {
    const admin = await createAccount({ role: 'admin', plans: ['fe'] });
    const target = await createAccount({ plans: ['fe', 'oto1_lite'] });
    await login(page, admin);

    await page.goto(`/admin/users/${target.id}`);
    page.once('dialog', (d) => d.accept());
    const item = page.getByRole('listitem').filter({ hasText: 'Unlimited Lite' });
    await item.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText(/Plan revoked\. 1000 credits removed/)).toBeVisible();

    const { data } = await service
      .from('credit_balances')
      .select('balance')
      .eq('user_id', target.id)
      .eq('pool', 'main')
      .single();
    expect(data?.balance).toBe(300);

    await page.goto(`/admin/users/${admin.id}`);
    await expect(page.getByRole('button', { name: 'Suspend' })).toBeDisabled();
  });

  test('suspending a user from the admin panel blocks them immediately', async ({
    page,
    browser,
  }) => {
    const admin = await createAccount({ role: 'admin', plans: ['fe'] });
    const target = await createAccount({ plans: ['fe'] });

    const ctx = await browser.newContext({
      baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    });
    const victim = await ctx.newPage();
    await login(victim, target);
    await expect(victim).toHaveURL(/\/dashboard$/);

    await login(page, admin);
    await page.goto(`/admin/users/${target.id}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Suspend' }).click();
    await expect(page.getByText('Account suspended.')).toBeVisible();

    await victim.goto('/dashboard');
    await expect(victim).toHaveURL(/\/login\?reason=suspended/);
    await ctx.close();
  });
});
