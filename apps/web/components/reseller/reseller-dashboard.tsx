'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { createResellerCustomerAction, revokeResellerCustomerAction } from '@/lib/reseller/actions';

export interface ResellerCustomer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface FranchiseAsset {
  id: string;
  kind: 'sales_page' | 'swipe' | 'banner' | 'video' | 'other';
  title: string;
  description: string | null;
  url: string | null;
}

const KIND_LABELS: Record<FranchiseAsset['kind'], string> = {
  sales_page: 'Sales pages',
  swipe: 'Swipe copy',
  banner: 'Banners',
  video: 'Demo videos',
  other: 'Other',
};

export function ResellerDashboard({
  customers,
  available,
  used,
  maxLicences,
  assets,
}: {
  customers: ResellerCustomer[];
  available: number;
  used: number;
  maxLicences: number;
  assets: FranchiseAsset[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    setBusy('create');
    const response = await createResellerCustomerAction({ name, email });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setCredentials(response.data);
    setOpen(false);
    setName('');
    setEmail('');
    router.refresh();
  }

  async function revoke(customer: ResellerCustomer) {
    if (!confirm(`Revoke ${customer.email}? Their plan is withdrawn and the licence returns to you.`)) {
      return;
    }
    setError(null);
    setBusy(`revoke-${customer.id}`);
    const response = await revokeResellerCustomerAction({ customerId: customer.id });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  const grouped = assets.reduce<Record<string, FranchiseAsset[]>>((acc, asset) => {
    acc[asset.kind] = [...(acc[asset.kind] ?? []), asset];
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Licences left</p>
            <p className="text-2xl font-bold">
              {available}
              <span className="text-sm font-normal text-muted-foreground"> / {maxLicences}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Customers</p>
            <p className="text-2xl font-bold">{used}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Each customer gets</p>
            <p className="text-2xl font-bold">FE + 100</p>
            <p className="text-[11px] text-muted-foreground">one-time credits</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customers</CardTitle>
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={available === 0}>
            <Plus aria-hidden="true" /> Add customer
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers yet. Each one uses a licence and gets a ready-to-use FE account.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {customers.map((customer) => (
                <li key={customer.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{customer.name || customer.email}</p>
                    <p className="text-xs text-muted-foreground">{customer.email}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(customer)}
                    disabled={busy !== null}
                  >
                    {busy === `revoke-${customer.id}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Franchise kit</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Your admin has not published the promo kit yet.
            </p>
          ) : (
            (Object.keys(KIND_LABELS) as FranchiseAsset['kind'][])
              .filter((kind) => (grouped[kind] ?? []).length > 0)
              .map((kind) => (
                <div key={kind}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {KIND_LABELS[kind]}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {(grouped[kind] ?? []).map((asset) => (
                      <li key={asset.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                        <div>
                          <p className="text-sm font-medium">{asset.title}</p>
                          {asset.description ? (
                            <p className="text-xs text-muted-foreground">{asset.description}</p>
                          ) : null}
                        </div>
                        {asset.url ? (
                          <Button asChild size="sm" variant="secondary">
                            <a href={asset.url} target="_blank" rel="noreferrer">
                              {asset.kind === 'video' ? (
                                <ExternalLink aria-hidden="true" />
                              ) : (
                                <Download aria-hidden="true" />
                              )}
                              Open
                            </a>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(value) => (!value ? setOpen(false) : undefined)}>
        <DialogContent
          title="Add a customer"
          description="They get the FE plan and 100 credits. One licence is used."
          className="max-w-md"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-name">Name</Label>
              <Input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-email">Email</Label>
              <Input
                id="customer-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            <Button type="button" onClick={create} disabled={busy !== null || !name || !email}>
              {busy === 'create' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Create customer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentials)} onOpenChange={(value) => (!value ? setCredentials(null) : undefined)}>
        <DialogContent title="Customer login details" description="Copy these now — the password is not shown again." className="max-w-md">
          {credentials ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
                <p>Email: {credentials.email}</p>
                <p>Password: {credentials.password}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `Email: ${credentials.email}\nPassword: ${credentials.password}`,
                  );
                }}
              >
                <Copy aria-hidden="true" /> Copy login details
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
