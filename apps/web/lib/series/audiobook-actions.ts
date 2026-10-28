'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan, findVoice, resolveCreditSource } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({
  bookId: z.string().uuid(),
  voice: z.string().refine((id) => findVoice(id) !== undefined, 'Pick one of the listed voices.'),
  speed: z.number().min(0.8).max(1.5),
});

/** Narrate a book (T6.15). Charged from the audio pool. */
export async function createAudiobookAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ jobId: string; audiobookId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId, voice, speed } = input.parse(raw);
    const db = getAdminDb();

    const { account } = await getAccount();
    assertCan(account.entitlements, { kind: 'audiobook' });

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
    if (book.status !== 'generated') {
      throw new AppError('VALIDATION', 'Write this part before narrating it.');
    }

    const cost = await getCreditCost('audiobook');
    const audiobookId = randomUUID();

    const { error } = await db.from('audiobooks').insert({
      id: audiobookId,
      user_id: user.id,
      book_id: book.id,
      series_id: series.id,
      voice,
      speed,
      status: 'queued',
    });
    if (error) throw new AppError('INTERNAL', `Could not start the audiobook: ${error.message}`);

    const queued = await enqueueJob(db, getQueues(), {
      type: 'audiobook',
      refId: book.id,
      userId: user.id,
      source: resolveCreditSource({ id: user.id, parentAgencyId: user.parentAgencyId }, 'audiobook'),
      action: 'audiobook',
      amount: cost.credits,
      version: Math.floor(Date.now() / 1000),
      payload: { audiobookId, voice, speed },
      reason: 'Audiobook narration',
    });

    revalidatePath(`/series/${series.id}/audiobook`);
    return { jobId: queued.jobId, audiobookId };
  });
}
