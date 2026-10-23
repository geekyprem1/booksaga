'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Copy, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  archiveSeriesAction,
  deleteSeriesAction,
  duplicateSeriesAction,
  restoreSeriesAction,
  unarchiveSeriesAction,
} from '@/lib/series/series-actions';

export function SeriesCardActions({
  seriesId,
  status,
  inTrash,
}: {
  seriesId: string;
  status: string;
  inTrash: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
    confirmText?: string,
  ) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key);
    const result = await fn();
    setBusy(null);
    if (!result.ok) {
      alert(result.error?.message ?? 'Something went wrong.');
      return;
    }
    router.refresh();
  }

  if (inTrash) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy !== null}
        onClick={() =>
          run('restore', () => restoreSeriesAction({ seriesId }), 'Restore this series?')
        }
      >
        {busy === 'restore' ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw aria-hidden="true" />
        )}
        Restore
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() => run('duplicate', () => duplicateSeriesAction({ seriesId }))}
        title="Copy the settings and bible (not the books)"
      >
        {busy === 'duplicate' ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
        Duplicate
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() =>
          run(
            'archive',
            () =>
              status === 'archived'
                ? unarchiveSeriesAction({ seriesId })
                : archiveSeriesAction({ seriesId }),
            status === 'archived' ? 'Unarchive this series?' : 'Archive this series?',
          )
        }
      >
        {busy === 'archive' ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        {status === 'archived' ? 'Unarchive' : 'Archive'}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy !== null}
        onClick={() =>
          run(
            'delete',
            () => deleteSeriesAction({ seriesId }),
            'Move this series to Trash? You can restore it for 30 days.',
          )
        }
      >
        {busy === 'delete' ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
        Delete
      </Button>
    </div>
  );
}
