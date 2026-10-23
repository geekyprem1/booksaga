'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BookOpen, CheckCircle2, Loader2, Lock, Plus, Sparkles } from 'lucide-react';
import { LENGTH_PRESETS, type LengthPreset } from '@booksaga/shared';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  addMorePartsAction,
  cancelJobAction,
  generatePartAction,
} from '@/lib/series/roadmap-actions';
import { formatNumber } from '@/lib/utils';

export interface RoadmapPart {
  id: string;
  partNumber: number;
  title: string;
  premise: string;
  status: 'locked' | 'ready' | 'generating' | 'generated' | 'failed';
  lengthPreset: LengthPreset;
  wordCount: number;
  chapterCount: number;
  jobId: string | null;
  jobProgress: number;
  jobStep: string | null;
  /** Signed URL of the active cover, when one exists (T4.10). */
  coverUrl: string | null;
}

export interface RoadmapProps {
  seriesId: string;
  parts: RoadmapPart[];
  credits: number;
  costs: Record<LengthPreset, number>;
  allowedPresets: LengthPreset[];
  plannedBooks: number;
  maxBooks: number;
}

const STATUS_VARIANT = {
  generated: 'success',
  ready: 'default',
  generating: 'warning',
  locked: 'muted',
  failed: 'danger',
} as const;

export function Roadmap({
  seriesId,
  parts,
  credits,
  costs,
  allowedPresets,
  plannedBooks,
  maxBooks,
}: RoadmapProps) {
  const router = useRouter();
  const [presetByPart, setPresetByPart] = useState<Record<number, LengthPreset>>(() =>
    Object.fromEntries(parts.map((p) => [p.partNumber, p.lengthPreset])),
  );
  const [activeJob, setActiveJob] = useState<{ jobId: string; kind: 'generate' | 'extend' } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addCount, setAddCount] = useState(2);

  const anyGenerating = parts.some((p) => p.status === 'generating');
  const written = parts.filter((p) => p.status === 'generated').length;
  const totalWords = parts.reduce((sum, p) => sum + p.wordCount, 0);

  // Realtime: any change to this series' books, or to one of the user's jobs, refreshes the server
  // data (progress, statuses, credits). Debounced so a burst of updates costs one render.
  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 1200);
    };

    const channel = supabase
      .channel(`series:${seriesId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'books', filter: `series_id=eq.${seriesId}` },
        refresh,
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, refresh)
      .subscribe();

    const poll = anyGenerating ? setInterval(refresh, 8000) : null;

    return () => {
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [seriesId, router, anyGenerating]);

  async function handleGenerate(part: RoadmapPart) {
    setError(null);
    setBusy(`generate-${part.partNumber}`);
    const result = await generatePartAction({
      seriesId,
      partNumber: part.partNumber,
      lengthPreset: presetByPart[part.partNumber] ?? part.lengthPreset,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setActiveJob({ jobId: result.data.jobId, kind: 'generate' });
  }

  async function handleCancel(part: RoadmapPart) {
    if (!part.jobId) return;
    setError(null);
    setBusy(`cancel-${part.partNumber}`);
    const result = await cancelJobAction({ jobId: part.jobId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  async function handleAddParts() {
    setError(null);
    setBusy('extend');
    const result = await addMorePartsAction({ seriesId, count: addCount });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setActiveJob({ jobId: result.data.jobId, kind: 'extend' });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {written} of {plannedBooks}
          </span>{' '}
          parts written · {formatNumber(totalWords)} words · {credits} credits left
        </p>

        {plannedBooks < maxBooks ? (
          <div className="flex items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Add parts
              <Select
                className="mt-1 h-8 w-20"
                value={addCount}
                onChange={(e) => setAddCount(Number(e.target.value))}
                aria-label="How many parts to add"
              >
                {Array.from({ length: Math.min(10, maxBooks - plannedBooks) }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ),
                )}
              </Select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleAddParts}
              disabled={busy === 'extend'}
            >
              {busy === 'extend' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Extend arc · 1 credit
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {parts.map((part) => {
          const preset = LENGTH_PRESETS[part.lengthPreset];
          const generating = part.status === 'generating';
          const selected = presetByPart[part.partNumber] ?? part.lengthPreset;
          const cost = costs[selected];

          return (
            <Card
              key={part.id}
              className={part.status === 'locked' ? 'opacity-70' : undefined}
              aria-label={`Part ${part.partNumber}`}
            >
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                    PART {part.partNumber}
                  </span>
                  <Badge variant={STATUS_VARIANT[part.status]}>
                    {part.status === 'generated' ? (
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                    ) : part.status === 'locked' ? (
                      <Lock className="size-3" aria-hidden="true" />
                    ) : null}
                    {part.status}
                  </Badge>
                </div>

                <div className="flex flex-1 gap-2">
                  {part.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={part.coverUrl}
                      alt={`Cover for part ${part.partNumber}`}
                      className="h-20 w-[52px] shrink-0 rounded border border-border object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">
                      {part.title || `Part ${part.partNumber}`}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{part.premise}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {preset?.label ?? part.lengthPreset}
                  {part.wordCount > 0
                    ? ` · ${formatNumber(part.wordCount)} words · ${part.chapterCount} chapters`
                    : ''}
                </p>

                {generating ? (
                  <div className="flex flex-col gap-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-brand-gradient transition-all"
                        style={{ width: `${Math.max(part.jobProgress, 3)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {part.jobStep ?? 'Starting…'} · {part.jobProgress}%
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(part)}
                      disabled={busy === `cancel-${part.partNumber}`}
                    >
                      {busy === `cancel-${part.partNumber}` ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : null}
                      Cancel
                    </Button>
                  </div>
                ) : part.status === 'generated' ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/series/${seriesId}/books/${part.id}`}>
                      <BookOpen aria-hidden="true" /> Open Part {part.partNumber}
                    </Link>
                  </Button>
                ) : part.status === 'locked' ? (
                  <p className="text-xs text-muted-foreground">
                    Complete Part {part.partNumber - 1} to unlock.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {allowedPresets.length > 1 ? (
                      <Select
                        aria-label={`Length for part ${part.partNumber}`}
                        className="h-8"
                        value={selected}
                        onChange={(e) =>
                          setPresetByPart((prev) => ({
                            ...prev,
                            [part.partNumber]: e.target.value as LengthPreset,
                          }))
                        }
                      >
                        {allowedPresets.map((p) => (
                          <option key={p} value={p}>
                            {LENGTH_PRESETS[p].label} · {costs[p]} cr
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGenerate(part)}
                      disabled={busy === `generate-${part.partNumber}` || credits < (cost ?? 0)}
                    >
                      {busy === `generate-${part.partNumber}` ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles aria-hidden="true" />
                      )}
                      {part.status === 'failed' ? 'Retry' : `Generate Part ${part.partNumber}`} ·{' '}
                      {cost} cr
                    </Button>
                    {part.status === 'failed' ? (
                      <p className="flex items-center gap-1 text-xs text-amber-300">
                        <AlertTriangle className="size-3" aria-hidden="true" /> Last attempt failed —
                        credits were refunded.
                      </p>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <JobProgressDialog
        jobId={activeJob?.jobId ?? null}
        title={activeJob?.kind === 'extend' ? 'Extending the series arc' : 'Writing the next part'}
        description={
          activeJob?.kind === 'extend'
            ? 'New parts are being planned and added to the roadmap.'
            : 'Outline, chapters, continuity pass and metadata.'
        }
        onClose={() => setActiveJob(null)}
        onSettled={() => {
          setActiveJob(null);
          router.refresh();
        }}
      />
    </div>
  );
}
