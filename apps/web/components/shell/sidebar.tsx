'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  Crown,
  Eye,
  GraduationCap,
  Headphones,
  ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Lock,
  Palette,
  PenLine,
  Send,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '@/lib/nav';
import { cn } from '@/lib/utils';

const ICONS: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  PenLine,
  Library,
  LayoutGrid,
  Palette,
  Eye,
  Send,
  Headphones,
  Briefcase,
  Crown,
  ImageIcon,
  GraduationCap,
  ShieldCheck,
};

export interface SidebarItem {
  slug: string;
  href: string;
  label: string;
  icon: NavIconName;
  locked: boolean;
}

export function SidebarNav({
  items,
  isAdmin,
  onNavigate,
}: {
  items: SidebarItem[];
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const all: SidebarItem[] = isAdmin
    ? [
        ...items,
        { slug: 'admin', href: '/admin', label: 'Admin', icon: 'ShieldCheck', locked: false },
      ]
    : items;

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {all.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.slug}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-gradient text-white glow-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              item.locked && !active && 'opacity-70',
            )}
          >
            <Icon className="size-4.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.locked ? (
              <>
                <Lock className="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
                <span className="sr-only">(locked)</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
