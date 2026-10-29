import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);
test('admin can save legal text and AI settings, and public legal content is sanitized', async ({
  page,
  browser,
}) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'] });
  const keys = ['legal_terms', 'ai_models'];
  const original = await service.from('app_settings').select('key, value').in('key', keys);
  expect(original.error).toBeNull();
  const visitor = await browser.newContext();
  try {
    await login(page, admin);
    await page.goto('/admin/settings');
    const legal = page
      .locator('form')
      .filter({ has: page.getByLabel('Terms of Service', { exact: true }) });
    await legal
      .getByLabel('Terms of Service', { exact: true })
      .fill('## Test policy\n\n**Readable text**\n\n<script>alert(1)</script>');
    await legal.getByRole('button', { name: 'Save Terms of Service' }).click();
    await expect(page.getByText('Terms of Service saved.')).toBeVisible();
    const publicPage = await visitor.newPage();
    await publicPage.goto('/legal/terms');
    await expect(publicPage.getByRole('heading', { name: 'Test policy' })).toBeVisible();
    await expect(publicPage.locator('article strong')).toHaveText('Readable text');
    await expect(publicPage.locator('article script')).toHaveCount(0);

    const ai = page.locator('form').filter({ has: page.getByLabel('Main model override') });
    await ai.getByLabel('Main model override').fill('example/model');
    await ai
      .getByLabel('Pricing table (JSON)')
      .fill(
        JSON.stringify({ 'example/model': { inputPerM: 1, outputPerM: 2, cachedInputPerM: 0.5 } }),
      );
    await ai.getByRole('button', { name: 'Save AI settings' }).click();
    await expect(page.getByText('Saved. Restart the worker to apply.')).toBeVisible();
    const saved = await service
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_models')
      .single();
    expect(saved.data?.value).toMatchObject({
      model: 'example/model',
      pricing: { 'example/model': { inputPerM: 1 } },
    });
  } finally {
    for (const key of keys) {
      const existing = original.data?.find((row) => row.key === key);
      const result = existing
        ? await service.from('app_settings').upsert(existing)
        : await service.from('app_settings').delete().eq('key', key);
      expect(result.error).toBeNull();
    }
    await visitor.close();
  }
});
