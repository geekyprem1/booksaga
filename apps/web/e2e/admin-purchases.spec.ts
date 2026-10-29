import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);

test('purchase filters show the correct records and non-admins cannot access them', async ({
  page,
  browser,
}) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'] });
  const buyer = await createAccount({ plans: ['fe'] });
  const purchases = await service.from('purchases').insert([
    {
      user_id: buyer.id,
      platform: 'warriorplus',
      status: 'refunded',
      product_id: 'test-refund',
      txn_id: `refund-${buyer.id}`,
      amount: 17,
    },
    {
      user_id: buyer.id,
      platform: 'jvzoo',
      status: 'completed',
      product_id: 'test-sale',
      txn_id: `sale-${buyer.id}`,
      amount: 27,
    },
  ]);
  expect(purchases.error).toBeNull();
  const buyerContext = await browser.newContext();
  try {
    await login(page, admin);
    await page.goto('/admin/purchases');
    await page.getByLabel('Source').selectOption('warriorplus');
    await page.getByLabel('Status').selectOption('refunded');
    await page.getByRole('button', { name: 'Filter' }).click();
    const table = page.getByRole('table', { name: 'Purchase records' });
    await expect(table).toContainText('test-refund');
    await expect(table).not.toContainText('test-sale');
    const row = table.getByRole('row').filter({ hasText: 'test-refund' });
    await expect(row).toContainText(buyer.email);
    await expect(row.getByRole('link', { name: buyer.email })).toHaveAttribute(
      'href',
      `/admin/users/${buyer.id}`,
    );
    const buyerPage = await buyerContext.newPage();
    await login(buyerPage, buyer);
    const response = await buyerPage.goto('/admin/purchases');
    expect(response?.ok() && buyerPage.url().includes('/admin/purchases')).toBeFalsy();
    await expect(buyerPage.getByRole('table', { name: 'Purchase records' })).toHaveCount(0);
  } finally {
    await buyerContext.close();
  }
});
