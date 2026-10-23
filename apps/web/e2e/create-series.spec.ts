import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login } from './helpers';

/**
 * M2 exit check, in the browser: idea -> Generate Part 1 -> live progress -> book + bible in the DB.
 *
 * Needs the worker and Redis (`pnpm worker:dev` + `docker compose -f docker/docker-compose.dev.yml
 * up -d redis`). The test skips itself with a clear message when the worker is not running, so the
 * M1 suite stays runnable on its own.
 */
async function workerIsUp(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:3001/healthz', {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test.afterAll(cleanupAccounts);

test.describe('create series', () => {
  test('generates Part 1 in mock mode and shows the roadmap', async ({ page }) => {
    test.skip(
      !(await workerIsUp()),
      'Worker is not running: start it with `pnpm worker:dev` (needs Redis).',
    );

    const user = await createAccount({ plans: ['fe'] });
    await login(page, user);
    await page.goto('/create-series');

    await page
      .getByLabel(/Series idea/)
      .fill(
        'A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her niece inherits a ledger that proves half the city bought its reputation.',
      );
    await page.getByLabel(/Series title/).fill(`E2E Ledger ${Date.now()}`);
    await page.locator('label:has(input[value="short"])').click();

    await page.getByRole('button', { name: /Generate Part 1/ }).click();

    // Live progress dialog.
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByText('Series foundation saved')).toBeVisible({ timeout: 180_000 });

    await page.getByRole('link', { name: 'View series' }).click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/);

    // Part 1 written (with chapters), Part 2 unlocked on the roadmap.
    const part1 = page.locator('[aria-label="Part 1"]');
    await expect(part1).toContainText('generated');
    await expect(part1).toContainText('9 chapters');
    await expect(page.locator('[aria-label="Part 2"]')).toContainText('ready');

    // Credits were charged exactly once (FE starts with 300, a short book costs 10).
    await expect(page.getByText('290', { exact: true }).first()).toBeVisible();
  });
});
