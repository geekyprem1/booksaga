import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatTone = 'violet' | 'blue' | 'green' | 'amber' | 'pink' | 'teal' | 'sky';

const TONES: Record<StatTone, { card: string; icon: string }> = {
  violet: {
    card: 'border-violet-400/25 from-violet-500/20',
    icon: 'from-violet-500 to-fuchsia-500 shadow-violet-500/40',
  },
  blue: {
    card: 'border-blue-400/25 from-blue-500/20',
    icon: 'from-blue-500 to-indigo-500 shadow-blue-500/40',
  },
  green: {
    card: 'border-emerald-400/25 from-emerald-500/20',
    icon: 'from-emerald-500 to-teal-500 shadow-emerald-500/40',
  },
  amber: {
    card: 'border-amber-400/25 from-amber-500/20',
    icon: 'from-amber-500 to-orange-500 shadow-amber-500/40',
  },
  pink: {
    card: 'border-pink-400/25 from-pink-500/20',
    icon: 'from-pink-500 to-rose-500 shadow-pink-500/40',
  },
  teal: {
    card: 'border-teal-400/25 from-teal-500/20',
    icon: 'from-teal-500 to-cyan-500 shadow-teal-500/40',
  },
  sky: {
    card: 'border-sky-400/25 from-sky-500/20',
    icon: 'from-sky-500 to-blue-600 shadow-sky-500/40',
  },
};

/** One stat tile of the dashboard row: tinted card, glowing icon, big number, label, hint. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: StatTone;
  /** Makes the whole tile a link. */
  href?: string;
}) {
  const t = TONES[tone];
  const className = cn(
    'flex flex-col items-start gap-3 rounded-xl border bg-gradient-to-br to-card p-4 transition-transform',
    href && 'hover:-translate-y-0.5',
    t.card,
  );

  const body = (
    <>
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg',
          t.icon,
        )}
      >
        <Icon className="size-5 text-white" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-none font-extrabold tabular-nums">{value}</p>
        <p className="mt-1 truncate text-sm font-medium">{label}</p>
        {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
