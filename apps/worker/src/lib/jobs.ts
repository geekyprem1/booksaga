/**
 * Job lifecycle (T2.7): every processor runs inside a `JobRunner`.
 *
 *   start()  -> status=active, started_at, heartbeat every 15s
 *   progress -> progress %, step_label, meta (read by the UI over Realtime)
 *   complete -> commit_credits + status=completed + notification
 *   fail     -> refund_credits + status=failed + notification
 *   cancel   -> status=cancelled, refund only when the caller says so (PRD §4.2)
 *
 * A killed worker leaves an `active` row with a stale `heartbeat_at`; the stuck reaper picks it up.
 */
import { commitCredits, refundCredits, type DbClient, type Database } from '@booksaga/core';

export type JobRow = Database['public']['Tables']['jobs']['Row'];
export type JobMeta = Database['public']['Tables']['jobs']['Row']['meta'];

const HEARTBEAT_MS = 15_000;

export interface NotificationInput {
  title: string;
  body?: string;
  link?: string;
  type?: string;
}

export class JobRunner {
  readonly job: JobRow;
  private readonly db: DbClient;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private done = false;
  private meta: JobMeta;

  constructor(db: DbClient, job: JobRow) {
    this.db = db;
    this.job = job;
    this.meta = job.meta ?? {};
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

  /** True once complete/fail/cancel ran — the wrapper must not finish the job twice. */
  get finished(): boolean {
    return this.done;
  }

  /** Marks the job active and starts the heartbeat. */
  async start(attempt = 0): Promise<void> {
    await this.db
      .from('jobs')
      .update({
        status: 'active',
        started_at: this.job.started_at ?? new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        attempts: attempt,
        error: null,
      })
      .eq('id', this.job.id);

    this.timer = setInterval(() => {
      void this.heartbeat();
    }, HEARTBEAT_MS);
    this.timer.unref?.();
  }

  async heartbeat(): Promise<void> {
    if (this.stopped) return;
    await this.db
      .from('jobs')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', this.job.id);
  }

  async progress(
    percent: number,
    stepLabel: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    this.meta = { ...(this.meta as Record<string, unknown>), ...meta } as JobMeta;
    await this.db
      .from('jobs')
      .update({
        progress: Math.max(0, Math.min(100, Math.round(percent))),
        step_label: stepLabel.slice(0, 200),
        meta: this.meta,
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', this.job.id);
  }

  /** Re-reads the row: the UI sets `cancel_requested` from the Cancel button. */
  async isCancelRequested(): Promise<boolean> {
    const { data } = await this.db
      .from('jobs')
      .select('cancel_requested')
      .eq('id', this.job.id)
      .maybeSingle();
    return data?.cancel_requested === true;
  }

  async complete(notification?: NotificationInput): Promise<void> {
    this.stopHeartbeat();
    this.done = true;
    if (this.job.ledger_id) {
      await commitCredits(this.db, this.job.ledger_id);
    }
    await this.db
      .from('jobs')
      .update({
        status: 'completed',
        progress: 100,
        finished_at: new Date().toISOString(),
        heartbeat_at: null,
        error: null,
      })
      .eq('id', this.job.id);

    if (notification) await this.notify(notification);
  }

  /** Final failure: refund the reservation, then mark failed. */
  async fail(message: string, notification?: NotificationInput): Promise<void> {
    this.stopHeartbeat();
    this.done = true;
    if (this.job.ledger_id) {
      await refundCredits(this.db, this.job.ledger_id, 'Job failed').catch((err) =>
        console.error('[jobs] refund failed', err),
      );
    }
    await this.db
      .from('jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        heartbeat_at: null,
        error: message.slice(0, 2000),
      })
      .eq('id', this.job.id);

    await this.notify(
      notification ?? {
        title: 'Generation failed',
        body: `${message.slice(0, 300)} Your credits have been refunded.`,
        type: 'job_failed',
      },
    );
  }

  /** Retryable failure: keep the row active (BullMQ will retry) and record the error. */
  async retryLater(message: string, attempt: number): Promise<void> {
    await this.db
      .from('jobs')
      .update({
        attempts: attempt,
        error: message.slice(0, 2000),
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', this.job.id);
  }

  /**
   * User cancelled. Refund rule (PRD §4.2): full refund below 20% of the work, otherwise the
   * completed work is charged. The caller decides which side of the line we are on.
   */
  async cancel(options: { refund: boolean; reason?: string }): Promise<void> {
    this.stopHeartbeat();
    this.done = true;
    if (this.job.ledger_id) {
      if (options.refund) {
        await refundCredits(this.db, this.job.ledger_id, options.reason ?? 'Cancelled by user');
      } else {
        await commitCredits(this.db, this.job.ledger_id);
      }
    }
    await this.db
      .from('jobs')
      .update({
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        heartbeat_at: null,
        step_label: 'Cancelled',
      })
      .eq('id', this.job.id);

    await this.notify({
      title: 'Generation cancelled',
      body: options.refund
        ? 'Your credits have been refunded.'
        : 'The work completed so far has been kept and charged.',
      type: 'job_cancelled',
    });
  }

  stopHeartbeat(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async notify(input: NotificationInput): Promise<void> {
    const { error } = await this.db.from('notifications').insert({
      user_id: this.job.user_id,
      type: input.type ?? 'job',
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 2000) ?? null,
      link: input.link ?? null,
    });
    if (error) console.warn(`[jobs] notification failed: ${error.message}`);
  }
}

export async function loadJob(db: DbClient, jobId: string): Promise<JobRow> {
  const { data, error } = await db.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(`Failed to load job ${jobId}: ${error.message}`);
  if (!data) throw new Error(`Job ${jobId} not found`);
  return data;
}
