'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({
  bookId: z.string().uuid(),
  formats: z.array(z.enum(['epub', 'pdf', 'reader', 'docx', 'metadata', 'wrap'])).min(1).max(6),
});

/** Export a book (T5.7). Re-exports are free — no AI work happens. */
export async function exportBookAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId, formats } = input.parse(raw);
    const db = getAdminDb();

    const { data: book } = await db
      .from('books')
      .select('id, series_id, status')
      .eq('id', bookId)
      .maybeSingle();
    if (!book) throw new AppError('NOT_FOUND', 'Book not found.');

    const { data: series } = await db
      .from('series')
      .select('id, user_id')
      .eq('id', book.series_id)
      .maybeSingle();
    if (!series || series.user_id !== user.id) {
      throw new AppError('FORBIDDEN', 'This book is not yours.');
    }
    if (formats.includes('wrap')) {
      const { account } = await getAccount();
      assertCan(account.entitlements, { kind: 'paperbackWrap' });
      if (!formats.includes('pdf')) {
        throw new AppError('VALIDATION', 'The paperback wrap needs the print PDF (page count).');
      }
    }

    if (book.status !== 'generated') {
      throw new AppError('VALIDATION', 'Write this part before exporting it.');
    }

    const queued = await enqueueJob(db, getQueues(), {
      type: 'export_book',
      refId: book.id,
      userId: user.id,
      source: { ownerId: user.id, pool: 'main' },
      action: 'metadata',
      amount: 0,
      skipCredits: true,
      version: Math.floor(Date.now() / 1000),
      payload: { formats },
      reason: 'Export book',
    });

    revalidatePath(`/series/${series.id}/exports`);
    return { jobId: queued.jobId };
  });
}
