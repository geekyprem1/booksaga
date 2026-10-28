'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  {
    slug: '',
    label: 'Roadmap',
    color: 'border-violet-400/40 bg-violet-950 hover:bg-violet-900 aria-[current=page]:bg-violet-700',
  },
  {
    slug: 'bible',
    label: 'Series Bible',
    color: 'border-blue-400/40 bg-blue-950 hover:bg-blue-900 aria-[current=page]:bg-blue-700',
  },
  {
    slug: 'covers',
    label: 'Covers',
    color: 'border-fuchsia-400/40 bg-fuchsia-950 hover:bg-fuchsia-900 aria-[current=page]:bg-fuchsia-700',
  },
  {
    slug: 'exports',
    label: 'Exports',
    color: 'border-emerald-400/40 bg-emerald-950 hover:bg-emerald-900 aria-[current=page]:bg-emerald-700',
  },
  {
    slug: 'box-set',
    label: 'Box Set',
    color: 'border-amber-400/40 bg-amber-950 hover:bg-amber-900 aria-[current=page]:bg-amber-800',
  },
  {
    slug: 'audiobook',
    label: 'Audiobook',
    color: 'border-cyan-400/40 bg-cyan-950 hover:bg-cyan-900 aria-[current=page]:bg-cyan-700',
  },
  {
    slug: 'settings',
    label: 'Settings',
    color: 'border-rose-400/40 bg-rose-950 hover:bg-rose-900 aria-[current=page]:bg-rose-700',
  },
] as const;

export function SeriesTabs({ seriesId }: { seriesId: string }) {
  const pathname = usePathname();
  const base = `/series/${seriesId}`;

  return (
    <nav
      aria-label="Series sections"
      className="flex min-w-0 gap-2 overflow-x-auto overflow-y-hidden px-1 py-3 [scrollbar-width:thin]"
    >
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.slug || 'roadmap'}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center rounded-lg border px-4 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none',
              tab.color,
              active && 'border-white/70 underline decoration-2 underline-offset-4',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
