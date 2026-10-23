import { notFound } from 'next/navigation';
import { Hammer, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getAccount } from '@/lib/account';
import { findNavItem, isNavUnlocked } from '@/lib/nav';
import { getUpgradeUrl } from '@/lib/settings';

/**
 * Placeholder for sidebar modules whose real pages ship in later milestones. It already applies
 * the plan gate: locked modules show the Upgrade CTA instead of the module.
 */
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const item = findNavItem(slug);
  if (!item || item.slug === 'dashboard') notFound();

  const { account } = await getAccount();
  const unlocked = isNavUnlocked(item, account.entitlements);
  const upgradeUrl = !unlocked && item.upgradeLevel ? await getUpgradeUrl(item.upgradeLevel) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-10">
      <h1 className="text-3xl font-extrabold">{item.label}</h1>
      <p className="text-muted-foreground">{item.description}</p>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          {unlocked ? (
            <>
              <Hammer className="size-8 text-violet-300" aria-hidden="true" />
              <p className="font-semibold">Coming soon</p>
              <p className="text-sm text-muted-foreground">
                This module is being built{item.milestone ? ` (milestone ${item.milestone})` : ''}.
              </p>
            </>
          ) : (
            <>
              <Lock className="size-8 text-amber" aria-hidden="true" />
              <p className="font-semibold">{item.label} is not included in your plan</p>
              <p className="text-sm text-muted-foreground">
                Upgrade to unlock this module{item.upgradeLevel ? ` (${item.upgradeLevel})` : ''}.
              </p>
              {upgradeUrl ? (
                <Button asChild>
                  <a href={upgradeUrl} target="_blank" rel="noopener noreferrer">
                    Upgrade now
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Contact support to upgrade your account.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
