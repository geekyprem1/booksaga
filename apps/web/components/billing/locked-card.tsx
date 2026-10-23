import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Shown in place of a gated feature (T6.1). */
export function LockedCard({
  feature,
  planCode,
  description,
}: {
  feature: string;
  planCode: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted">
          <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-semibold">{feature} is not included in your plan</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {description ?? 'Upgrade to unlock it — everything you have already generated stays.'}
          </p>
        </div>
        <UpgradeCTA planCode={planCode} />
      </CardContent>
    </Card>
  );
}

export function UpgradeCTA({ planCode, label }: { planCode: string; label?: string }) {
  return (
    <Button asChild>
      <Link href={`/upgrade/${planCode}`}>{label ?? 'Unlock this feature'}</Link>
    </Button>
  );
}
