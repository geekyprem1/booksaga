import { expect, test } from '@playwright/test';
import { loadAccount } from '@booksaga/core';
import { assertCan } from '@booksaga/shared';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);
test.setTimeout(60_000);

test('admin changes apply to account entitlements and costs, and non-admins cannot access the pages', async ({
  page,
  browser,
}) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'] });
  const buyer = await createAccount({ plans: ['fe'] });
  const originalPlan = await service.from('plans').select('limits').eq('code', 'fe').single();
  const originalCost = await service
    .from('credit_costs')
    .select('credits')
    .eq('action', 'book_short')
    .single();
  const originalSettings = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'limits')
    .single();
  expect(originalPlan.error).toBeNull();
  expect(originalCost.error).toBeNull();
  expect(originalSettings.error).toBeNull();
  try {
    await login(page, admin);
    await page.goto('/admin/plans');
    const plan = page.locator('form').filter({ hasText: 'BookSaga Basic' });
    await plan.getByLabel('Active series (blank = unlimited)').fill('2');
    await plan.getByLabel('full', { exact: true }).check();
    await plan.getByLabel('Audiobooks', { exact: true }).check();
    await plan.getByLabel('Box sets', { exact: true }).check();
    await plan.getByLabel('Paperback wrap', { exact: true }).check();
    await plan.getByLabel('Franchise kit', { exact: true }).check();
    await plan.locator('select[name="templatesTier"]').selectOption('full');
    await plan.locator('select[name="dfyPacks"]').selectOption('lite');
    const actionRequest = page.waitForRequest(
      (request) => request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await plan.getByRole('button', { name: 'Save plan' }).click();
    const capturedAction = await actionRequest;
    const actionId = capturedAction.headers()['next-action'];
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const cost = page.locator('form').filter({ hasText: 'book short' });
    await cost.getByLabel('book short · main pool').fill('11');
    await cost.getByRole('button', { name: 'Save cost' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const cap = page.locator('form').filter({ hasText: 'Books per user per day' });
    await cap.getByLabel('Books per user per day').fill('7');
    await cap.getByRole('button', { name: 'Save limit' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');

    const account = await loadAccount(service as never, {
      id: buyer.id,
      parentAgencyId: null,
      resellerOwnerId: null,
    });
    expect(account.entitlements.maxSeries).toBe(2);
    expect(account.entitlements.dailyBookCap).toBe(7);
    expect(account.entitlements.lengthPresets).toContain('full');
    expect(account.entitlements.audiobook).toBe(true);
    expect(account.entitlements.boxSets).toBe(true);
    expect(account.entitlements.paperbackWrap).toBe(true);
    expect(account.entitlements.franchiseKit).toBe(true);
    expect(account.entitlements.templatesTier).toBe('full');
    expect(account.entitlements.dfyPacks).toBe('lite');
    expect(() =>
      assertCan(account.entitlements, { kind: 'generateBook', lengthPreset: 'full' }),
    ).not.toThrow();
    expect(() =>
      assertCan(account.entitlements, { kind: 'templates', tier: 'full' }),
    ).not.toThrow();
    expect(() => assertCan(account.entitlements, { kind: 'dfyPacks', tier: 'full' })).toThrow();
    const changedCost = await service
      .from('credit_costs')
      .select('credits')
      .eq('action', 'book_short')
      .single();
    expect(changedCost.data?.credits).toBe(11);
    await page.goto(`/admin/credits?user=${buyer.id}&status=grant`);
    await expect(page.getByRole('table', { name: 'Credit ledger entries' })).toContainText(
      buyer.id,
    );
    await expect(page.getByRole('table', { name: 'Credit ledger entries' })).toContainText('grant');

    const job = await service
      .from('jobs')
      .insert({
        user_id: buyer.id,
        type: 'book',
        status: 'completed',
        idempotency_key: `ledger-test-${buyer.id}`,
      })
      .select('id')
      .single();
    expect(job.error).toBeNull();
    const ledger = await service.from('credit_ledger').insert([
      {
        user_id: buyer.id,
        acting_user_id: admin.id,
        pool: 'agency',
        amount: -3,
        status: 'committed',
        job_id: job.data!.id,
        reason: 'Agency writing',
      },
      { user_id: buyer.id, pool: 'main', amount: 3, status: 'refunded', reason: 'Refund test' },
      { user_id: buyer.id, pool: 'main', amount: 2, status: 'adjust', reason: 'Adjustment test' },
      {
        user_id: buyer.id,
        pool: 'main',
        amount: -2,
        status: 'reserved',
        reason: 'Reservation test',
      },
    ]);
    expect(ledger.error).toBeNull();
    await page.goto(`/admin/credits?user=${buyer.id}&pool=agency&status=committed`);
    const table = page.getByRole('table', { name: 'Credit ledger entries' });
    await expect(table).toContainText('Agency writing');
    await expect(table).toContainText(`Acting user: ${admin.id}`);
    await expect(table.getByRole('link', { name: 'View job' })).toHaveAttribute(
      'href',
      `/admin/jobs/${job.data!.id}`,
    );
    for (const [status, reason] of [
      ['refunded', 'Refund test'],
      ['adjust', 'Adjustment test'],
      ['reserved', 'Reservation test'],
    ]) {
      await page.goto(`/admin/credits?user=${buyer.id}&pool=main&status=${status}`);
      await expect(table).toContainText(reason!);
      await expect(table).not.toContainText('Agency writing');
    }

    const context = await browser.newContext();
    const buyerPage = await context.newPage();
    await login(buyerPage, buyer);
    expect((await buyerPage.goto('/admin/plans'))?.status()).toBe(404);
    expect((await buyerPage.goto('/admin/credits'))?.status()).toBe(404);
    const forbidden = await buyerPage.request.post('/admin/plans', {
      headers: {
        'next-action': actionId!,
        'content-type': 'text/plain;charset=UTF-8',
        origin: process.env.APP_URL ?? 'http://localhost:3000',
      },
      data: JSON.stringify([{ code: 'fe', limits: { maxSeries: 999 } }]),
    });
    expect(forbidden.ok()).toBe(false);
    const afterForbidden = await service.from('plans').select('limits').eq('code', 'fe').single();
    expect((afterForbidden.data!.limits as { maxSeries: number }).maxSeries).toBe(2);
    await context.close();
  } finally {
    const restored = await Promise.all([
      service.from('plans').update({ limits: originalPlan.data!.limits }).eq('code', 'fe'),
      service
        .from('credit_costs')
        .update({ credits: originalCost.data!.credits })
        .eq('action', 'book_short'),
      service
        .from('app_settings')
        .update({ value: originalSettings.data!.value })
        .eq('key', 'limits'),
    ]);
    for (const item of restored) expect(item.error).toBeNull();
  }
});

test('a forged full-length generation request is rejected before creating a job', async ({
  page,
}) => {
  const buyer = await createAccount({ plans: ['fe'] });
  const { data: series, error } = await service
    .from('series')
    .insert({
      user_id: buyer.id,
      title: 'Permission test',
      idea: 'A test series.',
      genre: 'Fantasy',
      pen_name: 'Writer',
      planned_books: 3,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  const book = await service
    .from('books')
    .insert({
      series_id: series!.id,
      part_number: 1,
      title: 'Book',
      premise: 'Test',
      status: 'ready',
      length_preset: 'short',
    })
    .select('id')
    .single();
  expect(book.error).toBeNull();
  await login(page, buyer);
  await page.goto(`/series/${series!.id}`);
  const select = page.getByLabel('Length for part 1');
  await select.evaluate((element: HTMLSelectElement) => {
    const option = document.createElement('option');
    option.value = 'full';
    option.textContent = 'Full';
    element.append(option);
  });
  await select.selectOption('full');
  await page.getByRole('button', { name: /Generate Part 1/ }).click();
  await expect(page.getByText(/full book length is not included in your plan/i)).toBeVisible();
  const jobs = await service
    .from('jobs')
    .select('id')
    .eq('ref_id', book.data!.id)
    .eq('type', 'book');
  expect(jobs.data).toEqual([]);
});
