import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, cleanupUsers, makeUser, type TestUser } from './helpers';

/**
 * Series ownership (migration 0005). Everything in the app hangs off `series.user_id`, so a leak
 * here would expose another customer's books and chapters — the highest-value RLS test in M2.
 */
let owner: TestUser;
let stranger: TestUser;
let seriesId: string;
let bookId: string;

beforeAll(async () => {
  owner = await makeUser({ name: 'Owner' });
  stranger = await makeUser({ name: 'Stranger' });

  const { data: series, error } = await admin
    .from('series')
    .insert({
      user_id: owner.id,
      title: 'The Ledger of Small Debts',
      idea: 'A harbour city where debts are inherited like weather, and the ledger proves everything.',
      genre: 'Fantasy',
      pen_name: 'A. Writer',
    })
    .select('id')
    .single();
  if (error || !series) throw new Error(`series insert failed: ${error?.message}`);
  seriesId = series.id;

  const { data: book, error: bookError } = await admin
    .from('books')
    .insert({
      series_id: seriesId,
      part_number: 1,
      title: 'Part One',
      premise: 'The debt comes due.',
      length_preset: 'short',
      status: 'ready',
    })
    .select('id')
    .single();
  if (bookError || !book) throw new Error(`book insert failed: ${bookError?.message}`);
  bookId = book.id;

  await admin.from('chapters').insert({ book_id: bookId, number: 1, title: 'Chapter One' });
});

afterAll(cleanupUsers);

describe('series RLS', () => {
  it('the owner can read their series, books and chapters', async () => {
    const series = await owner.client.from('series').select('id').eq('id', seriesId);
    expect(series.error).toBeNull();
    expect(series.data).toEqual([{ id: seriesId }]);

    const books = await owner.client.from('books').select('id').eq('id', bookId);
    expect(books.data).toEqual([{ id: bookId }]);

    const chapters = await owner.client.from('chapters').select('number').eq('book_id', bookId);
    expect(chapters.data).toEqual([{ number: 1 }]);
  });

  it('a stranger sees nothing', async () => {
    expect((await stranger.client.from('series').select('id').eq('id', seriesId)).data).toEqual([]);
    expect((await stranger.client.from('books').select('id').eq('id', bookId)).data).toEqual([]);
    expect(
      (await stranger.client.from('chapters').select('number').eq('book_id', bookId)).data,
    ).toEqual([]);
    expect((await stranger.client.from('series_bible').select('series_id')).data).toEqual([]);
  });

  it('browsers cannot write series, books or chapters (service role only)', async () => {
    const write = await owner.client
      .from('series')
      .update({ title: 'hacked' })
      .eq('id', seriesId);
    expect(write.error?.code).toBe('42501');

    const insert = await owner.client
      .from('books')
      .insert({ series_id: seriesId, part_number: 2, title: 'x', premise: 'x' });
    expect(insert.error?.code).toBe('42501');
  });

  it('an agency owner can read a client series but not write it', async () => {
    const agencyOwner = await makeUser({ name: 'Agency' });
    await admin.from('profiles').update({ parent_agency_id: agencyOwner.id }).eq('id', owner.id);
    await admin.from('agency_clients').insert({
      owner_id: agencyOwner.id,
      client_id: owner.id,
      allotment: 100,
    });

    const read = await agencyOwner.client.from('series').select('id').eq('id', seriesId);
    expect(read.data).toEqual([{ id: seriesId }]);

    const write = await agencyOwner.client
      .from('series')
      .update({ title: 'nope' })
      .eq('id', seriesId);
    expect(write.error?.code).toBe('42501');
  });

  it('deleting a series cascades to its books and chapters', async () => {
    const temp = await makeUser({ name: 'Temp' });
    const { data: s } = await admin
      .from('series')
      .insert({
        user_id: temp.id,
        title: 'Temp',
        idea: 'A temporary series used only to prove the cascade works correctly.',
        genre: 'Fantasy',
      })
      .select('id')
      .single();
    const { data: b } = await admin
      .from('books')
      .insert({ series_id: s!.id, part_number: 1, premise: 'x' })
      .select('id')
      .single();
    await admin.from('chapters').insert({ book_id: b!.id, number: 1, title: 'one' });

    await admin.from('series').delete().eq('id', s!.id);

    const { data: books } = await admin.from('books').select('id').eq('series_id', s!.id);
    const { data: chapters } = await admin.from('chapters').select('id').eq('book_id', b!.id);
    expect(books).toEqual([]);
    expect(chapters).toEqual([]);
  });
});

describe('pen names', () => {
  it('the owner can create, read and delete their own pen names', async () => {
    const insert = await owner.client
      .from('pen_names')
      .insert({ user_id: owner.id, name: 'A. Writer' })
      .select('id, name')
      .single();
    expect(insert.error).toBeNull();

    const list = await owner.client.from('pen_names').select('name');
    expect(list.data?.map((r) => r.name)).toContain('A. Writer');

    const strangerList = await stranger.client.from('pen_names').select('name');
    expect(strangerList.data).toEqual([]);

    const del = await owner.client.from('pen_names').delete().eq('id', insert.data!.id);
    expect(del.error).toBeNull();
  });

  it('a user cannot create a pen name for somebody else', async () => {
    const bad = await stranger.client
      .from('pen_names')
      .insert({ user_id: owner.id, name: 'Stolen' });
    expect(bad.error).not.toBeNull();
  });
});
