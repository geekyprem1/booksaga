/**
 * Queue plumbing shared by the web app and the worker (T2.6–T2.8).
 *
 * `enqueueJob()` is the only way a job enters the system. It keeps the three states that must
 * agree in sync — the `jobs` row, the reserved credits and the BullMQ job:
 *
 *   insert job  ->  reserve credits  ->  queue.add
 *                      |                    |
 *                      +-- fail: delete row |-- fail: refund + cancel the row
 *
 * Idempotency: the BullMQ job id is the DB `idempotency_key` (`{type}-{refId}-v{n}`, never a
 * colon — BullMQ reserves `:` for its Redis key namespace). A duplicate insert returns the
 * existing job instead of charging again.
 */
import { Queue, type ConnectionOptions } from 'bullmq';
import { AppError, type CreditAction, type CreditSource } from '@booksaga/shared';
import { mapCreditError, refundCredits, reserveCredits } from './credits';
import type { Database, DbClient } from './db';

/** Shape of the `jobs.meta` column. */
type JobMeta = Database['public']['Tables']['jobs']['Insert']['meta'];

export const QUEUE_NAMES = ['text', 'image', 'export', 'audio', 'system'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const JOB_TYPES = [
  'series_plan',
  'book',
  'chapter',
  'enhance',
  'suggestions',
  'rewrite',
  'metadata',
  'arc_extend',
  'cover',
  'template_cover',
  'export_book',
  'export_series',
  'box_set',
  'audiobook',
  'export_cleanup',
  'trash_purge',
  'stuck_reaper',
  'seed_templates',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_QUEUE: Record<JobType, QueueName> = {
  series_plan: 'text',
  book: 'text',
  chapter: 'text',
  enhance: 'text',
  suggestions: 'text',
  rewrite: 'text',
  metadata: 'text',
  arc_extend: 'text',
  cover: 'image',
  template_cover: 'image',
  export_book: 'export',
  export_series: 'export',
  box_set: 'export',
  audiobook: 'audio',
  export_cleanup: 'system',
  trash_purge: 'system',
  stuck_reaper: 'system',
  seed_templates: 'system',
};

/** Interactive jobs jump the queue; long batch work (template seeding) goes last. */
export const JOB_PRIORITY: Partial<Record<JobType, number>> = {
  enhance: 1,
  suggestions: 1,
  rewrite: 1,
  metadata: 1,
  book: 5,
  series_plan: 5,
  cover: 5,
  export_book: 5,
  export_series: 5,
  box_set: 5,
  audiobook: 5,
  seed_templates: 10,
};

/** Export retries are pointless (deterministic Chromium render), so they get one fewer. */
export const JOB_ATTEMPTS: Partial<Record<JobType, number>> = {
  export_book: 2,
  export_series: 2,
  box_set: 2,
};

export function queueForJob(type: JobType): QueueName {
  return JOB_QUEUE[type];
}

/** Parse REDIS_URL into the options both ioredis and BullMQ accept. */
export function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const dbPath = url.pathname.replace(/^\//, '');
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: dbPath ? Number(dbPath) : 0,
    // BullMQ blocks commands in its workers unless this is null.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export type Queues = Record<QueueName, Queue>;

export function createQueues(connection: ConnectionOptions): Queues {
  const queues = {} as Queues;
  for (const name of QUEUE_NAMES) {
    queues[name] = new Queue(name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return queues;
}

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all(Object.values(queues).map((q) => q.close()));
}

/** `book-3f2a…-v1` — BullMQ job ids must not contain `:`. */
export function idempotencyKey(type: JobType, refId: string | null, userId: string, version = 1) {
  return `${type}-${refId ?? userId}-v${version}`.replace(/:/g, '-');
}

export interface EnqueueJobInput {
  type: JobType;
  /** The entity the job works on (book id, series id, …). Null for user-scoped jobs. */
  refId: string | null;
  userId: string;
  /** Whose pool is charged (agency clients charge their owner's pool). */
  source: CreditSource;
  action: CreditAction;
  amount: number;
  version?: number;
  payload?: Record<string, unknown>;
  reason?: string;
  /** Free jobs (re-compose, cleanup) skip the credit reservation entirely. */
  skipCredits?: boolean;
  /** Book jobs only: max book generations per user per UTC day (entitlements.dailyBookCap). */
  dailyBookCap?: number;
}

/**
 * Daily book cap (PRD §4.3): counts the user's book jobs created since 00:00 UTC. Failed and
 * cancelled jobs were refunded, so they do not use up the allowance.
 */
async function assertUnderDailyBookCap(db: DbClient, userId: string, cap: number): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await db
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'book')
    .gte('created_at', startOfDay.toISOString())
    .not('status', 'in', '(failed,cancelled)');
  if (error) throw new Error(`Could not check the daily book limit: ${error.message}`);

  if ((count ?? 0) >= cap) {
    throw new AppError(
      'LIMIT_REACHED',
      `You've reached today's limit of ${cap} books. It resets at midnight UTC.`,
    );
  }
}
export interface EnqueueJobResult {
  jobId: string;
  /** True when an identical job already existed (double click) — nothing was charged. */
  deduplicated: boolean;
  ledgerId: number | null;
}

/**
 * Insert the job row, reserve its credits and push it to BullMQ.
 * Throws AppError with INSUFFICIENT_CREDITS / CLIENT_ALLOTMENT_EXHAUSTED / JOB_ALREADY_RUNNING /
 * QUEUE_UNAVAILABLE; in every failure case the DB and the credit ledger are left clean.
 */
export async function enqueueJob(
  db: DbClient,
  queues: Queues,
  input: EnqueueJobInput,
): Promise<EnqueueJobResult> {
  if (input.type === 'book' && input.dailyBookCap !== undefined) {
    await assertUnderDailyBookCap(db, input.userId, input.dailyBookCap);
  }

  const baseKey = idempotencyKey(input.type, input.refId, input.userId, input.version ?? 1);
  let key = baseKey;
  let jobId: string | null = null;

  // Two attempts: a duplicate on a *finished* job means "the user wants this again", so the key is
  // bumped once and the insert retried. A duplicate on a live job is a real double click.
  for (let attempt = 0; attempt < 2 && !jobId; attempt++) {
    const inserted = await db
      .from('jobs')
      .insert({
        user_id: input.userId,
        type: input.type,
        ref_id: input.refId,
        status: 'queued',
        idempotency_key: key,
        credits_reserved: input.amount,
        meta: (input.payload ?? {}) as JobMeta,
      })
      .select('id')
      .single();

    if (!inserted.error && inserted.data) {
      jobId = inserted.data.id;
      break;
    }

    const message = inserted.error?.message ?? '';

    // The per-user "one book job at a time" partial unique index.
    if (message.includes('jobs_one_active_book_per_user')) {
      throw new AppError(
        'JOB_ALREADY_RUNNING',
        'You already have a book generation running. Wait for it to finish or cancel it.',
      );
    }

    if (inserted.error?.code === '23505') {
      const existing = await db
        .from('jobs')
        .select('id, ledger_id, status')
        .eq('idempotency_key', key)
        .maybeSingle();

      if (existing.data) {
        const finished =
          existing.data.status === 'completed' ||
          existing.data.status === 'failed' ||
          existing.data.status === 'cancelled';

        if (!finished) {
          return { jobId: existing.data.id, deduplicated: true, ledgerId: existing.data.ledger_id };
        }

        // Retry of a finished job: bump the key so the work can run again.
        key = `${baseKey}-r${Date.now().toString(36)}`;
        continue;
      }
    }

    throw new Error(`Failed to create the job: ${message}`);
  }

  if (!jobId) throw new Error('Failed to create the job.');

  let ledgerId: number | null = null;
  if (!input.skipCredits) {
    try {
      ledgerId = await reserveCredits(db, {
        source: input.source,
        amount: input.amount,
        jobId,
        reason: input.reason ?? `${input.type} (${input.action})`,
      });
    } catch (err) {
      await db.from('jobs').delete().eq('id', jobId);
      throw err instanceof AppError ? err : mapCreditError(err as { message: string });
    }
  }

  try {
    await queues[queueForJob(input.type)].add(
      input.type,
      {
        jobId,
        userId: input.userId,
        refId: input.refId,
        ledgerId,
        ...(input.payload ?? {}),
      },
      {
        jobId: key,
        priority: JOB_PRIORITY[input.type],
        attempts: JOB_ATTEMPTS[input.type] ?? 3,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );
  } catch (err) {
    // The job never reached the queue: give the credits back and close the row.
    if (ledgerId) await refundCredits(db, ledgerId, 'Queue unavailable').catch(() => undefined);
    await db
      .from('jobs')
      .update({
        status: 'cancelled',
        error: 'The job queue was unavailable. Your credits were refunded.',
        finished_at: new Date().toISOString(),
        ledger_id: ledgerId,
      })
      .eq('id', jobId);
    throw new AppError(
      'QUEUE_UNAVAILABLE',
      'The generation queue is unavailable right now. Your credits were refunded — please try again.',
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }

  await db.from('jobs').update({ ledger_id: ledgerId }).eq('id', jobId);
  return { jobId, deduplicated: false, ledgerId };
}
