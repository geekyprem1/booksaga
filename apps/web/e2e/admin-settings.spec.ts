import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);
test.setTimeout(60_000);

test('settings save and affect the app, while non-admins cannot change them', async ({
  page,
  browser,
}) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'] });
  const buyer = await createAccount({ plans: ['fe'] });
  const original = await service
    .from('app_settings')
    .select('key, value')
    .in('key', ['app', 'maintenance', 'upgrade_urls']);
  expect(original.error).toBeNull();
  expect(original.data).toHaveLength(3);
  const context = await browser.newContext();
  try {
    await login(page, admin);
    await page.goto('/admin/settings');
    const app = page.locator('form').filter({ has: page.getByLabel('App name') });
    await app.getByLabel('App name').fill('Test Book Studio');
    await app.getByLabel('Support email').fill('help@example.test');
    const action = page.waitForRequest(
      (r) => r.method() === 'POST' && Boolean(r.headers()['next-action']),
    );
    await app.getByRole('button', { name: 'Save app details' }).click();
    const actionId = (await action).headers()['next-action'];
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Test Book Studio home' })).toBeVisible();
    const upgrades = page.locator('form').filter({ has: page.getByLabel('OTO1 sales page') });
    await upgrades.getByLabel('OTO1 sales page').fill('https://example.test/oto1');
    await upgrades.getByRole('button', { name: 'Save upgrade links' }).click();
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
    const buyerPage = await context.newPage();
    await login(buyerPage, buyer);
    const redirect = await buyerPage.request.get('/upgrade/oto1', { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe('https://example.test/oto1');
    const forbidden = await buyerPage.request.post('/admin/settings', {
      headers: {
        'next-action': actionId!,
        'content-type': 'text/plain;charset=UTF-8',
        origin: process.env.APP_URL ?? 'http://localhost:3000',
      },
      data: JSON.stringify([
        { section: 'app', value: { name: 'Unauthorized', support_email: '', support_url: '' } },
      ]),
    });
    expect(forbidden.ok()).toBe(false);
    const settings = await service.from('app_settings').select('value').eq('key', 'app').single();
    expect((settings.data?.value as { name: string }).name).toBe('Test Book Studio');
    const maintenance = page
      .locator('form')
      .filter({ has: page.getByLabel('Enable maintenance mode') });
    await maintenance.getByLabel('Enable maintenance mode').check();
    await maintenance.getByLabel('Notice').fill('Scheduled test notice');
    await maintenance.getByRole('button', { name: 'Save maintenance' }).click();
    await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
    await buyerPage.goto('/dashboard');
    await expect(buyerPage.getByText('Scheduled test notice')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('Scheduled test notice')).toHaveCount(0);
  } finally {
    for (const row of original.data ?? []) {
      const restored = await service
        .from('app_settings')
        .update({ value: row.value })
        .eq('key', row.key);
      expect(restored.error).toBeNull();
    }
    await context.close();
  }
});
