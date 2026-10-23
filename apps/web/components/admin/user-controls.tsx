'use client';

import { useState, useTransition } from 'react';
import { Ban, CheckCircle2, KeyRound, Loader2, MinusCircle, PlusCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, PLAN_CODES, type CreditPool, type PlanCode } from '@booksaga/shared';
import { CredentialsDialog, type CredentialsView } from './credentials-dialog';
import {
  adjustCreditsAction,
  grantPlanAction,
  markCredentialsSentAction,
  resetPasswordAction,
  revokePlanAction,
  setStatusAction,
  updateNameAction,
} from '@/app/admin/users/actions';
import type { ActionResult } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';

/** Run a server action in a transition and surface the outcome as a toast. */
function useRunner() {
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk: (data: T) => void | string) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const msg = onOk(r.data);
      if (typeof msg === 'string') toast.success(msg);
    });
  }
  return { pending, run };
}

export function StatusToggle({
  userId,
  status,
  isSelf,
}: {
  userId: string;
  status: 'active' | 'suspended';
  isSelf: boolean;
}) {
  const { pending, run } = useRunner();
  const next = status === 'active' ? 'suspended' : 'active';
  return (
    <Button
      variant={status === 'active' ? 'outline' : 'default'}
      disabled={pending || isSelf}
      title={isSelf ? 'You cannot change your own status' : undefined}
      onClick={() => {
        if (
          next === 'suspended' &&
          !confirm('Suspend this account? They will be blocked immediately.')
        )
          return;
        run(
          () => setStatusAction({ userId, status: next }),
          () => (next === 'suspended' ? 'Account suspended.' : 'Account reactivated.'),
        );
      }}
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : status === 'active' ? (
        <Ban aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      {status === 'active' ? 'Suspend' : 'Reactivate'}
    </Button>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const { pending, run } = useRunner();
  const [creds, setCreds] = useState<CredentialsView | null>(null);
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm('Generate a new password? The current one stops working immediately.'))
            return;
          run(
            () => resetPasswordAction({ userId }),
            (c) => void setCreds(c),
          );
        }}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        Reset password
      </Button>
      <CredentialsDialog credentials={creds} onClose={() => setCreds(null)} title="New password" />
    </>
  );
}

export function MarkSentButton({ userId }: { userId: string }) {
  const { pending, run } = useRunner();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        run(
          () => markCredentialsSentAction({ userId }),
          () => 'Marked as sent.',
        )
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <Send aria-hidden="true" />
      )}
      Mark credentials as sent
    </Button>
  );
}

export function EditNameForm({ userId, name }: { userId: string; name: string }) {
  const { pending, run } = useRunner();
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => updateNameAction({ userId, name: value }),
          () => 'Name updated.',
        );
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending || value.trim() === name}>
        Save
      </Button>
    </form>
  );
}

export function GrantPlanForm({ userId, held }: { userId: string; held: PlanCode[] }) {
  const { pending, run } = useRunner();
  const available = PLAN_CODES.filter((c) => !held.includes(c));
  const [plan, setPlan] = useState<PlanCode | ''>(available[0] ?? '');

  if (available.length === 0) {
    return <p className="text-sm text-muted-foreground">This user already holds every plan.</p>;
  }
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!plan) return;
        run(
          () => grantPlanAction({ userId, plan }),
          (d) =>
            d.granted ? 'Plan granted and credits added.' : 'The user already had this plan.',
        );
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="grant-plan">Grant a plan</Label>
        <Select id="grant-plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}>
          {available.map((c) => (
            <option key={c} value={c}>
              {PLANS[c].name} ({PLANS[c].level}
              {PLANS[c].isDownsell ? ' downsell' : ''})
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending || !plan}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <PlusCircle aria-hidden="true" />
        )}
        Grant
      </Button>
    </form>
  );
}

export function RevokePlanButton({ userId, plan }: { userId: string; plan: PlanCode }) {
  const { pending, run } = useRunner();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-rose-300 hover:text-rose-200"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${PLANS[plan].name}"? Its remaining credits will be taken back.`))
          return;
        run(
          () => revokePlanAction({ userId, plan }),
          (d) => `Plan revoked. ${d.creditsRemoved} credits removed.`,
        );
      }}
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <MinusCircle aria-hidden="true" />
      )}
      Revoke
    </Button>
  );
}

export function AdjustCreditsForm({ userId }: { userId: string }) {
  const { pending, run } = useRunner();
  const [pool, setPool] = useState<CreditPool>('main');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  return (
    <form
      className="grid gap-3 sm:grid-cols-[8rem_8rem_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number.parseInt(amount, 10);
        if (!Number.isInteger(n) || n === 0) {
          toast.error('Enter a non-zero whole number (use a minus sign to deduct).');
          return;
        }
        run(
          () => adjustCreditsAction({ userId, pool, amount: n, reason }),
          (d) => {
            setAmount('');
            setReason('');
            return `Done. New balance: ${d.balance}.`;
          },
        );
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-pool">Pool</Label>
        <Select id="adj-pool" value={pool} onChange={(e) => setPool(e.target.value as CreditPool)}>
          <option value="main">Main</option>
          <option value="audio">Audio</option>
          <option value="agency">Agency</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-amount">Amount (±)</Label>
        <Input
          id="adj-amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="+100 or -50"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="adj-reason">Reason (required)</Label>
        <Input
          id="adj-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="e.g. Support bonus"
        />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Apply
        </Button>
      </div>
    </form>
  );
}
