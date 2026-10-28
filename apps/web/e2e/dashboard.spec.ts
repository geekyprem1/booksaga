import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

/**
 * M3 phase 4: dashboard stats, ⌘K palette, notifications and the profile page.
 * Seeded through the service role, so no worker is needed.
 */
test.afterAll(cleanupAccounts);

test.describe('dashboard, search, notifications, profile', () => {
  test('dashboard, palette, notifications and profile work together', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'], name: 'Dash Tester' });
    const title = `Dashboard ${Date.now()}`;

    const { data: series } = await service
      .from('series')
      .insert({
        user_id: user.id,
        title,
        idea: 'A harbour city where debts are inherited like weather, and the ledger proves everything.',
        genre: 'Fantasy',
        pen_name: 'Dash Writer',
        planned_books: 3,
        status: 'active',
      })
      .select('id')
      .single();

    await service.from('books').insert([
      {
        series_id: series!.id,
        part_number: 1,
        title: 'Part One',
        premise: 'x',
        status: 'generated',
        length_preset: 'short',
        word_count: 12000,
        continuity_report: { issues: [] },
      },
      {
        series_id: series!.id,
        part_number: 2,
        title: 'Part Two',
        premise: 'x',
        status: 'locked',
        length_preset: 'short',
        word_count: 0,
      },
    ]);

    await service.from('notifications').insert({
      user_id: user.id,
      type: 'book_ready',
      title: 'Part 1 is ready',
      body: 'Open it to edit, cover and export.',
      link: `/series/${series!.id}`,
    });

    await login(page, user);

    // Dashboard stats.
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expect(page.getByText('12,000 words written', { exact: true })).toBeVisible();
    // The new stat row and the recent-series progress.
    await expect(page.getByText('Total Series', { exact: true })).toBeVisible();
    await expect(page.getByText('Part 1 completed')).toBeVisible();

    // ⌘K palette finds the series and navigates to it.
    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder('Search series, books, chapters…');
    await expect(input).toBeVisible();
    await input.fill(title.slice(0, 12));
    await page.locator('[cmdk-item]').first().click();
    await expect(page).toHaveURL(new RegExp(`/series/${series!.id}$`));

    // Notification bell badge + list.
    await expect(page.getByRole('button', { name: /Notifications \(1 unread\)/ })).toBeVisible();
    await page.goto('/notifications');
    await expect(page.getByText('Part 1 is ready')).toBeVisible();
    await page.getByRole('button', { name: /Mark all read/ }).click();
    await expect(page.getByText('You are all caught up.')).toBeVisible({ timeout: 15_000 });

    // Profile: rename and add a pen name.
    await page.goto('/profile');
    await page.getByLabel('Name', { exact: true }).fill('Dash Tester II');
    await page.getByRole('button', { name: /Save name/ }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 15_000 });

    const pen = `Pen ${Date.now()}`;
    await page.getByLabel('New pen name').fill(pen);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(pen, { exact: true })).toBeVisible({ timeout: 15_000 });

    const { data: profile } = await service
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();
    expect(profile?.name).toBe('Dash Tester II');
  });
});
