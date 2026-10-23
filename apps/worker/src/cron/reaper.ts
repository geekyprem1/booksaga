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
import { refundCredits, queueForJob, type DbClient, type JobType, type Queues } from '@booksaga/core';

const STALE_HEARTBEAT_MS = 5 * 60 * 1000;
const ORPHAN_QUEUED_MS = 10 * 60 * 1000;
const MAX_REQUEUES = 2;

interface JobLike {
  id: string;
  user_id: string;
  type: string;
  status: string;
  ledger_id: number | null;
  idempotency_key: string;
  meta: unknown;
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

export async function runStuckReaper(db: DbClient, queues: Queues): Promise<ReaperSummary> {
  const now = Date.now();
  const summary: ReaperSummary = { requeued: 0, failed: 0 };

  const { data: stale, error: staleError } = await db
    .from('jobs')
    .select('id, user_id, type, status, ledger_id, idempotency_key, meta')
    .eq('status', 'active')
    .lt('heartbeat_at', new Date(now - STALE_HEARTBEAT_MS).toISOString());
  if (staleError) throw new Error(`Reaper could not read active jobs: ${staleError.message}`);

  for (const job of stale ?? []) {
    const outcome = await handleStuck(db, queues, job as JobLike, 'stale heartbeat');
    summary[outcome] += 1;
  }

  const { data: queued, error: queuedError } = await db
    .from('jobs')
    .select('id, user_id, type, status, ledger_id, idempotency_key, meta')
    .eq('status', 'queued')
    .lt('queued_at', new Date(now - ORPHAN_QUEUED_MS).toISOString());
  if (queuedError) throw new Error(`Reaper could not read queued jobs: ${queuedError.message}`);

  for (const job of queued ?? []) {
    const row = job as JobLike;
    const queue = queues[queueForJob(row.type as JobType)];

    // Is there still a BullMQ job for this row (original id or a re-queue suffix)?
    const candidates = [row.idempotency_key, `${row.idempotency_key}-r1`, `${row.idempotency_key}-r2`];
    let exists = false;
    for (const id of candidates) {
      const bullJob = await queue.getJob(id);
      if (bullJob) {
        exists = true;
        break;
      }
    }
    if (exists) continue;

    const outcome = await handleStuck(db, queues, row, 'orphaned queued job');
    summary[outcome] += 1;
  }

  return summary;
}

async function handleStuck(
  db: DbClient,
  queues: Queues,
  job: JobLike,
  reason: string,
): Promise<'requeued' | 'failed'> {
  const reaped = reapedCount(job.meta);

  if (reaped >= MAX_REQUEUES) {
    await failJob(db, job, `Gave up after ${MAX_REQUEUES} re-queues (${reason}).`);
    return 'failed';
  }

  const queue = queues[queueForJob(job.type as JobType)];
  const attempt = reaped + 1;

  try {
    await queue.add(
      job.type,
      { jobId: job.id, userId: job.user_id, ledgerId: job.ledger_id },
      { jobId: `${job.idempotency_key}-r${attempt}`, attempts: 1, removeOnComplete: true },
    );
  } catch (err) {
    console.error(`[reaper] could not re-queue ${job.id}:`, err);
    return 'requeued'; // leave it for the next pass rather than failing the user's job
  }

  await db
    .from('jobs')
    .update({
      status: 'queued',
      progress: 0,
      step_label: `Re-queued after ${reason}`,
      heartbeat_at: null,
      meta: { ...(job.meta as Record<string, unknown>), reaped: attempt },
    })
    .eq('id', job.id);

  return 'requeued';
}

async function failJob(db: DbClient, job: JobLike, message: string): Promise<void> {
  if (job.ledger_id) {
    await refundCredits(db, job.ledger_id, 'Job abandoned').catch((err) =>
      console.error('[reaper] refund failed', err),
    );
  }
  await db
    .from('jobs')
    .update({
      status: 'failed',
      error: message,
      finished_at: new Date().toISOString(),
      heartbeat_at: null,
    })
    .eq('id', job.id);

  await db.from('notifications').insert({
    user_id: job.user_id,
    type: 'job_failed',
    title: 'Generation failed',
    body: `${message} Your credits have been refunded.`,
  });
}
