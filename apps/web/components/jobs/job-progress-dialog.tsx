'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock3, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { JobSnapshot } from '@/lib/series/validation';
import { useJob, type JobTracking } from './use-job';

interface JobProgressDialogProps {
  jobId: string | null;
  title: string;
  description?: string;
  onClose: () => void;
  /** Called once per job when it reaches a terminal state. */
  onSettled?: (job: JobSnapshot) => void;
  /** Share an existing tracker instead of creating a second subscription. */
  tracking?: JobTracking;
}

const bookStages = [
  { label: 'Series bible', startsAt: 2 },
  { label: 'Book outline', startsAt: 5 },
  { label: 'Write chapters', startsAt: 10 },
  { label: 'Continuity review', startsAt: 88 },
  { label: 'Blurb & keywords', startsAt: 94 },
  { label: 'Finish manuscript', startsAt: 99 },
];

/** Progress reflects saved worker updates, not elapsed time or an estimated completion date. */
export function JobProgressDialog({
  jobId,
  title,
  description,
  onClose,
  onSettled,
  tracking,
}: JobProgressDialogProps) {
  const internalTracking = useJob(tracking ? null : jobId);
  const { job, error, isLoading, lastSyncedAt } = tracking ?? internalTracking;
  const settled = useRef(new Set<string>());
  const status = job?.status;

  useEffect(() => {
    if (!job || job.id !== jobId) return;
    if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') return;
    if (settled.current.has(job.id)) return;
    settled.current.add(job.id);
    onSettled?.(job);
  }, [job, jobId, status, onSettled]);

  const done = status === 'completed';
  const failed = status === 'failed';
  const cancelled = status === 'cancelled';
  const terminal = done || failed || cancelled;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!jobId || terminal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [jobId, terminal]);
  const queued = status === 'queued';
  const active = status === 'active';
  const progress = job?.progress ?? 0;
  const chaptersDone = typeof job?.meta.chaptersDone === 'number' ? job.meta.chaptersDone : null;
  const chaptersTotal = typeof job?.meta.chaptersTotal === 'number' ? job.meta.chaptersTotal : null;
  const chapterNumber = typeof job?.meta.chapterNumber === 'number' ? job.meta.chapterNumber : null;
  const currentStage = bookStages.reduce(
    (current, stage, index) => (progress >= stage.startsAt ? index : current),
    -1,
  );
  const heartbeat = job?.heartbeatAt ?? job?.startedAt;
  const heartbeatDelayed = active && heartbeat && now - Date.parse(heartbeat) > 60_000;
  const syncDelayed = !terminal && lastSyncedAt !== null && now - lastSyncedAt > 15_000;
  const statusLabel = done
    ? 'Completed'
    : failed
      ? 'Generation failed'
      : cancelled
        ? 'Cancelled'
        : queued
          ? 'Waiting to start'
          : active
            ? (job?.stepLabel ?? 'In progress')
            : error
              ? 'Unable to load progress'
              : isLoading
                ? 'Loading job status…'
                : 'No job status available';

  return (
    <Dialog open={Boolean(jobId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title={title} description={description} className="max-w-lg">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-3" role="status" aria-live="polite">
            {done ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-400" aria-hidden="true" />
            ) : failed || cancelled || (!job && error) ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden="true" />
            ) : queued ? (
              <Clock3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Loader2
                className="mt-0.5 size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{statusLabel}</p>
              {queued ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Your request is saved in the queue. It will begin when a worker picks it up. No
                  writing progress has been reported yet.
                </p>
              ) : null}
              {active && job?.stepLabel ? (
                <p className="mt-1 text-xs text-muted-foreground">Latest reported stage</p>
              ) : null}
            </div>
          </div>

          {job ? (
            <div className="flex flex-col gap-2">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Reported job progress"
                aria-valuetext={`${progress}% — ${statusLabel}`}
              >
                <div
                  className="h-full rounded-full bg-brand-gradient"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-col gap-1">
                  <span>
                    {queued ? 'Waiting in queue' : terminal ? statusLabel : 'Reported progress'}
                  </span>
                  {chaptersDone !== null && chaptersTotal !== null ? (
                    <span>
                      {chaptersDone} of {chaptersTotal} chapters completed
                    </span>
                  ) : null}
                  {active && chapterNumber !== null && progress >= 10 && progress < 88 ? (
                    <span>Current chapter: {chapterNumber}</span>
                  ) : null}
                </div>
                <span className="font-medium tabular-nums text-foreground">{progress}%</span>
              </div>
            </div>
          ) : null}

          {job?.type === 'book' ? (
            <ol
              aria-label="Book generation stages"
              className="grid gap-x-5 gap-y-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2"
            >
              {bookStages.map((stage, index) => {
                const complete = done || (!queued && index < currentStage);
                const current = !queued && !done && index === currentStage;
                return (
                  <li
                    key={stage.label}
                    aria-current={current ? 'step' : undefined}
                    className="flex items-center gap-2 text-xs"
                  >
                    {complete ? (
                      <CheckCircle2 className="size-4 shrink-0 text-green-400" aria-hidden="true" />
                    ) : current && active ? (
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : current && terminal ? (
                      <AlertTriangle
                        className="size-4 shrink-0 text-amber-300"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={current || complete ? 'text-foreground' : 'text-muted-foreground'}
                    >
                      {stage.label}
                      <span className="sr-only">
                        {' '}
                        —{' '}
                        {complete
                          ? 'completed'
                          : current
                            ? terminal
                              ? 'stopped here'
                              : 'in progress'
                            : 'pending'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {failed || cancelled ? (
            <p
              role="alert"
              className="break-words rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              {job?.error ??
                (failed
                  ? 'This job failed. Close this window to review your book and try again.'
                  : 'This job was cancelled. No further generation will run for this job.')}
            </p>
          ) : null}

          {error && !terminal ? (
            <p
              role="alert"
              className="break-words rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-xs leading-relaxed"
            >
              {job
                ? 'Progress updates are temporarily unavailable. The last known status is shown; this does not mean generation has stopped.'
                : 'We could not load this job’s status. This is a tracking error, not a confirmed generation failure.'}
              <span className="mt-1 block">{error}</span>
              <span className="mt-1 block">Tracking will retry automatically.</span>
            </p>
          ) : syncDelayed ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Updates are delayed. The last successfully synced status is shown.
            </p>
          ) : null}

          {heartbeatDelayed && !error ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No recent worker heartbeat has been reported. Generation may be delayed; we are still
              checking for updates.
            </p>
          ) : null}

          {job ? (
            <dl className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>Queued:</dt>
                <dd>
                  <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
                </dd>
              </div>
              {lastSyncedAt !== null ? (
                <div className="flex gap-1">
                  <dt>Last synced:</dt>
                  <dd>{new Date(lastSyncedAt).toLocaleTimeString()}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="flex flex-col gap-3">
            {!terminal ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Closing this window does not cancel the job.
              </p>
            ) : null}
            <Button variant="secondary" onClick={onClose} className="min-h-11 w-full">
              {done ? 'Continue' : 'Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
