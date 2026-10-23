'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { getJobAction } from '@/lib/series/actions';
import type { JobSnapshot } from '@/lib/series/validation';

interface JobRow {
  id: string;
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
    status: row.status,
    progress: row.progress,
    stepLabel: row.step_label,
    error: row.error,
    refId: row.ref_id,
    meta: row.meta ?? {},
  };
}

interface JobState {
  jobId: string;
  job: JobSnapshot;
}

/**
 * Live job state: Supabase Realtime on the `jobs` row (RLS scopes it to the owner) plus a 3s
 * polling fallback, so progress still moves when the websocket is blocked (corporate proxies).
 */
export function useJob(jobId: string | null): JobSnapshot | null {
  const [state, setState] = useState<JobState | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;
    const supabase = getBrowserClient();

    const load = async () => {
      const result = await getJobAction(jobId);
      if (active && result.ok) setState({ jobId, job: result.data });
    };

    void load();

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          if (active && payload.new) setState({ jobId, job: toSnapshot(payload.new as JobRow) });
        },
      )
      .subscribe();

    const interval = setInterval(() => void load(), 3000);

    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Stale state from a previous job must never leak into the current dialog.
  return state && state.jobId === jobId ? state.job : null;
}
