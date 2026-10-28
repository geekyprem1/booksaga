'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { retryJobAction } from '@/app/admin/jobs/actions';

/** Admin retry for a failed job. Runs free: the failed attempt was already refunded. */
export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    if (!confirm('Retry this job? It runs again for free, since the failed attempt was refunded.')) {
      return;
    }
    startTransition(async () => {
      const result = await retryJobAction({ jobId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success('Job queued again.');
      router.push(`/admin/jobs/${result.data.newJobId}`);
    });
  }

  return (
    <Button size="sm" disabled={pending} onClick={retry}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
      Retry job
    </Button>
  );
}
