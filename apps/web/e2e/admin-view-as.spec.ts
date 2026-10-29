import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);
test.setTimeout(60000);

test('admin preview uses the target account, blocks UI and direct mutations, and audits entry/exit', async ({
  page,
  browser,
}, testInfo) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'], name: 'Preview Admin' });
  const buyer = await createAccount({ plans: ['fe'], name: 'Preview Buyer' });
  await login(page, admin);
  await page.goto(`/admin/users/${buyer.id}`);
  await page.getByRole('button', { name: 'View as user (read-only)' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const banner = page.getByRole('region', { name: 'Read-only user preview' });
  await expect(banner).toContainText(buyer.email);
  await page.goto('/profile');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(buyer.email);
  await page.getByLabel('Name', { exact: true }).fill('Forbidden change');
  const request = page.waitForRequest(
    (req) => req.method() === 'POST' && !!req.headers()['next-action'],
  );
  await page.getByRole('button', { name: 'Save name' }).click();
  const mutation = await request;
  await expect(
    page.getByText('View as user is read-only. Return to admin to make changes.'),
  ).toBeVisible();
  const direct = await page.request.post('/profile', {
    headers: {
      'next-action': mutation.headers()['next-action']!,
      'content-type': 'text/plain;charset=UTF-8',
    },
    data: JSON.stringify([{ name: 'Forged mutation' }]),
  });
  expect(await direct.text()).toContain('FORBIDDEN');
  expect(
    (await service.from('profiles').select('name').eq('id', buyer.id).single()).data?.name,
  ).toBe('Preview Buyer');
  expect(
    (await service.from('profiles').select('name').eq('id', admin.id).single()).data?.name,
  ).toBe('Preview Admin');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(banner.getByRole('button', { name: 'Back to admin' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('preview-mobile.png'), fullPage: true });
  await banner.getByRole('button', { name: 'Back to admin' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${buyer.id}$`));
  const audit = await service
    .from('audit_log')
    .select('action')
    .eq('actor_id', admin.id)
    .eq('target', `user:${buyer.id}`);
  expect(audit.error).toBeNull();
  expect(audit.data?.map((row) => row.action)).toEqual(
    expect.arrayContaining(['user.view_as_start', 'user.view_as_end']),
  );
  const other = await browser.newContext();
  try {
    const buyerPage = await other.newPage();
    await login(buyerPage, buyer);
    await other.addCookies([
      {
        name: 'booksaga-view-as',
        value: 'forged.invalid',
        url: process.env.APP_URL ?? 'http://localhost:3000',
      },
    ]);
    await buyerPage.goto('/profile');
    await expect(buyerPage.getByLabel('Email', { exact: true })).toHaveValue(buyer.email);
    await expect(buyerPage.getByRole('region', { name: 'Read-only user preview' })).toHaveCount(0);
    await buyerPage.goto(`/admin/users/${admin.id}`);
    await expect(buyerPage.getByText('This page could not be found')).toBeVisible();
  } finally {
    await other.close();
  }
});
