/**
 * T2.21 — live cost calibration.
 *
 * Generates one book per length preset with the REAL model and records time, tokens and cost per
 * step from `ai_usage_log`. Run with the worker in `AI_MODE=live`:
 *
 *   pnpm tsx --env-file=.env.local scripts/calibrate.ts short
 *   pnpm tsx --env-file=.env.local scripts/calibrate.ts smoke     # one cheap enhance call
 *
 * Output goes to stdout and is appended to docs/COST_REPORT.md by the caller.
 */
import {
  createAdminClient,
  createQueues,
  enqueueJob,
  redisConnectionOptions,
  type DbClient,
} from '@booksaga/core';
import { bookCreditAction, type LengthPreset } from '@booksaga/shared';

const env = process.env;
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase env missing');

const db: DbClient = createAdminClient(url, serviceKey);
const queues = createQueues(redisConnectionOptions(env.REDIS_URL ?? 'redis://localhost:6379'));

const ADMIN_EMAIL = env.CALIBRATION_EMAIL ?? 'admin@local.test';

async function adminId(): Promise<string> {
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();
  if (error || !data) throw new Error(`admin not found: ${error?.message}`);
  return data.id;
}

async function waitForJob(jobId: string, timeoutMs = 30 * 60 * 1000) {
  const started = Date.now();
  for (;;) {
    const { data } = await db
      .from('jobs')
      .select('id, status, progress, step_label, error')
      .eq('id', jobId)
      .maybeSingle();
    if (!data) throw new Error('job vanished');
    if (['completed', 'failed', 'cancelled'].includes(data.status)) return data;
    if (Date.now() - started > timeoutMs) throw new Error('timeout waiting for the job');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function usageForJob(jobId: string) {
  const { data } = await db
    .from('ai_usage_log')
    .select('purpose, input_tokens, cached_input_tokens, output_tokens, cost_usd, provider, model')
    .eq('job_id', jobId);
  const rows = data ?? [];
  const byPurpose = new Map<string, { calls: number; input: number; output: number; cost: number }>();
  for (const row of rows) {
    const purpose = row.purpose ?? 'unknown';
    const entry = byPurpose.get(purpose) ?? { calls: 0, input: 0, output: 0, cost: 0 };
    entry.calls += 1;
    entry.input += row.input_tokens ?? 0;
    entry.output += row.output_tokens ?? 0;
    entry.cost += Number(row.cost_usd ?? 0);
    byPurpose.set(purpose, entry);
  }
  return {
    calls: rows.length,
    input: rows.reduce((n, r) => n + (r.input_tokens ?? 0), 0),
    output: rows.reduce((n, r) => n + (r.output_tokens ?? 0), 0),
    cost: rows.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0),
    byPurpose: Object.fromEntries(byPurpose),
  };
}

async function smoke() {
  const userId = await adminId();
  const { data: job, error } = await db
    .from('jobs')
    .insert({
      user_id: userId,
      type: 'enhance',
      ref_id: null,
      status: 'queued',
      idempotency_key: `enhance-smoke-${Date.now()}`,
      credits_reserved: 0,
      meta: {
        idea: 'A lighthouse keeper finds a second logbook written in her own handwriting, dated ten years in the future.',
        genre: 'Mystery & Thriller',
        tone: 'Dark & Gritty',
        audience: 'Adults',
      },
    })
    .select('id')
    .single();
  if (error || !job) throw new Error(error?.message);

  await queues.text.add('enhance', { jobId: job.id, userId, refId: null, ledgerId: null }, { attempts: 1 });

  const result = await waitForJob(job.id, 180_000);
  const { data: row } = await db.from('jobs').select('meta').eq('id', job.id).single();
  console.log(JSON.stringify({ status: result.status, error: result.error, meta: row?.meta }, null, 2));
}

async function calibrate(preset: LengthPreset) {
  const userId = await adminId();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const { data: series, error: seriesError } = await db
    .from('series')
    .insert({
      user_id: userId,
      title: `Calibration ${preset} ${stamp}`,
      idea:
        'A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her estranged niece inherits a ledger that proves half the city bought its reputation.',
      genre: 'Fantasy',
      is_fiction: true,
      tone: 'Engaging & Cinematic',
      audience: 'Adults',
      pen_name: 'Calibration Author',
      planned_books: 3,
      status: 'draft',
    })
    .select('id')
    .single();
  if (seriesError || !series) throw new Error(seriesError?.message);

  const { data: book, error: bookError } = await db
    .from('books')
    .insert({
      series_id: series.id,
      part_number: 1,
      premise: 'The debt comes due.',
      length_preset: preset,
      status: 'ready',
    })
    .select('id')
    .single();
  if (bookError || !book) throw new Error(bookError?.message);

  const { data: cost } = await db
    .from('credit_costs')
    .select('credits')
    .eq('action', bookCreditAction(preset))
    .maybeSingle();

  const started = Date.now();
  const queued = await enqueueJob(db, queues, {
    type: 'book',
    refId: book.id,
    userId,
    source: { ownerId: userId, pool: 'main' },
    action: bookCreditAction(preset),
    amount: cost?.credits ?? 10,
    payload: { part: 1 },
    reason: `Calibration ${preset}`,
  });

  const job = await waitForJob(queued.jobId);
  const elapsed = Math.round((Date.now() - started) / 1000);
  const usage = await usageForJob(queued.jobId);

  const { data: chapters } = await db
    .from('chapters')
    .select('word_count')
    .eq('book_id', book.id);
  const words = (chapters ?? []).reduce((n, c) => n + (c.word_count ?? 0), 0);

  console.log(
    JSON.stringify(
      {
        preset,
        seriesId: series.id,
        bookId: book.id,
        jobId: queued.jobId,
        status: job.status,
        error: job.error,
        seconds: elapsed,
        chapters: (chapters ?? []).length,
        words,
        usage,
        costPerBook: Number(usage.cost.toFixed(4)),
        costPer1kWords: words ? Number(((usage.cost / words) * 1000).toFixed(4)) : null,
      },
      null,
      2,
    ),
  );
}

const mode = process.argv[2] ?? 'short';
try {
  if (mode === 'smoke') await smoke();
  else await calibrate(mode as LengthPreset);
} finally {
  await Promise.all(Object.values(queues).map((q) => q.close()));
}
