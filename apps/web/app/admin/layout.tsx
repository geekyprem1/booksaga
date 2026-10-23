import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AdminNav } from '@/components/admin/admin-nav';
import { Logo } from '@/components/shell/logo';
import { UserMenu } from '@/components/shell/user-menu';
import { requireAdmin } from '@/lib/auth/session';
import { getAppInfo } from '@/lib/settings';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, app] = await Promise.all([requireAdmin(), getAppInfo()]);

  return (
    <div className="app-backdrop min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-8">
          <Logo name={app.name} href="/admin" />
          <span className="hidden items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-xs font-semibold text-violet-200 sm:inline-flex">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Admin
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to app
            </Link>
            <UserMenu name={admin.name} email={admin.email} role={admin.role} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-2 lg:px-8">
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">{children}</main>
    </div>
  );
}
