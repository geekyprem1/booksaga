'use client';

import Image from 'next/image';
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
    <>
      <nav aria-label="Main" className="flex shrink-0 flex-col gap-1">
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
                'group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-[15px] leading-5 font-semibold transition-colors motion-reduce:transition-none',
                active
                  ? 'bg-brand-gradient border-white/25 text-white glow-primary'
                  : 'border-white/10 bg-slate-950/70 text-white shadow-sm hover:border-violet-300/40 hover:bg-slate-900/95',
              )}
            >
              <Icon
                className={cn('size-5 shrink-0', !active && 'text-violet-200')}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">{item.label}</span>
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
      <div
        aria-hidden="true"
        data-sidebar-art
        className="relative mt-auto aspect-[6/5] w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950"
      >
        <Image
          src="/hero/sidebar-reading-room.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) 224px, 256px"
          className="object-cover"
        />
      </div>
    </>
  );
}
