import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);

test('template part counts stay valid for the FE plan, including malformed URL values', async ({
  page,
}) => {
  const user = await createAccount({ plans: ['fe'] });
  await login(page, user);
  for (const [input, expected] of [
    ['12', '5'],
    ['NaN', '5'],
    ['-2', '3'],
    ['4.7', '4'],
  ]) {
    await page.goto(`/create-series?parts=${input}`);
    await expect(page.getByLabel('Planned books', { exact: true })).toHaveValue(expected!);
    expect(
      await page
        .getByLabel('Planned books', { exact: true })
        .evaluate((input: HTMLInputElement) => input.validity.valid),
    ).toBe(true);
  }
});

test('unrelated queued jobs keep finished books open on the roadmap and library', async ({
  page,
}) => {
  const user = await createAccount({ plans: ['fe'] });
  const { data: series, error } = await service
    .from('series')
    .insert({
      user_id: user.id,
      title: 'Finished Series',
      idea: 'A completed story.',
      genre: 'Fantasy',
      pen_name: 'Author',
      planned_books: 1,
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  const { data: book, error: bookError } = await service
    .from('books')
    .insert({
      series_id: series!.id,
      part_number: 1,
      title: 'Finished book',
      premise: 'Done.',
      status: 'generated',
      length_preset: 'short',
    })
    .select('id')
    .single();
  expect(bookError).toBeNull();
  const job = await service.from('jobs').insert({
    user_id: user.id,
    type: 'export_book',
    ref_id: book!.id,
    status: 'queued',
    idempotency_key: `export-test-${book!.id}`,
  });
  expect(job.error).toBeNull();
  await login(page, user);
  for (const url of [`/series/${series!.id}`, '/my-series']) {
    await page.goto(url);
    await expect(page.getByRole('link', { name: /Open Part 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /View progress/ })).toHaveCount(0);
  }

  // External worker updates must reach the shared library subscription and progress dialog.
  const ready = await service.from('books').update({ status: 'ready' }).eq('id', book!.id);
  expect(ready.error).toBeNull();
  const writing = await service
    .from('jobs')
    .insert({
      user_id: user.id,
      type: 'book',
      ref_id: book!.id,
      status: 'queued',
      idempotency_key: `book-live-test-${book!.id}`,
    })
    .select('id')
    .single();
  expect(writing.error).toBeNull();
  await expect(page.getByRole('button', { name: /View progress/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /View progress/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const active = await service
    .from('jobs')
    .update({
      status: 'active',
      progress: 42,
      step_label: 'Writing chapter 4 of 9',
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', writing.data!.id);
  expect(active.error).toBeNull();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42', {
    timeout: 15_000,
  });
  const finishedBook = await service
    .from('books')
    .update({ status: 'generated' })
    .eq('id', book!.id);
  expect(finishedBook.error).toBeNull();
  const finishedJob = await service
    .from('jobs')
    .update({ status: 'completed', progress: 100 })
    .eq('id', writing.data!.id);
  expect(finishedJob.error).toBeNull();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Open Part 1/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /View progress/ })).toHaveCount(0);
});
