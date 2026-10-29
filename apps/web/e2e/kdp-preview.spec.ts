import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);

// A small valid two-page PDF exercises pdf.js rendering and cancellation without a worker job.
function previewPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 648] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 432 648] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
    ...['A harbour full of stories', 'The second chapter'].map((title) => {
      const stream = `BT /F1 20 Tf 50 540 Td (${title}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 8\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(document);
}

test('sample workspace supports preview controls and fits desktop and mobile', async ({
  page,
}, testInfo) => {
  const user = await createAccount({ plans: ['fe'] });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page, user);
  await page.goto('/kdp-preview');
  await expect(page.getByRole('heading', { name: 'KDP Preview', exact: true })).toBeVisible();
  await expect(page.getByText('Not checked', { exact: true })).toHaveCount(5);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('2 / 4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByText('110%', { exact: true })).toBeVisible();
  await page.getByLabel('Verify page numbers', { exact: true }).check();
  await expect(page.getByText('1 of 7 reviewed')).toBeVisible();
  await page.getByRole('button', { name: 'Open Previewer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cover Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Spine', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Spine', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Kindle eBook', exact: true }).click();
  await page.getByRole('button', { name: 'Front Cover', exact: true }).click();
  await page.getByRole('button', { name: 'Fit Width', exact: true }).click();
  const manuscript = await page.getByRole('region', { name: /Manuscript Preview/ }).boundingBox();
  const cover = await page
    .getByRole('region', { name: 'Cover Preview', exact: true })
    .boundingBox();
  expect(cover!.x).toBeGreaterThan(manuscript!.x + manuscript!.width);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('button', { name: 'Open Previewer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('selected book renders its manuscript and PDF across tabs, zoom and page changes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const user = await createAccount({ plans: ['fe'] });
  const { data: series, error: seriesError } = await service
    .from('series')
    .insert({
      user_id: user.id,
      title: 'Preview Test Series',
      idea: 'A mysterious harbour ledger.',
      genre: 'Fantasy',
      pen_name: 'Preview Author',
      planned_books: 1,
      status: 'active',
    })
    .select('id')
    .single();
  expect(seriesError).toBeNull();
  const { data: book, error: bookError } = await service
    .from('books')
    .insert({
      series_id: series!.id,
      part_number: 1,
      title: 'The Harbour Ledger',
      premise: 'A lost ledger.',
      status: 'generated',
      length_preset: 'short',
    })
    .select('id')
    .single();
  expect(bookError).toBeNull();
  // More than 50 newer books from another buyer must not crowd this book out of the selector.
  const otherUser = await createAccount({ plans: ['fe'] });
  const otherSeries = await service
    .from('series')
    .insert(
      [1, 2].map((number) => ({
        user_id: otherUser.id,
        title: `Other buyer series ${number}`,
        idea: 'Another story.',
        genre: 'Fantasy',
        pen_name: 'Other Author',
      })),
    )
    .select('id');
  expect(otherSeries.error).toBeNull();
  const foreignBooks = await service.from('books').insert(
    Array.from({ length: 51 }, (_, i) => ({
      series_id: otherSeries.data![Math.floor(i / 26)]!.id,
      part_number: (i % 26) + 1,
      title: `Other book ${i + 1}`,
      premise: 'Other story.',
      status: 'generated',
      length_preset: 'short',
    })),
  );
  expect(foreignBooks.error).toBeNull();
  const deletedSeries = await service
    .from('series')
    .insert({
      user_id: user.id,
      title: 'Deleted series',
      idea: 'A deleted story.',
      genre: 'Fantasy',
      pen_name: 'Preview Author',
      deleted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(deletedSeries.error).toBeNull();
  const deletedBook = await service.from('books').insert({
    series_id: deletedSeries.data!.id,
    part_number: 1,
    title: 'Deleted book',
    premise: 'Deleted.',
    status: 'generated',
    length_preset: 'short',
  });
  expect(deletedBook.error).toBeNull();
  const chapter = await service.from('chapters').insert({
    book_id: book!.id,
    number: 1,
    title: 'At the Harbour',
    content_text: 'The harbour held a thousand stories.',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The harbour held a thousand stories.' }],
        },
      ],
    },
  });
  expect(chapter.error).toBeNull();
  const exported = await service.from('exports').insert({
    user_id: user.id,
    book_id: book!.id,
    series_id: series!.id,
    status: 'ready',
    formats: ['pdf'],
    files: {
      pdf: `${user.id}/${book!.id}/old.pdf`,
      pdfPages: '1',
      wrap: `${user.id}/${book!.id}/wrap.pdf`,
      wrapPages: '1',
    },
    created_at: new Date(Date.now() - 4000).toISOString(),
  });
  expect(exported.error).toBeNull();
  const newerExports = await service.from('exports').insert([
    {
      user_id: user.id,
      book_id: book!.id,
      series_id: series!.id,
      status: 'ready',
      formats: ['pdf'],
      files: { pdf: `${user.id}/${book!.id}/preview.pdf`, pdfPages: '2' },
      created_at: new Date(Date.now() - 3000).toISOString(),
    },
    {
      user_id: user.id,
      book_id: book!.id,
      series_id: series!.id,
      status: 'ready',
      formats: ['reader'],
      files: { reader: `${user.id}/${book!.id}/reader.pdf` },
      created_at: new Date(Date.now() - 2000).toISOString(),
    },
    {
      user_id: user.id,
      book_id: book!.id,
      series_id: series!.id,
      status: 'expired',
      formats: ['pdf'],
      files: { pdf: `${user.id}/${book!.id}/expired.pdf`, pdfPages: '999' },
      created_at: new Date(Date.now() - 1000).toISOString(),
    },
  ]);
  expect(newerExports.error).toBeNull();
  await page.route('**/api/files/exports/**/preview.pdf?stream=1', (route) =>
    route.fulfill({
      contentType: 'application/pdf',
      body: previewPdf(),
    }),
  );
  await login(page, user);
  await page.goto(`/kdp-preview?book=${book!.id}`);
  await expect(page.getByLabel('Choose a book').locator('option')).toHaveCount(1);
  const ebook = page.frameLocator('iframe[title="Kindle ebook manuscript"]');
  await expect(ebook.getByText('The End', { exact: true })).toBeVisible();
  await expect(ebook.getByText('A Fantasy', { exact: true })).toBeVisible();
  await expect(ebook.getByText(/Continued in/)).toHaveCount(0);
  await expect(page.locator('details').filter({ hasText: 'Read Next link' })).toContainText(
    'Replace {{NEXT_BOOK_URL}}',
  );
  await expect(page.locator('details').filter({ hasText: 'Paperback wrap' })).toContainText(
    'Wrap was built for 1 pages but the book is now 2',
  );
  await expect(
    page
      .frameLocator('iframe[title="Kindle ebook manuscript"]')
      .getByText('The harbour held a thousand stories.'),
  ).toBeVisible();
  await expect(page.getByText('Not validated', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Paperback', exact: true }).click();
  const canvas = page.locator('canvas[aria-label="Manuscript page 1"]');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute('width')).not.toBe('300');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('canvas[aria-label="Manuscript page 2"]')).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Kindle eBook', exact: true }).click();
  await page.getByRole('button', { name: 'Paperback', exact: true }).click();
  await expect(page.locator('canvas[aria-label="Manuscript page 2"]')).toBeVisible();
  await page.getByRole('button', { name: 'Open Previewer', exact: true }).click();
  await expect(page.getByRole('dialog').locator('canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fix Issues', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByText('2 pages — KDP requires at least 24.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.keyboard.press('Escape');
  await page.goto(`/series/${series!.id}/exports`);
  await expect(page.getByText('Files expired · export again for free')).toBeVisible();
});
