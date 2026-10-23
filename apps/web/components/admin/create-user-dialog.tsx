'use client';

import { useState, useTransition } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, PLAN_CODES, type PlanCode } from '@booksaga/shared';
import { CredentialsDialog, type CredentialsView } from './credentials-dialog';
import { createUserAction } from '@/app/admin/users/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';

export function PlanPicker({
  selected,
  onChange,
  disabled,
  exclude = [],
}: {
  selected: Set<PlanCode>;
  onChange: (next: Set<PlanCode>) => void;
  disabled?: boolean;
  exclude?: PlanCode[];
}) {
  const codes = PLAN_CODES.filter((c) => !exclude.includes(c));
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">Plans</legend>
      {codes.map((code) => {
        const plan = PLANS[code];
        const checked = selected.has(code);
        return (
          <label
            key={code}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background/40 p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-violet-500"
              checked={checked}
              onChange={() => {
                const next = new Set(selected);
                if (checked) next.delete(code);
                else next.add(code);
                onChange(next);
              }}
            />
            <span>
              <span className="block font-medium">{plan.name}</span>
              <span className="block text-xs text-muted-foreground">
                {plan.level}
                {plan.isDownsell ? ' · downsell' : ''} · ${plan.priceUsd}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [plans, setPlans] = useState<Set<PlanCode>>(new Set(['fe']));
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail('');
    setName('');
    setPlans(new Set(['fe']));
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUserAction({ email, name, plans: [...plans] });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const { created, credentials: creds, grantedPlans, alreadyHeld } = result.data;
      setOpen(false);
      reset();
      if (created && creds) {
        setCredentials(creds);
      } else {
        toast.info(
          grantedPlans.length > 0
            ? `Account already existed. Added: ${grantedPlans.join(', ')}.`
            : `Account already existed and already has: ${alreadyHeld.join(', ')}.`,
        );
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <UserPlus aria-hidden="true" /> Create user
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Create user"
          description="A password is generated automatically. You'll be shown the login details once."
          className="max-w-xl"
        >
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-name">Name</Label>
                <Input
                  id="cu-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cu-email">Email</Label>
                <Input
                  id="cu-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Plans purchased</Label>
              <PlanPicker selected={plans} onChange={setPlans} disabled={pending} />
              <p className="text-xs text-muted-foreground">
                Each plan adds its one-time credits. If the email already has an account, the
                selected plans are added to it.
              </p>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-rose-200"
              >
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || plans.size === 0}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Create user
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
        title="User created"
      />
    </>
  );
}
