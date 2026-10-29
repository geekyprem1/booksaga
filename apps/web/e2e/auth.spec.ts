import { expect, test } from '@playwright/test';
import { attemptLogin, cleanupAccounts, createAccount, formError, login, service } from './helpers';

test.afterAll(cleanupAccounts);

test.describe('authentication', () => {
  test('health check is public and the DB is reachable', async ({ request }) => {
    const res = await request.get('/api/healthz');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', db: true });
  });

  test('signed-out visitors are sent to the login page and return after signing in', async ({
    page,
  }) => {
    const user = await createAccount({ plans: ['fe'] });
    await page.goto('/my-series');
    await expect(page).toHaveURL(/\/login\?next=%2Fmy-series/);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/my-series$/);
    await expect(page.getByRole('heading', { name: 'My Series' })).toBeVisible();
  });

  test('wrong password shows a generic error', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    await attemptLogin(page, { email: user.email, password: 'definitely-wrong' });
    await expect(formError(page)).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a malicious next parameter cannot redirect off-site', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    await login(page, user, '//evil.example.com');
    await expect(page).toHaveURL(`${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`);
  });

  test('sign out ends the session', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    await login(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('plan-aware app shell', () => {
  test('an FE member sees their credits and locked OTO modules', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'], name: 'Fiona Member' });
    await login(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByText('Credits left')).toBeVisible();
    await expect(page.getByText('300', { exact: true }).first()).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: /Series Templates/ })).toContainText('(locked)');
    await expect(nav.getByRole('link', { name: /Audiobook Series/ })).toContainText('(locked)');
    await expect(nav.getByRole('link', { name: /Create Series/ })).not.toContainText('(locked)');
    await expect(nav.getByRole('link', { name: /Admin/ })).toHaveCount(0);

    // A locked module shows the upgrade state instead of the feature.
    await nav.getByRole('link', { name: /Series Templates/ }).click();
    await expect(page.getByText('is not included in your plan')).toBeVisible();
  });

  test('buying the OTO unlocks the module', async ({ page }) => {
    const user = await createAccount({ plans: ['fe', 'oto2'] });
    await login(page, user);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: /Series Templates/ })).not.toContainText('(locked)');
    await nav.getByRole('link', { name: /Series Templates/ }).click();
    await expect(page.getByRole('heading', { name: 'Series Templates' })).toBeVisible();
  });

  test('non-admins get a 404 on the admin area', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    await login(page, user);
    await page.goto('/admin');
    await expect(page.getByText('This page could not be found')).toBeVisible();
  });

  test('a suspended account is signed out and blocked', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    await login(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);

    await service.from('profiles').update({ status: 'suspended' }).eq('id', user.id);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?reason=suspended/);
    await expect(page.getByText('Your account is suspended')).toBeVisible();

    // And they cannot log back in.
    await attemptLogin(page, user);
    await expect(formError(page)).toContainText('suspended');
    await expect(page).toHaveURL(/\/login/);
  });
});
