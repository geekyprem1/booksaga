'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanLimits } from '@booksaga/shared';
import { saveCreditCost, saveDailyCap, savePlanLimits } from '@/app/admin/plans/actions';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

type Plan = { code: string; name: string; limits: Partial<PlanLimits> };
type Cost = { action: string; credits: number; pool: string };
const labels = {
  maxSeries: 'Active series (blank = unlimited)',
  maxBooksPerSeries: 'Books per series',
  maxClients: 'Agency clients',
  maxResellLicenses: 'Reseller licenses',
} as const;
const features = {
  paperbackWrap: 'Paperback wrap',
  boxSets: 'Box sets',
  audiobook: 'Audiobooks',
  franchiseKit: 'Franchise kit',
} as const;
const tiers = { templatesTier: 'Templates', dfyPacks: 'DFY packs' } as const;

export function PlanControls({
  plans,
  costs,
  dailyCap,
}: {
  plans: Plan[];
  costs: Cost[];
  dailyCap: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setMessage('');
    start(async () => {
      const result = await action();
      setMessage(result.ok ? 'Saved.' : (result.error?.message ?? 'Could not save.'));
      if (result.ok) router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold">Plans & credits</h1>
        <p className="text-sm text-muted-foreground">
          Changes apply to future actions and current account limits.
        </p>
      </header>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Daily book limit</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(() => saveDailyCap(Number(form.get('cap'))));
          }}
        >
          <label className="text-sm">
            Books per user per day
            <Input name="cap" type="number" min={1} max={100000} required defaultValue={dailyCap} />
          </label>
          <Button disabled={pending}>Save limit</Button>
        </form>
      </Card>
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Credit costs</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {costs.map((cost) => (
            <form
              key={cost.action}
              className="rounded-lg border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                run(() =>
                  saveCreditCost({ action: cost.action, credits: Number(form.get('credits')) }),
                );
              }}
            >
              <label className="block text-sm">
                {cost.action.replaceAll('_', ' ')} · {cost.pool} pool
                <Input
                  className="mt-1"
                  name="credits"
                  type="number"
                  min={0}
                  max={100000}
                  required
                  defaultValue={cost.credits}
                />
              </label>
              <Button className="mt-2" size="sm" variant="secondary" disabled={pending}>
                Save cost
              </Button>
            </form>
          ))}
        </div>
      </Card>
      <section>
        <h2 className="text-lg font-semibold">Plan limits</h2>
        <p className="text-sm text-muted-foreground">
          Limits combine across active plans. Blank active-series limit means unlimited.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <form
              key={plan.code}
              className="rounded-xl border border-border bg-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const limits = { ...plan.limits };
                for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
                  if (!(key in limits)) continue;
                  const value = String(form.get(key) ?? '').trim();
                  Object.assign(limits, {
                    [key]: key === 'maxSeries' && value === '' ? null : Number(value),
                  });
                }
                limits.lengthPresets = (['short', 'standard', 'full'] as const).filter((value) =>
                  form.has(`length-${value}`),
                );
                for (const key of Object.keys(features) as (keyof typeof features)[]) {
                  limits[key] = form.has(key);
                }
                for (const key of Object.keys(tiers) as (keyof typeof tiers)[]) {
                  limits[key] = form.get(key) as PlanLimits[typeof key];
                }
                run(() => savePlanLimits({ code: plan.code, limits }));
              }}
            >
              <h3 className="font-semibold">
                {plan.name} <span className="text-xs text-muted-foreground">{plan.code}</span>
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(Object.keys(labels) as (keyof typeof labels)[])
                  .filter((key) => key in plan.limits)
                  .map((key) => (
                    <label key={key} className="text-sm">
                      {labels[key]}
                      <Input
                        className="mt-1"
                        name={key}
                        type="number"
                        min={0}
                        max={key === 'maxBooksPerSeries' ? 30 : 100000}
                        required={key !== 'maxSeries'}
                        defaultValue={plan.limits[key] ?? ''}
                      />
                    </label>
                  ))}
              </div>
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Book lengths</legend>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(['short', 'standard', 'full'] as const).map((length) => (
                    <label key={length} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`length-${length}`}
                        defaultChecked={plan.limits.lengthPresets?.includes(length) ?? false}
                      />
                      {length}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Features included in this plan</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(Object.keys(features) as (keyof typeof features)[]).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={key}
                        defaultChecked={plan.limits[key] ?? false}
                      />
                      {features[key]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.keys(tiers) as (keyof typeof tiers)[]).map((key) => (
                  <label key={key} className="text-sm">
                    {tiers[key]}
                    <Select className="mt-1" name={key} defaultValue={plan.limits[key] ?? 'none'}>
                      <option value="none">None</option>
                      <option value="lite">Lite</option>
                      <option value="full">Full</option>
                    </Select>
                  </label>
                ))}
              </div>
              <Button className="mt-3" size="sm" variant="secondary" disabled={pending}>
                Save plan
              </Button>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
