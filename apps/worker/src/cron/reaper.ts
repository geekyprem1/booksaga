/**
 * Stuck-job reaper (T2.9, ARCH §4.3). Runs every 10 minutes on the `system` queue.
 *
 * Two failure modes are healed here:
 *  1. `active` with a heartbeat older than 5 minutes — the worker was killed mid-job.
 *  2. `queued` for more than 10 minutes with no matching BullMQ job — the process died between the
 *     DB insert and `queue.add` (or Redis was flushed).
 *
 * Each job gets two re-queues; after that it fails and the reservation is refunded, so a book that
 * reliably crashes cannot loop forever on the user's credits.
 */
import {
  refundCredits,
  queueForJob,
  type DbClient,
  type Database,
  type JobType,
  type Queues,
} from '@booksaga/core';

const STALE_HEARTBEAT_MS = 5 * 60 * 1000;
const ORPHAN_QUEUED_MS = 10 * 60 * 1000;
const MAX_REQUEUES = 2;

interface JobLike {
  id: string;
  user_id: string;
  type: string;
  ref_id: string | null;
  status: string;
  ledger_id: number | null;
  idempotency_key: string;
  meta: unknown;
  cancel_requested: boolean;
  started_at: string | null;
  heartbeat_at: string | null;
}

function reapedCount(meta: unknown): number {
  if (meta && typeof meta === 'object' && 'reaped' in meta) {
    const value = (meta as { reaped?: unknown }).reaped;
    return typeof value === 'number' ? value : 0;
  }
  return 0;
}

export interface ReaperSummary {
  requeued: number;
  failed: number;
}

/** BullMQ can still be running or waiting to retry a job even if the DB heartbeat is stale. */
export async function hasLiveQueueJob(queues: Queues, job: JobLike): Promise<boolean> {
  const queue = queues[queueForJob(job.type as JobType)];
  for (const id of [
    job.idempotency_key,
    `${job.idempotency_key}-r1`,
    `${job.idempotency_key}-r2`,
  ]) {
    const entry = await queue.getJob(id);
    if (!entry) continue;
    const state = await entry.getState();
    if (state !== 'completed' && state !== 'failed') return true;
  }
  return false;
}

export async function runStuckReaper(db: DbClient, queues: Queues): Promise<ReaperSummary> {
  const now = Date.now();
  const summary: ReaperSummary = { requeued: 0, failed: 0 };

  const { data: stale, error: staleError } = await db
    .from('jobs')
    .select(
      'id, user_id, type, ref_id, status, ledger_id, idempotency_key, meta, cancel_requested, started_at, heartbeat_at',
    )
    .eq('status', 'active')
    .lt('heartbeat_at', new Date(now - STALE_HEARTBEAT_MS).toISOString());
  if (staleError) throw new Error(`Reaper could not read active jobs: ${staleError.message}`);

  for (const job of stale ?? []) {
    if (await hasLiveQueueJob(queues, job as JobLike)) continue;
    const outcome = await handleStuck(db, queues, job as JobLike, 'stale heartbeat');
    if (outcome !== 'skipped') summary[outcome] += 1;
  }

  const { data: queued, error: queuedError } = await db
    .from('jobs')
    .select(
      'id, user_id, type, ref_id, status, ledger_id, idempotency_key, meta, cancel_requested, started_at, heartbeat_at',
    )
    .eq('status', 'queued')
    .lt('queued_at', new Date(now - ORPHAN_QUEUED_MS).toISOString());
  if (queuedError) throw new Error(`Reaper could not read queued jobs: ${queuedError.message}`);

  for (const job of queued ?? []) {
    const row = job as JobLike;
    if (await hasLiveQueueJob(queues, row)) continue;

    if (row.cancel_requested && !row.started_at) {
      try {
        if (row.ledger_id) {
          const result = await refundCredits(db, row.ledger_id, 'Cancelled before start');
          if (result !== 'refunded' && result !== 'already_refunded')
            throw new Error(`Refund status: ${result}`);
        }
        const { data: cancelled, error } = await db
          .from('jobs')
          .update({
            status: 'cancelled',
            step_label: 'Cancelled',
            finished_at: new Date().toISOString(),
            heartbeat_at: null,
          })
          .eq('id', row.id)
          .eq('status', 'queued')
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (cancelled && row.type === 'book' && row.ref_id) {
          await db.from('books').update({ status: 'ready' }).eq('id', row.ref_id);
        }
      } catch (err) {
        console.error(`[reaper] cancellation settlement failed for ${row.id}:`, err);
      }
      continue;
    }

    const outcome = await handleStuck(db, queues, row, 'orphaned queued job');
    if (outcome !== 'skipped') summary[outcome] += 1;
  }

  return summary;
}

export async function handleStuck(
  db: DbClient,
  queues: Queues,
  job: JobLike,
  reason: string,
): Promise<'requeued' | 'failed' | 'skipped'> {
  const reaped = reapedCount(job.meta);

  if (reaped >= MAX_REQUEUES) {
    return (await failJob(db, job, `Gave up after ${MAX_REQUEUES} re-queues (${reason}).`))
      ? 'failed'
      : 'skipped';
  }

  const queue = queues[queueForJob(job.type as JobType)];
  const attempt = reaped + 1;
  // The original payload (cover text mode, export formats, audiobook id, box-set books, …) lives in
  // `jobs.meta`; without it a re-queued processor would run with missing inputs (or silently wrong
  // defaults), so it must travel with the BullMQ job again.
  const payload =
    job.meta && typeof job.meta === 'object' && !Array.isArray(job.meta)
      ? (job.meta as Record<string, unknown>)
      : {};

  // Claim the observed row before exposing the new BullMQ job. A worker may start immediately
  // after queue.add; updating the status afterwards would overwrite its active/finished state.
  let claim = db
    .from('jobs')
    .update({
      status: 'queued',
      step_label: `Re-queued after ${reason}`,
      heartbeat_at: null,
      execution_token: null,
      meta: { ...payload, reaped: attempt },
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .eq('cancel_requested', job.cancel_requested);
  if (job.heartbeat_at) claim = claim.eq('heartbeat_at', job.heartbeat_at);
  const { data: claimed, error: claimError } = await claim.select('id').maybeSingle();
  if (claimError) throw new Error(`Could not claim job for recovery: ${claimError.message}`);
  if (!claimed) return 'skipped';

  try {
    await queue.add(
      job.type,
      {
        ...payload,
        jobId: job.id,
        userId: job.user_id,
        refId: job.ref_id,
        ledgerId: job.ledger_id,
      },
      { jobId: `${job.idempotency_key}-r${attempt}`, attempts: 1, removeOnComplete: true },
    );
  } catch (err) {
    console.error(`[reaper] could not re-queue ${job.id}:`, err);
    await db
      .from('jobs')
      .update({ meta: payload as Database['public']['Tables']['jobs']['Update']['meta'] })
      .eq('id', job.id)
      .eq('status', 'queued')
      .contains('meta', { reaped: attempt });
    return 'requeued'; // leave it for the next pass rather than failing the user's job
  }

  return 'requeued';
}

async function failJob(db: DbClient, job: JobLike, message: string): Promise<boolean> {
  let claim = db
    .from('jobs')
    .update({
      status: 'failed',
      execution_token: null,
      error: message,
      finished_at: new Date().toISOString(),
      heartbeat_at: null,
    })
    .eq('id', job.id)
    .eq('status', job.status)
    .eq('cancel_requested', job.cancel_requested);
  if (job.heartbeat_at) claim = claim.eq('heartbeat_at', job.heartbeat_at);
  const { data: claimed, error } = await claim.select('id').maybeSingle();
  if (error) throw new Error(`Could not fail abandoned job: ${error.message}`);
  if (!claimed) return false;
  if (job.ledger_id) {
    try {
      const result = await refundCredits(db, job.ledger_id, 'Job abandoned');
      if (result !== 'refunded' && result !== 'already_refunded') {
        throw new Error(`Could not confirm abandoned job refund: ${result}`);
      }
    } catch (err) {
      await db
        .from('jobs')
        .update({ error: `${message} Credit refund could not be confirmed; contact support.` })
        .eq('id', job.id);
      throw err;
    }
  }
  if (job.type === 'book' && job.ref_id)
    await db.from('books').update({ status: 'failed' }).eq('id', job.ref_id);

  await db.from('notifications').insert({
    user_id: job.user_id,
    type: 'job_failed',
    title: 'Generation failed',
    body: `${message} Your credits have been refunded.`,
  });
  return true;
}
