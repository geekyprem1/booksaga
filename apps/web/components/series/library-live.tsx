'use client';

import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';

export type RoadmapJob = { jobId: string; kind: 'generate' | 'extend' };
export const LibraryLiveContext = createContext<{
  openJob: (job: RoadmapJob | null) => void;
} | null>(null);

/** The library shares one subscription, poller and progress dialog across all series. */
export function LibraryLive({
  userId,
  seriesIds,
  pending,
  enabled,
  children,
}: {
  userId: string;
  seriesIds: string[];
  pending: boolean;
  enabled: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [job, setJob] = useState<RoadmapJob | null>(null);
  const context = useMemo(() => ({ openJob: setJob }), []);
  const seriesKey = seriesIds.join(',');
  const tracking = pending || job !== null;

  useEffect(() => {
    if (!enabled || !seriesKey) return;
    const ids = new Set(seriesKey.split(','));
    const supabase = getBrowserClient();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 1200);
    };
    // Poll while connecting too: a worker can start after the server snapshot but before joining.
    let poll: ReturnType<typeof setInterval> | null = setInterval(refresh, 8000);
    const channel = supabase
      .channel(`my-series:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, (payload) => {
        const row = payload.new as { series_id?: string };
        if (row.series_id && ids.has(row.series_id)) refresh();
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { type?: string };
          if (row.type === 'book' || row.type === 'arc_extend') refresh();
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          // Reconcile updates missed before joining (or while reconnecting).
          refresh();
          if (!tracking && poll) {
            clearInterval(poll);
            poll = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!poll) poll = setInterval(refresh, 8000);
          refresh();
        }
      });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [enabled, seriesKey, userId, router, tracking]);

  return (
    <LibraryLiveContext.Provider value={context}>
      {children}
      <JobProgressDialog
        jobId={job?.jobId ?? null}
        title={job?.kind === 'extend' ? 'Extending the series arc' : 'Writing the next part'}
        description={
          job?.kind === 'extend'
            ? 'New parts are being planned and added to the roadmap.'
            : 'Outline, chapters, continuity pass and metadata.'
        }
        onClose={() => setJob(null)}
        onSettled={() => {
          setJob(null);
          router.refresh();
        }}
      />
    </LibraryLiveContext.Provider>
  );
}
