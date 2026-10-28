'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cancelJobAction } from '@/lib/series/roadmap-actions';

/**
 * Admin cancel for a queued or active job. A queued job leaves the queue and is refunded at once;
 * an active job stops after its current step and is refunded per the 20% rule.
 */
export function CancelJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (!confirm('Cancel this job? Queued jobs are refunded in full; running jobs follow the 20% rule.')) {
      return;
    }
    startTransition(async () => {
      const result = await cancelJobAction({ jobId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        result.data.cancelledImmediately
          ? 'Job cancelled and refunded.'
          : 'Cancel requested. The worker stops after the current step.',
      );
      router.refresh();
    });
  }

  return (
    <Button variant="destructive" size="sm" disabled={pending} onClick={cancel}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Ban aria-hidden="true" />}
      Cancel job
    </Button>
  );
}
