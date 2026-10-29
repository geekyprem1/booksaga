import { afterAll, expect, it } from 'vitest';
import { createAi } from '@booksaga/ai';
import type { Queues } from '@booksaga/core';
import { processBook } from '../../apps/worker/src/processors/text/book';
import { balanceOf, cleanupUsers, db, grantPlan, makeRunner, makeUser, reserve } from './helpers';

afterAll(cleanupUsers);

for (const completed of [0, 1]) {
  it(`settles a resumed book cancellation with ${completed} of 5 chapters complete`, async () => {
    const user = await makeUser();
    await grantPlan(user.id, 'fe');
    const series = await db
      .from('series')
      .insert({
        user_id: user.id,
        title: 'Cancellation test',
        idea: 'Test',
        genre: 'Fantasy',
        pen_name: 'Author',
        arc: { overview: 'Test', books: [] },
      })
      .select('id')
      .single();
    expect(series.error).toBeNull();
    const book = await db
      .from('books')
      .insert({
        series_id: series.data!.id,
        part_number: 1,
        title: 'Book',
        premise: 'Test',
        status: 'generating',
        length_preset: 'short',
        outline: { title: 'Book', chapters: [] },
      })
      .select('id')
      .single();
    expect(book.error).toBeNull();
    const chapters = await db.from('chapters').insert(
      Array.from({ length: 5 }, (_, i) => ({
        book_id: book.data!.id,
        number: i + 1,
        title: `Chapter ${i + 1}`,
        status: i < completed ? 'done' : 'pending',
        summary: i < completed ? 'Saved summary' : null,
      })),
    );
    expect(chapters.error).toBeNull();
    const reservation = await reserve(user.id, 'main', 10);
    expect(reservation.error).toBeNull();
    const job = await db
      .from('jobs')
      .insert({
        user_id: user.id,
        type: 'book',
        ref_id: book.data!.id,
        idempotency_key: `book-cancel-${user.id}`,
        status: 'queued',
        cancel_requested: true,
        started_at: new Date().toISOString(),
        ledger_id: reservation.data!,
        credits_reserved: 10,
      })
      .select('*')
      .single();
    expect(job.error).toBeNull();
    const runner = makeRunner(job.data!);
    expect(await runner.start()).toBe(true);
    await processBook(
      { db: runner.db, ai: createAi({ mode: 'mock', model: 'mock' }), queues: {} as Queues },
      runner,
      { jobId: job.data!.id, userId: user.id, refId: book.data!.id, ledgerId: reservation.data! },
    );
    const ledger = await db
      .from('credit_ledger')
      .select('status')
      .eq('id', reservation.data!)
      .single();
    expect(ledger.data?.status).toBe(completed ? 'committed' : 'refunded');
    expect(await balanceOf(user.id, 'main')).toBe(completed ? 290 : 300);
    expect(
      (await db.from('jobs').select('status').eq('id', job.data!.id).single()).data?.status,
    ).toBe('cancelled');
    expect(
      (await db.from('books').select('status').eq('id', book.data!.id).single()).data?.status,
    ).toBe('ready');
  });
}
