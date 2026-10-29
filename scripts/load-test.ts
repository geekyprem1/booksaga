import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import {
  createAdminClient,
  createQueues,
  closeQueues,
  enqueueJob,
  redisConnectionOptions,
} from '@booksaga/core';
import { getServerEnv } from '@booksaga/shared';

const { values } = parseArgs({
  options: {
    jobs: { type: 'string', default: '200' },
    latency: { type: 'string', default: '100' },
    concurrency: { type: 'string', default: '50' },
  },
});
const total = Number(values.jobs),
  latency = Number(values.latency),
  concurrency = Number(values.concurrency);
if (
  ![total, latency, concurrency].every(Number.isInteger) ||
  total < 1 ||
  total > 200 ||
  latency < 0 ||
  concurrency < 1 ||
  concurrency > 200
)
  throw new Error('Invalid load-test options');
const env = getServerEnv();
if (
  env.AI_MODE !== 'mock' ||
  !['localhost', '127.0.0.1'].includes(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname)
) {
  throw new Error(
    'Load test requires AI_MODE=mock and a local Supabase URL. It never runs against production.',
  );
}
const db = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const prefix = `load-test-${randomUUID()}`;
const queues = createQueues(redisConnectionOptions(env.REDIS_URL), { prefix });
const users: string[] = [],
  books: string[] = [],
  jobs: string[] = [];
let worker: ChildProcess | undefined;

try {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (cursor < total) {
        const index = cursor++;
        const created = await db.auth.admin.createUser({
          email: `${prefix}-${index}@booksaga.test`,
          password: `Pw-${randomUUID()}`,
          email_confirm: true,
        });
        if (created.error || !created.data.user)
          throw new Error(created.error?.message ?? 'Could not create test account');
        const id = created.data.user.id;
        users.push(id);
        const plan = await db
          .from('user_plans')
          .insert({ user_id: id, plan_code: 'fe', source: 'manual' })
          .select('id')
          .single();
        if (plan.error) throw plan.error;
        const grant = await db.rpc('grant_plan_credits', { p_user_plan: plan.data!.id });
        if (grant.error) throw grant.error;
        const series = await db
          .from('series')
          .insert({
            user_id: id,
            title: `Load test ${index}`,
            idea: 'A librarian discovers a missing map in a coastal town.',
            genre: 'Fantasy',
            pen_name: 'Test Author',
            planned_books: 3,
          })
          .select('id')
          .single();
        if (series.error) throw series.error;
        const book = await db
          .from('books')
          .insert({
            series_id: series.data!.id,
            part_number: 1,
            title: `Book ${index}`,
            status: 'ready',
            length_preset: 'short',
          })
          .select('id')
          .single();
        if (book.error) throw book.error;
        books.push(book.data!.id);
        const queued = await enqueueJob(db, queues, {
          type: 'book',
          userId: id,
          refId: book.data!.id,
          action: 'book_short',
          amount: 10,
          source: { ownerId: id, pool: 'main' },
        });
        jobs.push(queued.jobId);
      }
    }),
  );
  console.log(
    `Queued ${jobs.length} Short-book jobs; starting ${concurrency} worker slots with ${latency}ms per mock AI call.`,
  );
  const started = Date.now();
  worker = fork(
    resolve('apps/worker/src/testing/load-worker.ts'),
    [prefix, String(latency), String(concurrency)],
    {
      execArgv: ['--import', 'tsx'],
      env: { ...process.env, AI_MODE: 'mock' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  worker.stdout?.on('data', (data) => process.stdout.write(data));
  worker.stderr?.on('data', (data) => process.stderr.write(data));
  const deadline = started + 15 * 60000;
  let lastLog = 0;
  while (true) {
    if (worker.exitCode !== null) throw new Error(`Worker exited (${worker.exitCode})`);
    const counts = await queues.text.getJobCounts(
      'waiting',
      'prioritized',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    if (Date.now() - lastLog > 10000) {
      console.log(JSON.stringify(counts));
      lastLog = Date.now();
    }
    if ((counts.completed ?? 0) + (counts.failed ?? 0) === total) break;
    if (Date.now() > deadline) throw new Error('Queue did not drain within 15 minutes');
    await setTimeout(1000);
  }
  const elapsedMs = Date.now() - started;
  const [jobRows, bookRows, ledger, balances] = await Promise.all([
    db.from('jobs').select('id,status,error').in('id', jobs),
    db.from('books').select('id,status,word_count').in('id', books),
    db.from('credit_ledger').select('job_id,status,amount').in('job_id', jobs),
    db.from('credit_balances').select('user_id,balance').in('user_id', users).eq('pool', 'main'),
  ]);
  for (const result of [jobRows, bookRows, ledger, balances]) if (result.error) throw result.error;
  const report = {
    date: new Date().toISOString(),
    mode: 'mock',
    jobs: total,
    concurrency,
    artificialLatencyMs: latency,
    queueDrainMs: elapsedMs,
    jobsPerMinute: Number(((total * 60000) / elapsedMs).toFixed(2)),
    completed: jobRows.data!.filter((row) => row.status === 'completed').length,
    generatedBooks: bookRows.data!.filter((row) => row.status === 'generated' && row.word_count > 0)
      .length,
    reservations: ledger.data!.length,
    committed: ledger.data!.filter((row) => row.status === 'committed').length,
    remainingReservations: ledger.data!.filter((row) => row.status === 'reserved').length,
    reservedAmount: -ledger.data!.reduce((sum, row) => sum + row.amount, 0),
    balanceTotal: balances.data!.reduce((sum, row) => sum + row.balance, 0),
    expectedBalanceTotal: total * 290,
    passed: false,
  };
  report.passed =
    report.completed === total &&
    report.generatedBooks === total &&
    report.committed === total &&
    report.reservations === total &&
    report.remainingReservations === 0 &&
    report.reservedAmount === total * 10 &&
    report.balanceTotal === report.expectedBalanceTotal;
  await writeFile('docs/LOAD_TEST_REPORT.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error('Load-test reconciliation failed');
} finally {
  if (worker && worker.exitCode === null) {
    const exited = new Promise<void>((resolve) => worker!.once('exit', () => resolve()));
    worker.kill();
    await exited;
  }
  await queues.text.obliterate({ force: true });
  await closeQueues(queues);
  for (let i = 0; i < users.length; i += 10) {
    const deleted = await Promise.all(
      users.slice(i, i + 10).map((id) => db.auth.admin.deleteUser(id)),
    );
    for (const result of deleted)
      if (result.error) console.error('Test account cleanup failed:', result.error.message);
  }
}
