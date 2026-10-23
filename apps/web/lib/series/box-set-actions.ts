'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, assertCan } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({
  seriesId: z.string().uuid(),
  bookIds: z.array(z.string().uuid()).min(2).max(12),
  title: z.string().trim().min(3).max(120),
  withCover: z.boolean(),
});

/** Build a box set EPUB (T6.4). The cover costs credits; the EPUB itself is free. */
export async function createBoxSetAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<{ jobId: string; boxSetId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { seriesId, bookIds, title, withCover } = input.parse(raw);
    const db = getAdminDb();

    const { account } = await getAccount();
    assertCan(account.entitlements, { kind: 'boxSet' });

    const { data: series } = await db
      .from('series')
      .select('id, user_id')
      .eq('id', seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This series is not yours.');

    const { data: books } = await db
      .from('books')
      .select('id, status')
      .eq('series_id', seriesId)
      .in('id', bookIds);

    const generated = (books ?? []).filter((book) => book.status === 'generated');
    if (generated.length < 2) {
      throw new AppError('VALIDATION', 'Pick at least two generated books.');
    }

    const cost = await getCreditCost('cover');
    const boxSetId = randomUUID();

    const { error } = await db.from('box_sets').insert({
      id: boxSetId,
      user_id: user.id,
      series_id: seriesId,
      title,
      book_ids: generated.map((book) => book.id),
      status: 'queued',
    });
    if (error) throw new AppError('INTERNAL', `Could not create the box set: ${error.message}`);

    const queued = await enqueueJob(db, getQueues(), {
      type: 'box_set',
      refId: seriesId,
      userId: user.id,
      source: { ownerId: user.id, pool: 'main', actingUserId: user.id },
      action: 'cover',
      amount: withCover ? cost.credits : 0,
      skipCredits: !withCover,
      version: Math.floor(Date.now() / 1000),
      payload: { boxSetId, bookIds: generated.map((book) => book.id), title, withCover },
      reason: 'Box set',
    });

    revalidatePath(`/series/${seriesId}/box-set`);
    return { jobId: queued.jobId, boxSetId };
  });
}
