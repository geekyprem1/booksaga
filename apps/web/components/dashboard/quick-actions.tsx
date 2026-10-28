import Link from 'next/link';
import { ChevronRight, Download, Eye, LayoutGrid, Lock, Palette, PenLine, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Action {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  tile: string;
  locked?: boolean;
}

/** Quick Actions panel (PRD §8.2): Create, Templates, Covers, KDP Preview, Export. */
export function QuickActions({ templatesLocked }: { templatesLocked: boolean }) {
  const actions: Action[] = [
    {
      href: '/create-series',
      label: 'Create New Series',
      hint: 'Start from one idea',
      icon: PenLine,
      tile: 'from-blue-500 to-indigo-500',
    },
    {
      href: '/templates',
      label: 'Browse Templates',
      hint: templatesLocked ? 'Included with Done-For-You' : 'Proven series premises',
      icon: LayoutGrid,
      tile: 'from-violet-500 to-fuchsia-500',
      locked: templatesLocked,
    },
    {
      href: '/cover-studio',
      label: 'Design Covers',
      hint: 'Matching covers per book',
      icon: Palette,
      tile: 'from-amber-500 to-orange-500',
    },
    {
      href: '/kdp-preview',
      label: 'Preview for KDP',
      hint: 'See it exactly as it prints',
      icon: Eye,
      tile: 'from-emerald-500 to-teal-500',
    },
    {
      href: '/publishing',
      label: 'Export Files',
      hint: 'EPUB, print PDF, DOCX',
      icon: Download,
      tile: 'from-pink-500 to-rose-500',
    },
  ];

  return (
    <section
      aria-labelledby="quick-actions-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card/80 p-4"
    >
      <h2 id="quick-actions-title" className="flex items-center gap-2 text-base font-semibold">
        <Zap className="size-4 text-amber" aria-hidden="true" /> Quick Actions
      </h2>
      <ul className="flex flex-col gap-2">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className="group flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5 transition-colors hover:border-violet-400/40 hover:bg-muted"
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br',
                  action.tile,
                )}
              >
                <action.icon className="size-5 text-white" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{action.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{action.hint}</span>
              </span>
              {action.locked ? (
                <>
                  <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">(locked)</span>
                </>
              ) : (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
