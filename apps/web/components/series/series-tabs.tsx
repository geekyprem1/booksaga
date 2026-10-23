'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { slug: '', label: 'Roadmap' },
  { slug: 'bible', label: 'Series Bible' },
  { slug: 'covers', label: 'Covers' },
  { slug: 'exports', label: 'Exports' },
  { slug: 'box-set', label: 'Box Set' },
  { slug: 'audiobook', label: 'Audiobook' },
  { slug: 'settings', label: 'Settings' },
] as const;

export function SeriesTabs({ seriesId }: { seriesId: string }) {
  const pathname = usePathname();
  const base = `/series/${seriesId}`;

  return (
    <nav aria-label="Series sections" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.slug || 'roadmap'}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
