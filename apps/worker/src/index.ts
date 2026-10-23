/**
 * Worker entrypoint (T2.6).
 *
 * Boots one BullMQ worker per enabled queue, wires the processors, registers the 10-minute stuck
 * reaper, exposes `/healthz`, and shuts down gracefully on SIGTERM (in-flight chapters finish).
 */
import { createServer } from 'node:http';
import { Worker, type Job } from 'bullmq';
import {
  closeQueues,
  createAdminClient,
  createQueues,
  redisConnectionOptions,
  QUEUE_NAMES,
  type QueueName,
  type Queues,
} from '@booksaga/core';
import { createAi, type AiClient } from '@booksaga/ai';
import { getServerEnv, type ServerEnv } from '@booksaga/shared';
import { JobRunner, loadJob } from './lib/jobs';
import { runStuckReaper } from './cron/reaper';
import { processBook } from './processors/text/book';
import { processArcExtend } from './processors/text/arcExtend';
import { processEnhance } from './processors/text/enhance';
import { processSuggestions } from './processors/text/suggestions';
import { processRewrite } from './processors/text/rewrite';
import { processMetadata } from './processors/text/metadata';
import { processTrashPurge } from './processors/system/trashPurge';
import { processCover } from './processors/image/cover';
import { processBookExport } from './processors/export/book';
import { processExportCleanup } from './processors/system/exportCleanup';
import { processBoxSet } from './processors/export/boxset';
import { processAudiobook } from './processors/audio/audiobook';

interface Runtime {
  env: ServerEnv;
  ai: AiClient;
  /** Cheaper model for structured steps; same as `ai` when no fast model is configured. */
  aiFast: AiClient;
  queues: Queues;
  workers: Worker[];
  db: ReturnType<typeof createAdminClient>;
}

function concurrencyFor(env: ServerEnv): Record<QueueName, number> {
  return {
    text: env.WORKER_TEXT_CONCURRENCY,
    image: env.WORKER_IMAGE_CONCURRENCY,
    export: env.WORKER_EXPORT_CONCURRENCY,
    audio: env.WORKER_AUDIO_CONCURRENCY,
    system: 1,
  };
}

async function dispatch(runtime: Runtime, job: Job, runner: JobRunner): Promise<void> {
  const type = job.name;

  switch (type) {
    case 'book':
      return processBook(
        { db: runtime.db, ai: runtime.ai, aiFast: runtime.aiFast, queues: runtime.queues },
        runner,
        job.data as { jobId: string; userId: string; refId: string; ledgerId: number },
      );
    case 'enhance':
      return processEnhance({ ai: runtime.ai }, runner, job.data as never);
    case 'arc_extend':
      return processArcExtend(
        { db: runtime.db, ai: runtime.ai },
        runner,
        job.data as { jobId: string; userId: string; refId: string; count: number },
      );
    case 'suggestions':
      return processSuggestions({ ai: runtime.ai }, runner, job.data as never);
    case 'rewrite':
      return processRewrite(
        { db: runtime.db, ai: runtime.ai },
        runner,
        job.data as {
          jobId: string;
          userId: string;
          refId: string;
          mode: 'rewrite' | 'expand' | 'shorten' | 'regenerate';
          instruction?: string;
          selection?: string;
        },
      );
    case 'metadata':
      return processMetadata(
        { db: runtime.db, ai: runtime.aiFast },
        runner,
        job.data as { jobId: string; userId: string; refId: string },
      );
    case 'stuck_reaper': {
      const summary = await runStuckReaper(runtime.db, runtime.queues);
      console.log(`[reaper] requeued=${summary.requeued} failed=${summary.failed}`);
      return;
    }
    case 'export_book':
      return processBookExport(
        { db: runtime.db },
        runner,
        job.data as { jobId: string; userId: string; refId: string; formats?: ('epub' | 'docx' | 'metadata')[] },
      );
    case 'cover':
      return processCover(
        { db: runtime.db, ai: runtime.ai },
        runner,
        job.data as { jobId: string; userId: string; refId: string; variation?: boolean },
      );
    case 'audiobook':
      return processAudiobook(
        { db: runtime.db, ai: runtime.ai },
        runner,
        job.data as {
          jobId: string;
          userId: string;
          refId: string;
          audiobookId: string;
          voice: string;
          speed: number;
        },
      );
    case 'box_set':
      return processBoxSet(
        { db: runtime.db, ai: runtime.ai },
        runner,
        job.data as {
          jobId: string;
          userId: string;
          refId: string;
          boxSetId: string;
          bookIds: string[];
          title: string;
          withCover: boolean;
        },
      );
    case 'export_cleanup':
      return processExportCleanup({ db: runtime.db }, runner);
    case 'trash_purge':
      return processTrashPurge({ db: runtime.db }, runner);
    default:
      throw new Error(`No processor registered for job type "${type}" yet.`);
  }
}

async function handleJob(runtime: Runtime, job: Job): Promise<void> {
  const data = job.data as { jobId?: string };
  if (!data?.jobId) throw new Error(`Job ${job.id} is missing a jobId in its payload.`);

  const row = await loadJob(runtime.db, data.jobId);

  // Cancelled while it sat in the queue: never start it.
  if (row.status === 'cancelled') {
    console.log(`[worker] skipping cancelled job ${row.id}`);
    return;
  }

  const runner = new JobRunner(runtime.db, row);
  await runner.start(job.attemptsMade);

  try {
    await dispatch(runtime, job, runner);
    if (!runner.finished) await runner.complete();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.opts.attempts ?? 3;
    const isFinal = job.attemptsMade + 1 >= attempts;

    runner.stopHeartbeat();

    if (isFinal) {
      console.error(`[worker] job ${row.id} (${row.type}) failed permanently: ${message}`);
      await runner.fail(message);
      if (row.type === 'book' && row.ref_id) {
        await runtime.db.from('books').update({ status: 'failed' }).eq('id', row.ref_id);
      }
    } else {
      console.warn(
        `[worker] job ${row.id} (${row.type}) failed attempt ${job.attemptsMade + 1}/${attempts}: ${message}`,
      );
      await runner.retryLater(message, job.attemptsMade + 1);
    }

    throw err;
  }
}

function startHealthServer(runtime: Runtime): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    if (req.url !== '/healthz') {
      res.writeHead(404).end('not found');
      return;
    }
    try {
      const counts = await Promise.all(
        QUEUE_NAMES.map(async (name) => [name, await runtime.queues[name].getJobCounts()] as const),
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          aiMode: runtime.env.AI_MODE,
          queues: Object.fromEntries(counts),
        }),
      );
    } catch (err) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(runtime.env.WORKER_HEALTH_PORT, () => {
    console.log(`[worker] healthz on http://127.0.0.1:${runtime.env.WORKER_HEALTH_PORT}/healthz`);
  });
  return server;
}

async function main(): Promise<void> {
  const env = getServerEnv();
  const db = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const ai = createAi({
    mode: env.AI_MODE,
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_TEXT_MODEL,
    db,
  });

  // Structured, low-creativity steps run on the optional fast model (same key, same usage log).
  const aiFast =
    env.OPENROUTER_FAST_MODEL && env.OPENROUTER_FAST_MODEL !== env.OPENROUTER_TEXT_MODEL
      ? createAi({
          mode: env.AI_MODE,
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_FAST_MODEL,
          db,
        })
      : ai;

  const connection = redisConnectionOptions(env.REDIS_URL);
  const queues = createQueues(connection);
  const enabled = new Set(env.WORKER_QUEUES.split(',').map((q) => q.trim()));
  const concurrency = concurrencyFor(env);

  const runtime: Runtime = { env, ai, aiFast, queues, workers: [], db };

  for (const name of QUEUE_NAMES) {
    if (!enabled.has(name)) continue;
    const worker = new Worker(name, (job) => handleJob(runtime, job), {
      connection,
      concurrency: concurrency[name],
    });
    worker.on('failed', (job, err) => {
      console.error(`[worker:${name}] ${job?.id ?? '?'} failed: ${err.message}`);
    });
    worker.on('error', (err) => console.error(`[worker:${name}] error:`, err));
    runtime.workers.push(worker);
  }

  // Reaper: BullMQ v6 job scheduler (the old `repeat` job option was removed), idempotent by id.
  await queues.system
    .upsertJobScheduler(
      'stuck-reaper',
      { every: 10 * 60 * 1000 },
      {
        name: 'stuck_reaper',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    )
    .catch((err) => console.error('[worker] could not register the reaper:', err));

  // Export cleanup: files past their 30-day window (T5.8).
  await queues.system
    .upsertJobScheduler(
      'export-cleanup',
      { every: 24 * 60 * 60 * 1000 },
      {
        name: 'export_cleanup',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    )
    .catch((err) => console.error('[worker] could not register export cleanup:', err));

  // Trash purge: series deleted more than 30 days ago (T3.3).
  await queues.system
    .upsertJobScheduler(
      'trash-purge',
      { every: 24 * 60 * 60 * 1000 },
      {
        name: 'trash_purge',
        data: {},
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    )
    .catch((err) => console.error('[worker] could not register the trash purge:', err));

  const server = startHealthServer(runtime);

  console.log(
    `[worker] up · queues=${[...enabled].join(',')} · text=${concurrency.text} · ai_mode=${env.AI_MODE}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, draining…`);
    server.close();
    await Promise.all(runtime.workers.map((w) => w.close()));
    await closeQueues(queues);
    console.log('[worker] stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
