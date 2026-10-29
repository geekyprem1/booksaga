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
import { LegalLinks } from '@/components/legal-links';
import { exitViewAsAction } from '@/app/admin/users/view-as-actions';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 overflow-y-auto border-r border-border bg-background p-4 lg:flex">
        <div className="px-2 pt-1">
          <Logo name={app.name} logoUrl={app.logoUrl} />
        </div>
        <SidebarNav items={items} isAdmin={user.role === 'admin'} />
      </aside>

      <div className="lg:pl-64">
        <Topbar
          preview={
            user.viewingAs ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b border-amber/50 bg-background px-4 py-3 text-sm text-foreground"
                role="region"
                aria-label="Read-only user preview"
              >
                <p>
                  <strong>Read-only preview</strong> · {user.email}. Changes are disabled.
                </p>
                <form action={exitViewAsAction}>
                  <Button type="submit" variant="secondary" className="min-h-11">
                    Back to admin
                  </Button>
                </form>
              </div>
            ) : null
          }
          items={items}
          user={{ name: user.name, email: user.email, role: user.role }}
          credits={buildCreditSummary(account)}
          appName={app.name}
          logoUrl={app.logoUrl}
          avatarUrl={avatarUrl}
          unread={unread ?? 0}
        />
        <main className="w-full min-w-0 p-4 lg:p-6">{children}</main>
        <footer className="p-6">
          <LegalLinks />
        </footer>
      </div>

      <CommandPalette />
    </div>
  );
}
