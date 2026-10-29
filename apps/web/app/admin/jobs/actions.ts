'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { enqueueJob, writeAudit } from '@booksaga/core';
import { AppError } from '@booksaga/shared';
import { runAction, type ActionResult } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth/session';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';

/** Cron jobs have no `jobs` row and are never retried from here. */
const NOT_RETRYABLE = new Set(['stuck_reaper', 'export_cleanup', 'trash_purge']);

const input = z.object({ jobId: z.uuid() });

export interface RetryJobResult {
  jobId: string;
  /** The new job row. The failed one stays in the history. */
  newJobId: string;
}

/**
 * Retry a failed job as the admin. The failed attempt was already refunded when it failed, so the
 * retry runs free (no second charge). The payload is the original one kept in `jobs.meta`.
 *
 * The worker resumes books from chapters already written.
 */
export async function retryJobAction(
  raw: z.input<typeof input>,
): Promise<ActionResult<RetryJobResult>> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { jobId } = input.parse(raw);
    const db = getAdminDb();

    const { data: job } = await db
      .from('jobs')
      .select('id, user_id, type, status, ref_id, meta, ledger_id, credits_reserved')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new AppError('NOT_FOUND', 'Job not found.');
    if (job.status !== 'failed') {
      throw new AppError('CONFLICT', 'Only failed jobs can be retried.');
    }
    if (NOT_RETRYABLE.has(job.type)) {
      throw new AppError('VALIDATION', `${job.type} jobs cannot be retried.`);
    }

    if (job.ledger_id) {
      const { data: ledger, error } = await db
        .from('credit_ledger')
        .select('status')
        .eq('id', job.ledger_id)
        .maybeSingle();
      if (error || ledger?.status !== 'refunded') {
        throw new AppError(
          'CONFLICT',
          'The original credit refund has not been confirmed. Resolve the ledger entry before retrying.',
        );
      }
    } else if (job.credits_reserved > 0) {
      throw new AppError(
        'CONFLICT',
        'The original credit reservation is missing. Review the ledger before retrying.',
      );
    }

    // The original payload. The reaper adds a `reaped` counter that must not carry over.
    const payload: Record<string, unknown> = { ...((job.meta as Record<string, unknown>) ?? {}) };
    delete payload.reaped;

    const queued = await enqueueJob(db, getQueues(), {
      type: job.type as Parameters<typeof enqueueJob>[2]['type'],
      refId: job.ref_id,
      userId: job.user_id,
      amount: 0,
      skipCredits: true,
      retryOfJobId: job.id,
      payload,
      reason: `Admin retry of job ${job.id.slice(0, 8)}`,
    });

    await writeAudit(db, {
      actorId: admin.id,
      action: 'job.retry',
      target: `job:${job.id}`,
      meta: { type: job.type, newJobId: queued.jobId, deduplicated: queued.deduplicated },
    });

    revalidatePath('/admin/jobs');
    return { jobId: job.id, newJobId: queued.jobId };
  });
}
