import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

const storagePaths: string[] = [];
test.afterAll(async () => {
  if (storagePaths.length) await service.storage.from('covers').remove(storagePaths);
  await cleanupAccounts();
});

test('cover collection supports filters, previews, variations and image library on desktop and mobile', async ({
  page,
}, testInfo) => {
  const user = await createAccount({ plans: ['fe'] });
  const { data: series, error: seriesError } = await service
    .from('series')
    .insert({
      user_id: user.id,
      title: 'The Midnight Archives',
      idea: 'An archivist discovers stories that change the city after dark.',
      genre: 'Fantasy',
      pen_name: 'Morgan Hayes',
      planned_books: 4,
      status: 'active',
      cover_style: {
        artPrompt: 'A moonlit castle with a consistent cinematic atmosphere.',
        palette: ['Midnight blue', 'Silver mist', 'Antique gold', 'Dusk violet'],
      },
    })
    .select('id')
    .single();
  expect(seriesError).toBeNull();
  const { data: books, error: booksError } = await service
    .from('books')
    .insert([
      {
        series_id: series!.id,
        part_number: 1,
        title: 'The Last Light',
        premise: 'An unusual discovery.',
        status: 'generated',
        length_preset: 'short',
      },
      {
        series_id: series!.id,
        part_number: 2,
        title: 'A City of Echoes',
        premise: 'The mystery deepens.',
        status: 'ready',
        length_preset: 'short',
      },
      {
        series_id: series!.id,
        part_number: 3,
        title: 'The Unwritten Hours',
        premise: 'The clock stops.',
        status: 'locked',
        length_preset: 'short',
      },
      {
        series_id: series!.id,
        part_number: 4,
        title: 'Beyond the Final Page',
        premise: 'A final chapter.',
        status: 'locked',
        length_preset: 'short',
      },
    ])
    .select('id, part_number');
  expect(booksError).toBeNull();
  const first = books!.find((book) => book.part_number === 1)!;
  const coverPath = `${user.id}/${first.id}/studio-test.jpg`;
  const { createCanvas, loadImage } = createRequire(require.resolve('@booksaga/exporters'))(
    '@napi-rs/canvas',
  );
  const coverCanvas = createCanvas(400, 640);
  const context = coverCanvas.getContext('2d');
  context.drawImage(
    await loadImage(await readFile('public/hero/dashboard.webp')),
    -350,
    0,
    960,
    640,
  );
  context.fillStyle = '#050e2490';
  context.fillRect(0, 0, 400, 640);
  context.fillStyle = '#f0dec1';
  context.textAlign = 'center';
  context.font = '17px Georgia';
  context.fillText('THE MIDNIGHT ARCHIVES', 200, 52);
  context.font = '46px Georgia';
  context.fillText('THE LAST', 200, 140);
  context.fillText('LIGHT', 200, 192);
  context.font = '19px Georgia';
  context.fillText('MORGAN HAYES', 200, 592);
  const coverImage = coverCanvas.toBuffer('image/jpeg');
  const uploaded = await service.storage
    .from('covers')
    .upload(coverPath, coverImage, { contentType: 'image/jpeg' });
  expect(uploaded.error).toBeNull();
  storagePaths.push(coverPath);
  const { data: covers, error: coversError } = await service
    .from('covers')
    .insert([
      { book_id: first.id, type: 'ebook', final_path: coverPath, is_active: true },
      { book_id: first.id, type: 'ebook', final_path: coverPath, is_active: false },
    ])
    .select('id, is_active');
  expect(coversError).toBeNull();
  await page.setViewportSize({ width: 1920, height: 1200 });
  await login(page, user);
  await page.goto(`/series/${series!.id}/covers`);
  await expect(page.getByRole('heading', { name: 'Your book covers 4' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'With covers 1', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview cover for The Last Light' }).click();
  await expect(
    page.getByRole('dialog').getByRole('img', { name: 'Cover of The Last Light' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Use variation .* for The Last Light/ }).click();
  await expect
    .poll(
      async () =>
        (
          await service
            .from('covers')
            .select('is_active')
            .eq('id', covers!.find((cover) => !cover.is_active)!.id)
            .single()
        ).data?.is_active,
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Use my image for The Last Light' }).click();
  await expect(page.getByRole('dialog', { name: 'Use your own image' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Needs cover 3', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Write this part first' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Write this part first' }).first()).toBeDisabled();
  await page.getByLabel('Cover typography').selectOption('ai');
  await expect(page.getByLabel('Cover typography')).toHaveValue('ai');
  await page.getByRole('button', { name: 'All books 4', exact: true }).click();
  const coverRows = await page.getByRole('article').evaluateAll((rows) =>
    rows.map((row) => {
      const { x, y, width, height } = row.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  for (let index = 1; index < coverRows.length; index++) {
    expect(coverRows[index]!.y).toBe(coverRows[0]!.y);
    expect(coverRows[index]!.x).toBeGreaterThanOrEqual(
      coverRows[index - 1]!.x + coverRows[index - 1]!.width,
    );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);

  await page.goto(`/series/${series!.id}`);
  await expect(page.getByRole('link', { name: 'Open Part 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate Part 2/ })).toBeEnabled();
  await expect(page.locator('[aria-label="Part 3"]')).toContainText('Complete Part 2 to unlock.');
  const roadmapRows = await page.locator('[aria-label^="Part "]').evaluateAll((rows) =>
    rows.map((row) => {
      const { x, y, width, height } = row.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(roadmapRows).toHaveLength(4);
  for (let index = 1; index < roadmapRows.length; index++) {
    expect(roadmapRows[index]!.y).toBe(roadmapRows[0]!.y);
    expect(roadmapRows[index]!.width).toBeLessThan(500);
    expect(roadmapRows[index]!.x).toBeGreaterThanOrEqual(
      roadmapRows[index - 1]!.x + roadmapRows[index - 1]!.width,
    );
  }
  await page.screenshot({ path: testInfo.outputPath('roadmap-desktop.png'), fullPage: true });
  await page.goto(`/series/${series!.id}/covers`);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('heading', { name: 'Your book covers 4' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  const coverShelf = page.getByRole('region', { name: 'Covers in this series' });
  expect(await coverShelf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );
  await coverShelf.focus();
  await page.keyboard.press('End');
  await coverShelf.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await coverShelf.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.goto(`/series/${series!.id}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole('link', { name: 'Open Part 1', exact: true })).toBeVisible();
  const roadmapShelf = page.getByRole('region', { name: 'Books in this series' });
  expect(await roadmapShelf.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('roadmap-mobile.png'), fullPage: true });

  const secondSeries = await service
    .from('series')
    .insert({
      user_id: user.id,
      title: 'A New Collection',
      idea: 'A second linked adventure.',
      genre: 'Mystery',
      pen_name: 'Morgan Hayes',
      planned_books: 2,
      status: 'active',
    })
    .select('id')
    .single();
  expect(secondSeries.error).toBeNull();
  const secondBooks = await service.from('books').insert([
    {
      series_id: secondSeries.data!.id,
      part_number: 1,
      title: 'A New Beginning',
      premise: 'The next story starts.',
      status: 'ready',
      length_preset: 'short',
    },
    {
      series_id: secondSeries.data!.id,
      part_number: 2,
      title: 'A New Mystery',
      premise: 'The trail continues.',
      status: 'locked',
      length_preset: 'short',
    },
  ]);
  expect(secondBooks.error).toBeNull();
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.goto('/my-series');
  const collections = page.locator('article[aria-label^="Series:"]');
  await expect(collections).toHaveCount(2);
  const firstCollection = page.getByRole('article', {
    name: 'Series: The Midnight Archives',
    exact: true,
  });
  await expect(firstCollection.getByRole('article')).toHaveCount(4);
  await expect(
    firstCollection.getByRole('link', { name: 'Open Part 1', exact: true }),
  ).toBeVisible();
  await expect(firstCollection.getByRole('button', { name: /Generate Part 2/ })).toBeEnabled();
  await expect(
    firstCollection.getByRole('button', { name: 'Generate Part 3 (locked)', exact: true }),
  ).toBeDisabled();
  const collectionBoxes = await collections.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  expect(collectionBoxes[1]!.y).toBeGreaterThanOrEqual(
    collectionBoxes[0]!.y + collectionBoxes[0]!.height,
  );
  expect(collectionBoxes[1]!.x).toBe(collectionBoxes[0]!.x);
  await page.screenshot({ path: testInfo.outputPath('my-series-desktop.png'), fullPage: true });
  await page.getByLabel('Search series', { exact: true }).fill('Midnight');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(collections).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath('my-series-mobile.png'), fullPage: true });
  await page.goto('/my-series?q=no-matching-test-series');
  await expect(collections).toHaveCount(0);
});
