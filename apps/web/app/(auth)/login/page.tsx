import Link from 'next/link';
import { BookOpen, Link2, Sparkles } from 'lucide-react';
import { LoginForm } from './login-form';
import { LogoMark } from '@/components/shell/logo';
import { getAppInfo, isEmailEnabled } from '@/lib/settings';
import { safeNextPath } from '@/lib/safe-redirect';
import { LegalLinks } from '@/components/legal-links';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

const FEATURES = [
  { icon: Sparkles, text: 'One idea in, a whole connected series out' },
  { icon: Link2, text: 'Same characters and world across every book' },
  { icon: BookOpen, text: 'KDP-ready files and matching covers' },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const [app, emailEnabled] = await Promise.all([getAppInfo(), isEmailEnabled()]);
  const safeNext = next ? safeNextPath(next, '') : '';

  return (
    <main className="app-backdrop grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" logoUrl={app.logoUrl} />
          <span className="text-brand-gradient text-2xl font-extrabold tracking-tight">
            {app.name}
          </span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl leading-tight font-extrabold">
            Turn one idea into a{' '}
            <span className="text-brand-gradient">bestselling book series</span>
          </h1>
          <ul className="mt-8 flex flex-col gap-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-muted-foreground">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-card">
                  <Icon className="size-4 text-violet-300" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {app.name}
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <LogoMark logoUrl={app.logoUrl} />
            <span className="text-brand-gradient text-xl font-extrabold">{app.name}</span>
          </div>
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Sign in to continue to your dashboard.
          </p>

          {reason === 'suspended' ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber-200"
            >
              Your account is suspended. Please contact support.
            </p>
          ) : null}

          <LoginForm next={safeNext || undefined} />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {emailEnabled ? (
              <Link href="/forgot-password" className="text-violet-300 hover:underline">
                Forgot your password?
              </Link>
            ) : app.supportEmail ? (
              <>
                Forgot your password? Contact{' '}
                <a className="text-violet-300 hover:underline" href={`mailto:${app.supportEmail}`}>
                  {app.supportEmail}
                </a>
              </>
            ) : (
              'Forgot your password? Contact support.'
            )}
          </p>
          <div className="mt-6">
            <LegalLinks />
          </div>
        </div>
      </section>
    </main>
  );
}
