'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface CredentialsView {
  email: string;
  password: string;
  loginUrl: string;
}

export function formatCredentials(c: CredentialsView, appName = 'BookSaga'): string {
  return [
    `${appName} login details`,
    `Login URL: ${c.loginUrl}`,
    `Email: ${c.email}`,
    `Password: ${c.password}`,
  ].join('\n');
}

/**
 * Shows generated login details ONCE. Plain-text passwords are never stored, so closing this
 * dialog means they can only be replaced by resetting the password.
 */
export function CredentialsDialog({
  credentials,
  onClose,
  title = 'Login details',
}: {
  credentials: CredentialsView | null;
  onClose: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(formatCredentials(credentials));
      setCopied(true);
      toast.success('Login details copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy automatically. Select the text and copy it manually.');
    }
  }

  return (
    <Dialog open={credentials !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        title={title}
        description="This password is shown only once. Copy it now and send it to the buyer."
      >
        {credentials ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-background/60 p-4 text-sm">
              <dt className="text-muted-foreground">Login URL</dt>
              <dd className="font-mono break-all">{credentials.loginUrl}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-mono break-all">{credentials.email}</dd>
              <dt className="text-muted-foreground">Password</dt>
              <dd className="font-mono break-all select-all">{credentials.password}</dd>
            </dl>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={copy}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy login details'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
