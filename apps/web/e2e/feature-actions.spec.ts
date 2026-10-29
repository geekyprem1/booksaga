import { readdir, readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { cleanupAccounts, createAccount, login, service } from './helpers';

test.afterAll(cleanupAccounts);

// Find the action IDs produced by this build; they intentionally change between builds.
async function actionIds() {
  const names = ['createAudiobookAction', 'createBoxSetAction', 'exportBookAction'];
  const ids: Record<string, string> = {};
  for (const name of await readdir('.next/static/chunks')) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(`.next/static/chunks/${name}`, 'utf8');
    for (const action of names) {
      const match = source.match(
        new RegExp(`createServerReference\\)\\("([a-f0-9]+)"[^;]{0,200}"${action}"`),
      );
      if (match) ids[action] = match[1]!;
    }
  }
  for (const action of names)
    if (!ids[action]) throw new Error(`Could not locate ${action} in this build`);
  return ids;
}

test('direct requests for locked audiobook, box set and paperback wrap do not create jobs or spend credits', async ({
  page,
}) => {
  const ids = await actionIds();
  const buyer = await createAccount({ plans: ['fe'] });
  const series = await service
    .from('series')
    .insert({
      user_id: buyer.id,
      title: 'Feature access test',
      idea: 'A test story',
      genre: 'Fantasy',
      pen_name: 'Writer',
      planned_books: 3,
    })
    .select('id')
    .single();
  expect(series.error).toBeNull();
  const books = await service
    .from('books')
    .insert(
      [1, 2].map((part) => ({
        series_id: series.data!.id,
        part_number: part,
        title: `Book ${part}`,
        premise: 'Test',
        status: 'generated',
        length_preset: 'short',
      })),
    )
    .select('id');
  expect(books.error).toBeNull();
  const before = await service
    .from('credit_balances')
    .select('pool, balance')
    .eq('user_id', buyer.id)
    .order('pool');
  await login(page, buyer);
  const cases = [
    {
      name: 'createAudiobookAction',
      route: `/series/${series.data!.id}/audiobook`,
      input: { bookId: books.data![0]!.id, voice: 'af_sarah', speed: 1 },
    },
    {
      name: 'createBoxSetAction',
      route: `/series/${series.data!.id}/box-set`,
      input: {
        seriesId: series.data!.id,
        bookIds: books.data!.map((b) => b.id),
        title: 'Test set',
        withCover: false,
      },
    },
    {
      name: 'exportBookAction',
      route: `/series/${series.data!.id}/exports`,
      input: { bookId: books.data![0]!.id, formats: ['pdf', 'wrap'] },
    },
  ];
  for (const entry of cases) {
    const response = await page.request.post(entry.route, {
      headers: {
        'next-action': ids[entry.name]!,
        'content-type': 'text/plain;charset=UTF-8',
        origin: process.env.APP_URL ?? 'http://localhost:3000',
      },
      data: JSON.stringify([entry.input]),
    });
    expect(await response.text(), entry.name).toContain('PLAN_REQUIRED');
  }
  const jobs = await service.from('jobs').select('id').eq('user_id', buyer.id);
  const audiobooks = await service.from('audiobooks').select('id').eq('user_id', buyer.id);
  const boxsets = await service.from('box_sets').select('id').eq('user_id', buyer.id);
  const after = await service
    .from('credit_balances')
    .select('pool, balance')
    .eq('user_id', buyer.id)
    .order('pool');
  expect(jobs.data).toEqual([]);
  expect(audiobooks.data).toEqual([]);
  expect(boxsets.data).toEqual([]);
  expect(after.data).toEqual(before.data);
});
