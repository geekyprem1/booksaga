'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { JobSnapshot } from '@/lib/series/validation';
import { useJob } from './use-job';

interface JobProgressDialogProps {
  jobId: string | null;
  title: string;
  description?: string;
  onClose: () => void;
  /** Called once when the job reaches a terminal state. */
  onSettled?: (job: JobSnapshot) => void;
}

/**
 * Live progress for any job (book generation, enhance, suggestions). Reads the `jobs` row through
 * `useJob`, so the same component works for every queue.
 */
export function JobProgressDialog({
  jobId,
  title,
  description,
  onClose,
  onSettled,
}: JobProgressDialogProps) {
  const job = useJob(jobId);
  const settled = useRef<string | null>(null);

  const status = job?.status;
  useEffect(() => {
    if (!job || !jobId) return;
    if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') return;
    if (settled.current === job.id) return;
    settled.current = job.id;
    onSettled?.(job);
  }, [job, jobId, status, onSettled]);

  const done = status === 'completed';
  const failed = status === 'failed';
  const cancelled = status === 'cancelled';
  const progress = done ? 100 : (job?.progress ?? 0);

  const chaptersDone = typeof job?.meta?.chaptersDone === 'number' ? job.meta.chaptersDone : null;
  const chaptersTotal = typeof job?.meta?.chaptersTotal === 'number' ? job.meta.chaptersTotal : null;

  return (
    <Dialog open={Boolean(jobId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title={title} description={description} className="max-w-md">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {done ? (
              <CheckCircle2 className="size-5 text-green-400" aria-hidden="true" />
            ) : failed || cancelled ? (
              <AlertTriangle className="size-5 text-amber-300" aria-hidden="true" />
            ) : (
              <Loader2 className="size-5 animate-spin text-violet-300" aria-hidden="true" />
            )}
            <p className="text-sm font-medium" aria-live="polite">
              {done
                ? 'Done'
                : failed
                  ? 'Something went wrong'
                  : cancelled
                    ? 'Cancelled'
                    : (job?.stepLabel ?? 'Queued…')}
            </p>
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Job progress"
          >
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-500"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {chaptersDone !== null && chaptersTotal !== null && !done
                ? `Chapter ${chaptersDone} of ${chaptersTotal}`
                : done
                  ? 'Finished'
                  : 'Working…'}
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>

          {failed ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200">
              {job?.error ?? 'The job failed. Your credits have been refunded.'}
            </p>
          ) : null}

          {failed || cancelled ? (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : done ? (
            <Button variant="secondary" onClick={onClose}>
              Continue
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              You can close this window — generation keeps running and you will get a notification.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
