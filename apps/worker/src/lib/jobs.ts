/** Job lifecycle and per-execution database fencing shared by every processor. */
import { randomUUID } from 'node:crypto';
import { createAdminClient, type DbClient, type Database } from '@booksaga/core';

export type JobRow = Database['public']['Tables']['jobs']['Row'];
export type JobMeta = JobRow['meta'];
const HEARTBEAT_MS = 15_000;

export class JobLeaseLostError extends Error {
  constructor() {
    super('JOB_LEASE_LOST');
    this.name = 'JobLeaseLostError';
  }
}

export interface NotificationInput {
  title: string;
  body?: string;
  link?: string;
  type?: string;
}

interface JobScope {
  url: string;
  key: string;
  /** Compare Redis's lock with this BullMQ execution's token; errors fail closed. */
  ownsLock?: () => Promise<boolean>;
}

export class JobRunner {
  readonly executionToken = randomUUID();
  readonly db: DbClient;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private done = false;
  private started = false;
  private lost = false;
  private meta: JobMeta;

  constructor(
    private readonly controlDb: DbClient,
    readonly job: JobRow,
    private readonly scope: JobScope,
  ) {
    this.meta = job.meta ?? {};
    this.db = createAdminClient(scope.url, scope.key, {
      headers: { 'x-worker-job': job.id, 'x-worker-token': this.executionToken },
      fetch: async (input, init) => {
        await this.assertQueueLock();
        const response = await fetch(input, init);
        if (response.status === 409 && (await response.clone().text()).includes('JOB_LEASE_LOST')) {
          this.lost = true;
          this.stopHeartbeat();
          throw new JobLeaseLostError();
        }
        return response;
      },
    });
  }

  get jobId(): string {
    return this.job.id;
  }
  get userId(): string {
    return this.job.user_id;
  }
  get ledgerId(): number | null {
    return this.job.ledger_id;
  }
  get finished(): boolean {
    return this.done;
  }
  get leaseLost(): boolean {
    return this.lost;
  }

  async assertQueueLock(): Promise<void> {
    let ownsLock = !this.lost;
    try {
      if (ownsLock && this.scope.ownsLock) ownsLock = await this.scope.ownsLock();
    } catch {
      ownsLock = false;
    }
    if (!ownsLock) {
      this.lost = true;
      this.stopHeartbeat();
      throw new JobLeaseLostError();
    }
  }

  /** CAS the observed execution token: concurrent snapshots cannot both win. */
  async start(attempt = 0): Promise<boolean> {
    await this.assertQueueLock();
    let query = this.controlDb
      .from('jobs')
      .update({
        status: 'active',
        execution_token: this.executionToken,
        started_at: this.job.started_at ?? new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        attempts: attempt,
        error: null,
      })
      .eq('id', this.job.id)
      .eq('status', this.job.status);
    query = this.job.execution_token
      ? query.eq('execution_token', this.job.execution_token)
      : query.is('execution_token', null);
    if (this.job.status === 'queued' && !(this.job.type === 'book' && this.job.started_at)) {
      query = query.eq('cancel_requested', false);
    }
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw new Error(`Could not start job: ${error.message}`);
    if (!data) return false;
    this.started = true;
    const { error: guardError } = await this.db.rpc('guard_worker_request');
    if (guardError) throw new Error(`Worker fencing is unavailable: ${guardError.message}`);
    this.timer = setInterval(() => {
      void this.heartbeat().catch((error) => {
        this.stopHeartbeat();
        if (!(error instanceof JobLeaseLostError)) console.error('[jobs] heartbeat failed', error);
      });
    }, HEARTBEAT_MS);
    this.timer.unref?.();
    return true;
  }

  async heartbeat(): Promise<void> {
    if (this.stopped) return;
    const { error } = await this.db
      .from('jobs')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', this.job.id);
    if (error) throw new Error(`Heartbeat failed: ${error.message}`);
  }

  async progress(
    percent: number,
    stepLabel: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    this.meta = { ...(this.meta as Record<string, unknown>), ...meta } as JobMeta;
    const { error } = await this.db
      .from('jobs')
      .update({
        progress: Math.max(0, Math.min(100, Math.round(percent))),
        step_label: stepLabel.slice(0, 200),
        meta: this.meta,
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', this.job.id);
    if (error) throw new Error(`Could not save progress: ${error.message}`);
  }

  async isCancelRequested(): Promise<boolean> {
    const { data, error } = await this.db
      .from('jobs')
      .select('cancel_requested')
      .eq('id', this.job.id)
      .single();
    if (error) throw new Error(`Could not read cancellation: ${error.message}`);
    return data.cancel_requested;
  }

  async complete(notification?: NotificationInput): Promise<void> {
    await this.finish('completed', false, undefined, notification);
  }

  async fail(message: string, notification?: NotificationInput): Promise<void> {
    await this.finish('failed', true, message, notification);
  }

  async cancel(options: { refund: boolean; reason?: string }): Promise<void> {
    await this.finish('cancelled', options.refund, options.reason ?? 'Cancelled by user');
  }

  private async finish(
    status: string,
    refund: boolean,
    message?: string,
    notification?: NotificationInput,
  ): Promise<void> {
    if (!this.started || this.done) throw new Error('Job is not running');
    const { error } = await this.db.rpc('finish_worker_job', {
      p_job: this.job.id,
      p_token: this.executionToken,
      p_status: status,
      p_refund: refund,
      p_message: message,
      p_notification: notification ? { ...notification } : undefined,
    });
    if (error) throw new Error(`Could not settle job: ${error.message}`);
    this.done = true;
    this.stopHeartbeat();
  }

  async retryLater(message: string, attempt: number): Promise<void> {
    const { error } = await this.db
      .from('jobs')
      .update({
        attempts: attempt,
        error: message.slice(0, 2000),
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', this.job.id);
    if (error) throw new Error(`Could not record retry: ${error.message}`);
  }

  stopHeartbeat(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Startup must fail before processing if the PostgREST ownership hook is not loaded. */
export async function verifyWorkerFencing(url: string, key: string): Promise<void> {
  const probe = createAdminClient(url, key, {
    headers: { 'x-worker-job': randomUUID(), 'x-worker-token': randomUUID() },
  });
  const { error } = await probe.from('jobs').select('id').limit(0);
  if (!error?.message.includes('JOB_LEASE_LOST')) {
    throw new Error(
      'Worker fencing hook is not active. Apply migration 13 and reload the Data API configuration.',
    );
  }
}

export async function loadJob(db: DbClient, jobId: string): Promise<JobRow> {
  const { data, error } = await db.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(`Failed to load job ${jobId}: ${error.message}`);
  if (!data) throw new Error(`Job ${jobId} not found`);
  return data;
}
