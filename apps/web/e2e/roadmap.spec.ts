import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login } from './helpers';

/**
 * M3 exit check (roadmap half): Part 1 -> Part 2 -> Part 3 unlocks.
 *
 * Needs the worker + Redis, like create-series.spec.ts; it skips itself otherwise.
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

test.describe('series roadmap', () => {
  test('generates Part 2 after Part 1 and unlocks Part 3', async ({ page }) => {
    test.skip(!(await workerIsUp()), 'Worker is not running: start it with `pnpm worker:dev`.');

    const user = await createAccount({ plans: ['fe'] });
    await login(page, user);

    // Part 1 through the Create Series form.
    await page.goto('/create-series');
    await page
      .getByLabel(/Series idea/)
      .fill(
        'A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her niece inherits a ledger that proves half the city bought its reputation.',
      );
    await page.getByLabel(/Series title/).fill(`Roadmap ${Date.now()}`);
    await page.locator('label:has(input[value="short"])').click();
    await page.getByRole('button', { name: /Generate Part 1/ }).click();

    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByText('Series foundation saved')).toBeVisible({ timeout: 180_000 });
    await page.getByRole('link', { name: 'View series' }).click();
    await expect(page).toHaveURL(/\/series\/[0-9a-f-]{36}$/);

    // Part 2 is unlocked, Part 3 is not.
    const part2 = page.locator('[aria-label="Part 2"]');
    await expect(part2).toContainText('ready');
    await expect(page.locator('[aria-label="Part 3"]')).toContainText('locked');

    // Generate Part 2.
    await part2.getByRole('button', { name: /Generate Part 2/ }).click();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeHidden({ timeout: 240_000 });

    await expect(page.locator('[aria-label="Part 2"]')).toContainText('generated', {
      timeout: 60_000,
    });
    await expect(page.locator('[aria-label="Part 3"]')).toContainText('ready');

    // The new part opens in the editor with all chapters in the list.
    await page.locator('[aria-label="Part 2"]').getByRole('link', { name: /Open Part 2/ }).click();
    await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(9);

    // Autosave: type into the chapter, wait for the 3s debounce, reload, text survives.
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Autosave check.');
    await page.waitForTimeout(4500);
    await page.reload();
    await expect(page.locator('.ProseMirror')).toContainText('Autosave check.', { timeout: 30_000 });

    // Credits: 300 - 10 (Part 1) - 10 (Part 2) = 280.
    await expect(page.getByText('280', { exact: true }).first()).toBeVisible();
  });
});
