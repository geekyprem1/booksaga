import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, ShoppingBag } from 'lucide-react';
import { PLANS, type PlanCode } from '@booksaga/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSetting, getAppInfo } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Upgrade entry point (T6.1). The sales pages live outside the app (WarriorPlus/JVZoo), so the
 * admin stores each OTO URL in `app_settings.upgrade_urls` and this route redirects to it.
 */
export default async function UpgradePage({ params }: { params: Promise<{ planCode: string }> }) {
  const { planCode } = await params;
  const [stored, legacy] = await Promise.all([
    getSetting<Record<string, string>>('upgrade_urls'),
    getSetting<Record<string, string>>('oto_urls'),
  ]);
  const urls = stored ?? {};
  const target = urls[planCode.toUpperCase()] ?? urls[planCode] ?? legacy?.[planCode];
  if (target && /^https?:\/\//i.test(target)) redirect(target);
  const app = await getAppInfo();

  const plan = PLANS[planCode as PlanCode];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="size-6 text-violet-300" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">{plan?.name ?? `Upgrade: ${planCode}`}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The checkout link for this upgrade has not been configured yet. Ask your admin to set
              it under Admin → Settings → OTO links, then reopen this page.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back to the dashboard</Link>
            </Button>
            {plan?.priceUsd && app.supportEmail ? (
              <Button asChild>
                <a
                  href={`mailto:${app.supportEmail}?subject=Upgrade%20request`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden="true" /> Request this upgrade
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
