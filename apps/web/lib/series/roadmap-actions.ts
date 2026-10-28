'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  AppError,
  assertCan,
  bookCreditAction,
  resolveCreditSource,
} from '@booksaga/shared';
import { enqueueJob, queueForJob, refundCredits, type JobType } from '@booksaga/core';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const generatePartSchema = z.object({
  seriesId: z.string().uuid(),
  partNumber: z.number().int().min(1).max(30),
  lengthPreset: z.enum(['short', 'standard', 'full']),
});

export interface GeneratePartResult {
  jobId: string;
  bookId: string;
}

/**
 * "Generate Part N" (T3.1). Part N only runs when Part N-1 is `generated`, because the series bible
 * is updated sequentially — that rule is enforced here, not just hidden in the UI.
 */
export async function generatePartAction(
  input: z.infer<typeof generatePartSchema>,
): Promise<ActionResult<GeneratePartResult>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = generatePartSchema.parse(input);
    const db = getAdminDb();

    const { data: series } = await db
      .from('series')
      .select('id, user_id, planned_books, title')
      .eq('id', data.seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This series is not yours.');

    const { data: book } = await db
      .from('books')
      .select('id, part_number, status')
      .eq('series_id', series.id)
      .eq('part_number', data.partNumber)
      .maybeSingle();
    if (!book) throw new AppError('NOT_FOUND', 'That part does not exist yet.');

    if (book.status === 'generated') {
      throw new AppError('CONFLICT', 'This part is already written. Open it to keep editing.');
    }
    if (book.status === 'generating') {
      throw new AppError('JOB_ALREADY_RUNNING', 'This part is already being written.');
    }
    if (book.status === 'locked') {
      throw new AppError('PART_LOCKED', 'Add this part to the roadmap before generating it.');
    }
    if (data.partNumber > series.planned_books) {
      throw new AppError(
        'VALIDATION',
        'This part is beyond your plan. Use "Add more parts" to extend the series first.',
      );
    }

    if (data.partNumber > 1) {
      const { data: previous } = await db
        .from('books')
        .select('status')
        .eq('series_id', series.id)
        .eq('part_number', data.partNumber - 1)
        .maybeSingle();
      if (previous?.status !== 'generated') {
        throw new AppError(
          'PART_LOCKED',
          `Finish Part ${data.partNumber - 1} first — each part builds on the previous one.`,
        );
      }
    }

    const { account } = await getAccount();
    assertCan(account.entitlements, {
      kind: 'generateBook',
      lengthPreset: data.lengthPreset,
    });

    await db
      .from('books')
      .update({ length_preset: data.lengthPreset, status: 'ready' })
      .eq('id', book.id);

    const action = bookCreditAction(data.lengthPreset);
    const cost = await getCreditCost(action);
    const source = resolveCreditSource({ id: user.id, parentAgencyId: user.parentAgencyId }, action);

    try {
      const queued = await enqueueJob(db, getQueues(), {
        type: 'book',
        refId: book.id,
        userId: user.id,
        source,
        action,
        amount: cost.credits,
        payload: { part: data.partNumber },
        dailyBookCap: account.entitlements.dailyBookCap,
        reason: `Generate Part ${data.partNumber} (${data.lengthPreset})`,
      });

      revalidatePath(`/series/${series.id}`);
      return { jobId: queued.jobId, bookId: book.id };
    } catch (err) {
      await db.from('books').update({ status: 'ready' }).eq('id', book.id);
      throw err;
    }
  });
}

const cancelSchema = z.object({ jobId: z.string().uuid() });

export interface CancelResult {
  /** True when the job was removed before it started (credits already refunded). */
  cancelledImmediately: boolean;
}

/**
 * Cancel a generation (T3.14). A queued job is removed and refunded on the spot; an active job gets
 * `cancel_requested` and the worker stops between chapters, refunding per the PRD rule
 * (<20% written = full refund, otherwise the completed chapters are charged).
 */
export async function cancelJobAction(
  input: z.infer<typeof cancelSchema>,
): Promise<ActionResult<CancelResult>> {
  return runAction(async () => {
    const user = await requireUser();
    const { jobId } = cancelSchema.parse(input);
    const db = getAdminDb();

    const { data: job } = await db
      .from('jobs')
      .select('id, user_id, type, status, ledger_id, idempotency_key, ref_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new AppError('NOT_FOUND', 'Job not found.');
    if (job.user_id !== user.id && user.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'This job is not yours.');
    }
    if (job.status !== 'queued' && job.status !== 'active') {
      throw new AppError('CONFLICT', 'This job has already finished.');
    }

    await db.from('jobs').update({ cancel_requested: true }).eq('id', job.id);

    // Still queued? Take it out of BullMQ and refund immediately.
    if (job.status === 'queued') {
      const queue = getQueues()[queueForJob(job.type as JobType)];
      const bullJob = await queue.getJob(job.idempotency_key);

      if (bullJob) {
        try {
          await bullJob.remove();
        } catch {
          // It started between our read and the remove: fall through to the worker-side cancel.
          return { cancelledImmediately: false };
        }
      }

      if (job.ledger_id) {
        await refundCredits(db, job.ledger_id, 'Cancelled before start').catch(() => undefined);
      }
      await db
        .from('jobs')
        .update({
          status: 'cancelled',
          step_label: 'Cancelled',
          finished_at: new Date().toISOString(),
          heartbeat_at: null,
        })
        .eq('id', job.id);

      if (job.type === 'book' && job.ref_id) {
        await db.from('books').update({ status: 'ready' }).eq('id', job.ref_id);
      }

      revalidatePath('/dashboard');
      return { cancelledImmediately: true };
    }

    return { cancelledImmediately: false };
  });
}

const addPartsSchema = z.object({
  seriesId: z.string().uuid(),
  count: z.number().int().min(1).max(10),
});

export interface AddPartsResult {
  jobId: string;
  count: number;
}

/** "Add More Parts" (T3.2): extend the arc by up to 10 parts (1 credit). */
export async function addMorePartsAction(
  input: z.infer<typeof addPartsSchema>,
): Promise<ActionResult<AddPartsResult>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = addPartsSchema.parse(input);
    const db = getAdminDb();

    const { data: series } = await db
      .from('series')
      .select('id, user_id, planned_books, title')
      .eq('id', data.seriesId)
      .maybeSingle();
    if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
    if (series.user_id !== user.id) throw new AppError('FORBIDDEN', 'This series is not yours.');

    const { account } = await getAccount();
    assertCan(account.entitlements, {
      kind: 'addBook',
      booksInSeries: series.planned_books,
    });

    if (series.planned_books + data.count > account.entitlements.maxBooksPerSeries) {
      throw new AppError(
        'LIMIT_REACHED',
        `Your plan allows ${account.entitlements.maxBooksPerSeries} parts per series (currently ${series.planned_books}).`,
      );
    }

    const action = 'arc_extend' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource({ id: user.id, parentAgencyId: user.parentAgencyId }, action);

    const queued = await enqueueJob(db, getQueues(), {
      type: 'arc_extend',
      refId: series.id,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      payload: { count: data.count },
      reason: `Add ${data.count} more part(s)`,
    });

    revalidatePath(`/series/${series.id}`);
    return { jobId: queued.jobId, count: data.count };
  });
}
