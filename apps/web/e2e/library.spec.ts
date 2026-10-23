import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

/**
 * M3 phase 3: My Series (duplicate / trash / restore), the Series Bible editor and its DOCX export.
 * Everything here is seeded through the service role, so it needs no worker.
 */
test.afterAll(cleanupAccounts);

async function seedSeries(userId: string, title: string) {
  const { data: series, error } = await service
    .from('series')
    .insert({
      user_id: userId,
      title,
      idea: 'A harbour city where debts are inherited like weather, and the ledger proves everything.',
      genre: 'Fantasy',
      pen_name: 'E2E Writer',
      planned_books: 5,
    })
    .select('id')
    .single();
  if (error || !series) throw new Error(`seed failed: ${error?.message}`);

  await service.from('series_bible').insert({
    series_id: series.id,
    version: 1,
    data: {
      characters: {
        'mira-vance': {
          name: 'Mira Vance',
          role: 'protagonist',
          appearance: 'Tall, weathered hands.',
          personality: 'Patient.',
          relationships: [],
          secrets: [],
          status: 'active',
          source: 'ai',
        },
      },
      locations: {},
      world: { setting: 'A harbour city.', rules: ['Debts pass to the next of kin.'], tone: 'Tense.' },
      timeline: [],
      threads: [],
      glossary: {},
      style: { pov: 'third', tense: 'past', voice: 'Dry.', banned: [] },
      conflicts: [],
    },
  });

  return series.id as string;
}

test.describe('my series & bible', () => {
  // The card actions ask for confirmation with window.confirm().
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());
  });

  test('duplicate, trash and restore a series', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    const title = `Harbour ${Date.now()}`;
    await seedSeries(user.id, title);

    await login(page, user);
    await page.goto('/my-series');
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    // Duplicate copies settings + bible, not the books.
    await page.getByRole('button', { name: /Duplicate/ }).first().click();
    await expect(page.getByRole('link', { name: `${title} (copy)` })).toBeVisible({
      timeout: 15_000,
    });

    // Delete the copy -> it moves to Trash -> restore it.
    await page
      .getByRole('link', { name: `${title} (copy)` })
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
      .getByRole('button', { name: /Delete/ })
      .click();
    await expect(page.getByRole('link', { name: `${title} (copy)` })).toBeHidden({
      timeout: 15_000,
    });

    await page.goto('/my-series?trash=1');
    await expect(page.getByRole('link', { name: `${title} (copy)` })).toBeVisible();
    await page.getByRole('button', { name: /Restore/ }).first().click();
    await expect(page.getByRole('button', { name: /Restore/ })).toHaveCount(0, { timeout: 15_000 });

    await page.goto('/my-series');
    await expect(page.getByRole('link', { name: `${title} (copy)` })).toBeVisible();
  });

  test('edit the bible, keep a version and export it', async ({ page, context }) => {
    const user = await createAccount({ plans: ['fe'] });
    const title = `Bible ${Date.now()}`;
    const seriesId = await seedSeries(user.id, title);

    await login(page, user);
    await page.goto(`/series/${seriesId}/bible`);

    const personality = page.locator('textarea').nth(1);
    await expect(personality).toBeVisible();
    await personality.fill('Patient, watchful, slow to forgive.');
    await page.getByRole('button', { name: /Save changes/ }).click();
    await expect(page.getByText(/Saved as v\d+/)).toBeVisible({ timeout: 20_000 });

    // A user save creates a version, and the entry is locked against AI overwrites.
    const { data: versions } = await service
      .from('bible_versions')
      .select('version, source')
      .eq('series_id', seriesId)
      .order('version', { ascending: false })
      .limit(1);
    expect(versions?.[0]?.source).toBe('user');

    const { data: bible } = await service
      .from('series_bible')
      .select('data')
      .eq('series_id', seriesId)
      .single();
    const character = (bible?.data as { characters: Record<string, { source?: string; personality?: string }> })
      .characters['mira-vance'];
    expect(character?.personality).toBe('Patient, watchful, slow to forgive.');
    expect(character?.source).toBe('user');

    // DOCX export.
    const response = await context.request.get(`/api/series/${seriesId}/bible/export`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('wordprocessingml');
    expect((await response.body()).byteLength).toBeGreaterThan(2000);
  });

  test('settings cannot drop planned parts below what is written', async ({ page }) => {
    const user = await createAccount({ plans: ['fe'] });
    const title = `Settings ${Date.now()}`;
    const seriesId = await seedSeries(user.id, title);

    await service.from('books').insert([
      {
        series_id: seriesId,
        part_number: 1,
        title: 'Part One',
        premise: 'x',
        status: 'generated',
        length_preset: 'short',
      },
      {
        series_id: seriesId,
        part_number: 2,
        title: 'Part Two',
        premise: 'x',
        status: 'generated',
        length_preset: 'short',
      },
    ]);

    await login(page, user);
    await page.goto(`/series/${seriesId}/settings`);

    await page.getByLabel('Planned parts').fill('1');
    await page.getByRole('button', { name: /Save settings/ }).click();
    await expect(page.getByText(/already written/)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Planned parts').fill('4');
    await page.getByRole('button', { name: /Save settings/ }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
