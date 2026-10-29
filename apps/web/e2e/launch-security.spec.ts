import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service, formError } from './helpers';

test.afterAll(cleanupAccounts);
test.setTimeout(60000);

test('all policy pages are public and the refund policy shows the supplied contact and window', async ({
  page,
}) => {
  for (const [slug, title] of Object.entries({
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    refund: 'Refund Policy',
    'ai-disclosure': 'AI Content Disclosure',
  })) {
    await page.goto(`/legal/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('article')).not.toBeEmpty();
    await expect(page.locator('article script')).toHaveCount(0);
  }
  await page.goto('/legal/refund');
  await expect(page.locator('article')).toContainText('30 calendar days');
  await expect(page.locator('article a[href="mailto:softwarevh@gmail.com"]').first()).toBeVisible();
});

test('production CSP changes nonce per response and blocks an untrusted inline script', async ({
  page,
}) => {
  await page.route('**/login', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '</body>',
      '<script id="untrusted-test">document.documentElement.dataset.untrustedScript = "ran"</script></body>',
    );
    await route.fulfill({ response, body });
  });
  const first = await page.goto('/login');
  const csp = first!.headers()['content-security-policy']!;
  expect(csp).toContain("'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("'unsafe-eval'");
  await expect(page.locator('#untrusted-test')).toHaveCount(1);
  const ran = await page.evaluate(() => document.documentElement.dataset.untrustedScript);
  expect(ran).toBeUndefined();
  const second = await page.goto('/login');
  expect(second!.headers()['content-security-policy']).not.toBe(csp);
});

test('repeated invalid logins hit the Redis limit even when the next password is correct', async ({
  page,
}) => {
  const account = await createAccount({ plans: ['fe'] });
  await page.goto('/login');
  for (let i = 0; i < 10; i++) {
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill('incorrect-password');
    const response = page.waitForResponse(
      (res) => res.request().method() === 'POST' && !!res.request().headers()['next-action'],
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    await response;
    await expect(formError(page)).toHaveText('Invalid email or password.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  }
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(formError(page)).toContainText('temporarily limited');
  await expect(page).toHaveURL(/\/login/);
});

test('overview reports seeded AI usage and links to account and job controls', async ({ page }) => {
  const account = await createAccount({ role: 'admin', plans: ['fe'] });
  const provider = `overview-${account.id}`;
  const usage = await service
    .from('ai_usage_log')
    .insert({
      user_id: account.id,
      provider,
      model: 'mock',
      purpose: 'metadata',
      input_tokens: 100,
      output_tokens: 20,
      cost_usd: 0.012,
    });
  expect(usage.error).toBeNull();
  await login(page, account);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin overview' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Accounts' }).getByRole('link', { name: /Total users/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Generation' }).getByRole('link', { name: /Queue depth/ }),
  ).not.toContainText('n/a');
  const providerRow = page.getByRole('row').filter({ hasText: provider });
  await expect(providerRow).toContainText('$0.012');
});
