import { Wrench } from 'lucide-react';
import type { Account } from '@booksaga/core';
import { Logo } from '@/components/shell/logo';
import type { SidebarItem } from '@/components/shell/sidebar';
import { SidebarNav } from '@/components/shell/sidebar';
import { Topbar, type CreditSummary } from '@/components/shell/topbar';
import { CommandPalette } from '@/components/shell/command-palette';
import { getAccount, primaryBalance } from '@/lib/account';
import { isNavUnlocked, NAV_ITEMS } from '@/lib/nav';
import { getAvatarUrl } from '@/lib/profile/avatar';
import { getAppInfo, getMaintenance } from '@/lib/settings';
import { getAdminDb } from '@/lib/supabase/admin';
import { formatNumber } from '@/lib/utils';

function buildCreditSummary(account: Account): CreditSummary {
  const b = account.balances;
  if (account.isAgencyClient) {
    return {
      primary: b.agency,
      primaryLabel: 'credits',
      title: `Credits left from your agency allotment: ${formatNumber(b.agency)}`,
    };
  }
  const parts = [`Credits: ${formatNumber(b.main)}`];
  if (account.entitlements.audiobook || b.audio > 0)
    parts.push(`Audiobook: ${formatNumber(b.audio)}`);
  if (b.agency > 0) parts.push(`Agency pool: ${formatNumber(b.agency)}`);
  return { primary: primaryBalance(account), primaryLabel: 'credits', title: parts.join(' · ') };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user, account }, maintenance, app] = await Promise.all([
    getAccount(),
    getMaintenance(),
    getAppInfo(),
  ]);

  if (maintenance.enabled && user.role !== 'admin') {
    return (
      <main className="app-backdrop flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Wrench className="size-10 text-amber" aria-hidden="true" />
        <h1 className="text-2xl font-bold">We&apos;ll be right back</h1>
        <p className="max-w-md text-muted-foreground">
          {maintenance.message ||
            `${app.name} is undergoing scheduled maintenance. Please check back shortly.`}
        </p>
      </main>
    );
  }

  const items: SidebarItem[] = NAV_ITEMS.map((i) => ({
    slug: i.slug,
    href: i.href,
    label: i.label,
    icon: i.icon,
    locked: !isNavUnlocked(i, account.entitlements),
  }));

  const [{ count: unread }, avatarUrl] = await Promise.all([
    getAdminDb()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
    getAvatarUrl(user.avatarUrl),
  ]);

  return (
    <div className="app-backdrop min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 overflow-y-auto border-r border-border bg-background/70 p-4 backdrop-blur lg:flex">
        <div className="px-2 pt-1">
          <Logo name={app.name} />
        </div>
        <SidebarNav items={items} isAdmin={user.role === 'admin'} />
      </aside>

      <div className="lg:pl-64">
        <Topbar
          items={items}
          user={{ name: user.name, email: user.email, role: user.role }}
          credits={buildCreditSummary(account)}
          appName={app.name}
          avatarUrl={avatarUrl}
          unread={unread ?? 0}
        />
        <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">{children}</main>
      </div>

      <CommandPalette />
    </div>
  );
}
