import Link from 'next/link';
import { ArrowRight, BookOpen, Lock, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DashboardPart {
  number: number;
  status: string;
}

export interface DashboardSeries {
  id: string;
  title: string;
  genre: string;
  planned: number;
  done: number;
  coverUrl: string | null;
  parts: DashboardPart[];
}

const MAX_CHIPS = 8;

function PartChip({ part }: { part: DashboardPart }) {
  const base = 'flex size-7 items-center justify-center rounded-full border text-xs font-bold';
  const label = `Part ${part.number}: ${part.status}`;

  if (part.status === 'generated') {
    return (
      <span title={label} className={cn(base, 'border-cyan-300/50 bg-cyan-400/20 text-cyan-200')}>
        {part.number}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (part.status === 'generating' || part.status === 'ready' || part.status === 'failed') {
    return (
      <span
        title={label}
        className={cn(
          base,
          part.status === 'failed'
            ? 'border-rose-400/50 text-rose-300'
            : 'border-violet-400/60 bg-violet-500/15 text-violet-200',
          part.status === 'generating' && 'animate-pulse',
        )}
      >
        {part.number}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span title={label} className={cn(base, 'border-border text-muted-foreground')}>
      <Lock className="size-3" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A recent-series card: cover, genre, progress, numbered part chips, Continue Writing. */
export function SeriesCard({ series }: { series: DashboardSeries }) {
  const percent = series.planned > 0 ? Math.round((series.done / series.planned) * 100) : 0;
  const visible = series.parts.slice(0, MAX_CHIPS);
  const hidden = series.parts.length - visible.length;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card/80 p-3.5 transition-colors hover:border-violet-400/40">
      <div className="flex gap-3.5">
        <Link
          href={`/series/${series.id}`}
          aria-label={`Open ${series.title}`}
          className="relative aspect-[5/8] w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-muted shadow-lg shadow-black/40"
        >
          {series.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={series.coverUrl}
              alt={`Cover of ${series.title}`}
              loading="lazy"
              className="size-full object-contain"
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-violet-600/30 via-card to-pink-600/20 p-2 text-center text-muted-foreground">
              <BookOpen className="size-5" aria-hidden="true" />
              <span className="text-[10px] leading-tight">No cover yet</span>
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Badge variant="default" className="w-fit max-w-full truncate">
            {series.genre}
          </Badge>
          <Link
            href={`/series/${series.id}`}
            className="line-clamp-2 text-base leading-snug font-bold hover:underline"
          >
            {series.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {series.planned} {series.planned === 1 ? 'part' : 'parts'}
          </p>

          <div className="mt-auto">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {series.done > 0 ? `Part ${series.done} completed` : 'Not started'}
              </span>
              <span className="font-semibold tabular-nums">
                {series.done}/{series.planned}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={series.planned}
              aria-valuenow={series.done}
              aria-label={`${series.title} progress`}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-brand-gradient"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" aria-label="Parts">
        {visible.map((part) => (
          <PartChip key={part.number} part={part} />
        ))}
        {hidden > 0 ? <span className="text-xs text-muted-foreground">+{hidden}</span> : null}
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" variant="secondary" className="flex-1">
          <Link href={`/series/${series.id}`}>
            <ArrowRight aria-hidden="true" />
            {series.done > 0 ? 'Continue Writing' : 'Open Series'}
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary" aria-label={`Covers for ${series.title}`}>
          <Link href={`/series/${series.id}/covers`} title="Covers">
            <Palette aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
