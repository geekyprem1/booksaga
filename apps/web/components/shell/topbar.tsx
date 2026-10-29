import Link from 'next/link';
import { Coins } from 'lucide-react';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';
import { SearchTrigger } from './search-trigger';
import { NotificationBell } from './notification-bell';
import type { SidebarItem } from './sidebar';
import { formatNumber } from '@/lib/utils';

export interface CreditSummary {
  primary: number;
  primaryLabel: string;
  title: string;
}

export function Topbar({
  items,
  user,
  credits,
  appName,
  logoUrl,
  avatarUrl,
  unread,
  preview,
}: {
  items: SidebarItem[];
  user: { name: string; email: string; role: 'user' | 'admin' };
  credits: CreditSummary;
  appName: string;
  logoUrl: string;
  avatarUrl: string | null;
  unread: number;
  preview?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30">
      {preview}
      <header className="flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-8">
        <MobileNav
          items={items}
          isAdmin={user.role === 'admin'}
          appName={appName}
          logoUrl={logoUrl}
        />

        <SearchTrigger />

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/dashboard"
            title={credits.title}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          >
            <Coins className="size-4 text-amber" aria-hidden="true" />
            <span>{formatNumber(credits.primary)}</span>
            <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
              {credits.primaryLabel}
            </span>
          </Link>

          <NotificationBell initialUnread={unread} />

          <UserMenu name={user.name} email={user.email} role={user.role} avatarUrl={avatarUrl} />
        </div>
      </header>
    </div>
  );
}
