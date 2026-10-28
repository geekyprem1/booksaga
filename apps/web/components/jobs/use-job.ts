'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { getJobAction } from '@/lib/series/actions';
import type { JobSnapshot } from '@/lib/series/validation';

interface JobRow {
  id: string;
  type: string;
  created_at: string;
  started_at: string | null;
  heartbeat_at: string | null;
  status: JobSnapshot['status'];
  progress: number;
  step_label: string | null;
  error: string | null;
  ref_id: string | null;
  meta: Record<string, unknown> | null;
}

function toSnapshot(row: JobRow): JobSnapshot {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    startedAt: row.started_at,
    heartbeatAt: row.heartbeat_at,
    status: row.status,
    progress: row.progress,
    stepLabel: row.step_label,
    error: row.error,
    refId: row.ref_id,
    meta: row.meta ?? {},
  };
}

export interface JobTracking {
  job: JobSnapshot | null;
  error: string | null;
  isLoading: boolean;
  lastSyncedAt: number | null;
}

interface JobState extends JobTracking {
  jobId: string;
}

/** Realtime updates with a 3s polling fallback; transport errors retain the last known job. */
export function useJob(jobId: string | null): JobTracking {
  const [state, setState] = useState<JobState | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;
    let terminal = false;
    let loading = false;
    let revision = 0;
    const supabase = getBrowserClient();

    const receive = (job: JobSnapshot) => {
      if (!active || terminal) return;
      revision += 1;
      terminal = ['completed', 'failed', 'cancelled'].includes(job.status);
      if (terminal) clearInterval(interval);
      setState({ jobId, job, error: null, isLoading: false, lastSyncedAt: Date.now() });
    };

    const reportError = (message: string) => {
      if (!active || terminal) return;
      setState((previous) => ({
        jobId,
        job: previous?.jobId === jobId ? previous.job : null,
        lastSyncedAt: previous?.jobId === jobId ? previous.lastSyncedAt : null,
        error: message,
        isLoading: false,
      }));
    };

    const load = async () => {
      if (loading || terminal || !active) return;
      loading = true;
      const requestedRevision = revision;
      try {
        const result = await getJobAction(jobId);
        // A response requested before a realtime update must not roll that update back.
        if (!active || requestedRevision !== revision) return;
        if (result.ok) receive(result.data);
        else reportError(result.error.message);
      } catch (error) {
        if (requestedRevision === revision) {
          reportError(
            error instanceof Error ? error.message : 'Could not connect to job tracking. Retrying…',
          );
        }
      } finally {
        loading = false;
      }
    };

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          if (payload.new) receive(toSnapshot(payload.new as JobRow));
        },
      )
      .subscribe();

    const interval = window.setInterval(() => void load(), 3000);
    void load();

    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Never leak the previous job while the new job's first request is in flight.
  if (state?.jobId === jobId) return state;
  return { job: null, error: null, isLoading: Boolean(jobId), lastSyncedAt: null };
}
