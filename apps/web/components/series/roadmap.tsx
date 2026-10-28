'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Loader2,
  Lock,
  Plus,
  Sparkles,
} from 'lucide-react';
import { LENGTH_PRESETS, type LengthPreset } from '@booksaga/shared';
import { Select } from '@/components/ui/input';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  addMorePartsAction,
  cancelJobAction,
  generatePartAction,
} from '@/lib/series/roadmap-actions';
import { cn, formatNumber } from '@/lib/utils';
import styles from './roadmap.module.css';

export interface RoadmapPart {
  id: string;
  partNumber: number;
  title: string;
  premise: string;
  status: 'locked' | 'ready' | 'generating' | 'generated' | 'failed';
  jobStatus: 'queued' | 'active' | null;
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
  genre?: string;
  readOnly?: boolean;
}

export function Roadmap({
  seriesId,
  parts,
  credits,
  costs,
  allowedPresets,
  plannedBooks,
  maxBooks,
  genre,
  readOnly = false,
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
  const [addCount, setAddCount] = useState(Math.min(2, Math.max(1, maxBooks - plannedBooks)));

  const anyGenerating = parts.some((p) => p.jobId !== null || p.status === 'generating');
  const written = parts.filter((p) => p.status === 'generated').length;
  const totalWords = parts.reduce((sum, p) => sum + p.wordCount, 0);

  // Realtime: any change to this series' books, or to one of the user's jobs, refreshes the server
  // data (progress, statuses, credits). Debounced so a burst of updates costs one render.
  useEffect(() => {
    if (readOnly) return;
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
  }, [seriesId, router, anyGenerating, readOnly]);

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
    router.refresh();
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

  const seriesCover = parts.find((part) => part.coverUrl)?.coverUrl;

  return (
    <section className={styles.roadmap} aria-label="Series Roadmap">
      <header className={styles.header}>
        <h2>
          <BookOpen aria-hidden="true" /> Series Roadmap
        </h2>
        <p>Your books grow step by step, with the same series continuity.</p>
        <span className={styles.summary}>
          {written}/{plannedBooks} written · {formatNumber(totalWords)} words
        </span>
        <Link href="/publishing" className={styles.help}>
          <BookOpen aria-hidden="true" /> How it works
        </Link>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.partList} role="region" aria-label="Books in this series" tabIndex={0}>
        {parts.map((part, index) => {
          const first = index === 0;
          const generated = part.status === 'generated';
          const locked = part.status === 'locked';
          const generating = part.jobId !== null || part.status === 'generating';
          const queued = part.jobStatus === 'queued';
          const selected = presetByPart[part.partNumber] ?? part.lengthPreset;
          const cost = costs[selected];
          const actionTone = styles[`tone${index % 6}`];
          return (
            <article
              key={part.id}
              aria-label={`Part ${part.partNumber}`}
              className={cn(
                styles.partCard,
                first && styles.firstPart,
                locked && styles.lockedPart,
                actionTone,
              )}
            >
              {!first && (
                <div className={styles.cardBackdrop} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={part.coverUrl ?? seriesCover ?? '/hero/dashboard.webp'}
                    alt=""
                    loading="lazy"
                  />
                </div>
              )}
              {first && (
                <div className={styles.cover}>
                  {part.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={part.coverUrl} alt={`Cover for part ${part.partNumber}`} />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <BookOpen aria-hidden="true" />
                      <span>BOOK {part.partNumber}</span>
                    </div>
                  )}
                </div>
              )}
              <div className={styles.partDetails}>
                {first ? (
                  <span className={styles.firstStatus}>
                    Part {part.partNumber}
                    <small>
                      {generated
                        ? 'Generated'
                        : locked
                          ? 'Locked'
                          : generating
                            ? queued
                              ? 'Queued'
                              : 'Writing'
                            : 'Ready'}
                    </small>
                  </span>
                ) : (
                  <div className={styles.stateIcon}>
                    {generated ? (
                      <Check aria-hidden="true" />
                    ) : locked ? (
                      <Lock aria-hidden="true" />
                    ) : generating ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                  </div>
                )}
                {first ? (
                  <>
                    <h3 className={styles.bookTitle}>{part.title || `Part ${part.partNumber}`}</h3>
                    {genre && <span className={styles.genre}>{genre}</span>}
                  </>
                ) : (
                  <h3 className={styles.partTitle} title={part.title}>
                    Part {part.partNumber}
                  </h3>
                )}
                {!first && (
                  <p className={styles.status}>
                    {generated
                      ? 'Generated'
                      : locked
                        ? 'Not generated yet'
                        : generating
                          ? queued
                            ? 'Waiting in queue'
                            : 'Writing your book'
                          : part.status === 'failed'
                            ? 'Ready to retry'
                            : 'Ready to generate'}
                  </p>
                )}
                <p className={styles.description} title={part.premise}>
                  {generating
                    ? `${part.jobStep ?? (queued ? 'Waiting for an available writer' : 'Starting')} · ${part.jobProgress}%`
                    : first
                      ? part.premise
                      : generated
                        ? 'Open this book and continue editing.'
                        : locked
                          ? `Complete Part ${part.partNumber - 1} to unlock this book.`
                          : 'Continue the same cast, world and series.'}
                </p>
              </div>
              <div className={styles.partActions}>
                {generating ? (
                  <>
                    <div
                      className={styles.progress}
                      role="progressbar"
                      aria-label={`Part ${part.partNumber} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={part.jobProgress}
                    >
                      <span style={{ width: `${part.jobProgress}%` }} />
                    </div>
                    <span className={styles.jobLabel} aria-live="polite">
                      {queued ? 'Queued' : 'Writing'} · {part.jobProgress}%
                    </span>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() =>
                        part.jobId && setActiveJob({ jobId: part.jobId, kind: 'generate' })
                      }
                      disabled={!part.jobId}
                    >
                      <BookOpen aria-hidden="true" />
                      View progress
                    </button>
                    <button
                      type="button"
                      className={cn(styles.actionButton, styles.cancelButton)}
                      onClick={() => handleCancel(part)}
                      disabled={readOnly || busy !== null || !part.jobId}
                    >
                      Cancel
                    </button>
                  </>
                ) : generated ? (
                  <Link
                    href={`/series/${seriesId}/books/${part.id}`}
                    className={styles.actionButton}
                    aria-label={`Open Part ${part.partNumber}`}
                  >
                    <BookOpen aria-hidden="true" />
                    <span>Open Part {part.partNumber}</span>
                  </Link>
                ) : locked ? (
                  <>
                    <span className="sr-only">Complete Part {part.partNumber - 1} to unlock.</span>
                    <button
                      type="button"
                      disabled
                      className={styles.actionButton}
                      aria-label={`Generate Part ${part.partNumber} (locked)`}
                    >
                      <Sparkles aria-hidden="true" />
                      <span>Generate Part {part.partNumber}</span>
                    </button>
                  </>
                ) : (
                  <>
                    {allowedPresets.length > 1 && (
                      <Select
                        aria-label={`Length for part ${part.partNumber}`}
                        className={styles.lengthSelect}
                        value={selected}
                        onChange={(event) =>
                          setPresetByPart((current) => ({
                            ...current,
                            [part.partNumber]: event.target.value as LengthPreset,
                          }))
                        }
                      >
                        {allowedPresets.map((preset) => (
                          <option key={preset} value={preset}>
                            {LENGTH_PRESETS[preset].label} · {costs[preset]} cr
                          </option>
                        ))}
                      </Select>
                    )}
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => handleGenerate(part)}
                      disabled={readOnly || busy !== null || credits < (cost ?? 0)}
                      aria-label={`${part.status === 'failed' ? 'Retry' : 'Generate'} Part ${part.partNumber} · ${cost} credits`}
                    >
                      {busy === `generate-${part.partNumber}` ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles aria-hidden="true" />
                      )}
                      <span>
                        {part.status === 'failed' ? 'Retry' : 'Generate'} Part {part.partNumber}
                      </span>
                    </button>
                    {part.status === 'failed' && (
                      <span
                        className={styles.refund}
                        title="Last attempt failed. Credits were refunded."
                      >
                        <AlertTriangle aria-hidden="true" /> Refunded
                      </span>
                    )}
                  </>
                )}
              </div>
              {first && (
                <Link href={`/series/${seriesId}`} className={styles.continueLink}>
                  <ArrowRight aria-hidden="true" /> Continue series
                </Link>
              )}
            </article>
          );
        })}
        {!readOnly && plannedBooks < maxBooks && (
          <div className={styles.addCard}>
            <span className={styles.addIcon}>
              <Plus aria-hidden="true" />
            </span>
            <strong>
              Add more
              <br />
              parts
            </strong>
            <p>Expand the same series.</p>
            <Select
              aria-label="How many parts to add"
              className={styles.lengthSelect}
              value={addCount}
              onChange={(event) => setAddCount(Number(event.target.value))}
            >
              {Array.from(
                { length: Math.min(10, maxBooks - plannedBooks) },
                (_, index) => index + 1,
              ).map((count) => (
                <option key={count} value={count}>
                  +{count} {count === 1 ? 'part' : 'parts'}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className={styles.extendButton}
              onClick={handleAddParts}
              disabled={busy !== null || credits < 1}
              aria-label="Extend arc · 1 credit"
            >
              {busy === 'extend' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
            </button>
            <small>1 credit</small>
          </div>
        )}
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
    </section>
  );
}
