'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, Plus, ShieldCheck, UserX } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import {
  createClientAction,
  setClientAllotmentAction,
  setClientStatusAction,
} from '@/lib/agency/actions';

export interface AgencyClientRow {
  clientId: string;
  name: string;
  email: string;
  status: 'active' | 'suspended';
  allotment: number;
  used: number;
  seriesCount: number;
  createdAt: string;
}

export function AgencyClients({
  clients,
  poolBalance,
  maxClients,
  planName,
}: {
  clients: AgencyClientRow[];
  poolBalance: number;
  maxClients: number;
  planName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [allotment, setAllotment] = useState(500);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    setBusy('create');
    const response = await createClientAction({ name, email, allotment });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setCredentials({ email: response.data.email, password: response.data.password });
    setOpen(false);
    setName('');
    setEmail('');
    router.refresh();
  }

  async function toggleStatus(client: AgencyClientRow) {
    setError(null);
    setBusy(`status-${client.clientId}`);
    const response = await setClientStatusAction({
      clientId: client.clientId,
      status: client.status === 'active' ? 'suspended' : 'active',
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  async function changeAllotment(client: AgencyClientRow, value: number) {
    setError(null);
    setBusy(`allotment-${client.clientId}`);
    const response = await setClientAllotmentAction({ clientId: client.clientId, allotment: value });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  const totalUsed = clients.reduce((sum, client) => sum + client.used, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Agency pool</p>
            <p className="text-2xl font-bold">{poolBalance.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">clients spend from here</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Clients</p>
            <p className="text-2xl font-bold">
              {clients.length}
              <span className="text-sm font-normal text-muted-foreground"> / {maxClients}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{planName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Allotted / used</p>
            <p className="text-2xl font-bold">
              {clients.reduce((sum, client) => sum + client.allotment, 0).toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {totalUsed.toLocaleString()}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">across all clients</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clients</CardTitle>
          <Button
            type="button"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={clients.length >= maxClients}
          >
            <Plus aria-hidden="true" /> Add client
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet. Add one and hand over the login details.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {clients.map((client) => {
                const remaining = Math.max(0, client.allotment - client.used);
                return (
                  <li key={client.clientId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{client.name || client.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.email} · {client.seriesCount} series
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right text-xs">
                        <p className="tabular-nums">
                          <span className="font-semibold">{remaining}</span> left of {client.allotment}
                        </p>
                        <p className="text-muted-foreground">{client.used} used</p>
                      </div>

                      <div className="flex items-center gap-1">
                        {[100, 500, 1000].map((value) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => changeAllotment(client, value)}
                            disabled={busy !== null || value < client.used}
                            title={`Set the allotment to ${value}`}
                          >
                            {busy === `allotment-${client.clientId}` ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              value
                            )}
                          </Button>
                        ))}
                      </div>

                      <Badge variant={client.status === 'active' ? 'success' : 'muted'}>
                        {client.status}
                      </Badge>

                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleStatus(client)}
                        disabled={busy !== null}
                      >
                        {client.status === 'active' ? (
                          <>
                            <UserX aria-hidden="true" /> Suspend
                          </>
                        ) : (
                          <>
                            <ShieldCheck aria-hidden="true" /> Activate
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(value) => (!value ? setOpen(false) : undefined)}>
        <DialogContent
          title="Add a client"
          description="They sign in with these credentials and spend from your agency pool."
          className="max-w-md"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-name">Name</Label>
              <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-allotment">Credit allotment</Label>
              <Input
                id="client-allotment"
                type="number"
                min={0}
                value={allotment}
                onChange={(event) => setAllotment(Number(event.target.value))}
              />
            </div>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            <Button type="button" onClick={create} disabled={busy !== null || !email || !name}>
              {busy === 'create' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Create client
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentials)} onOpenChange={(value) => (!value ? setCredentials(null) : undefined)}>
        <DialogContent title="Client login details" description="Copy these now — the password is not shown again." className="max-w-md">
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
