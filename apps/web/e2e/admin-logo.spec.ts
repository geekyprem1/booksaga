import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);
test('admin uploads a logo that appears on the public login screen', async ({ page, browser }) => {
  const admin = await createAccount({ role: 'admin', plans: ['fe'] });
  const original = await service.from('app_settings').select('value').eq('key', 'app').single();
  expect(original.error).toBeNull();
  const visitor = await browser.newContext();
  let path: string | undefined;
  try {
    await login(page, admin);
    await page.goto('/admin/settings');
    await page.getByLabel('Logo file').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: await sharp({ create: { width: 8, height: 8, channels: 4, background: '#6633cc' } })
        .png()
        .toBuffer(),
    });
    await page.getByRole('button', { name: 'Upload logo' }).click();
    await expect(page.getByText('Logo saved.')).toBeVisible();
    const saved = await service.from('app_settings').select('value').eq('key', 'app').single();
    const url = (saved.data?.value as { logo_url: string }).logo_url;
    expect(url).toContain('/branding/logos/');
    path = `logos/${url.split('/').pop()}`;
    const publicPage = await visitor.newPage();
    await publicPage.goto('/login');
    const image = publicPage.locator(`img[src="${url}"]`).first();
    await expect(image).toBeAttached();
    const response = await publicPage.request.get(url);
    expect(response.ok()).toBeTruthy();
  } finally {
    const restored = await service
      .from('app_settings')
      .update({ value: original.data!.value })
      .eq('key', 'app');
    expect(restored.error).toBeNull();
    if (path) await service.storage.from('branding').remove([path]);
    await visitor.close();
  }
});
