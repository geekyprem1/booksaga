'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setContentPublishedAction } from '@/lib/admin/templates-actions';

export interface ContentRow {
  id: string;
  label: string;
  sub: string;
  tier: string;
  published: boolean;
}

export function ContentAdmin({
  table,
  title,
  rows,
}: {
  table: 'templates' | 'dfy_ideas' | 'dfy_packs';
  title: string;
  rows: ContentRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(row: ContentRow) {
    setBusy(row.id);
    await setContentPublishedAction({ table, id: row.id, published: !row.published });
    setBusy(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          <Badge variant="muted">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{row.label}</p>
                <p className="truncate text-xs text-muted-foreground">{row.sub}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.tier === 'lite' ? 'muted' : 'success'}>{row.tier}</Badge>
                <Badge variant={row.published ? 'success' : 'danger'}>
                  {row.published ? 'live' : 'hidden'}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle(row)}
                  disabled={busy === row.id}
                  aria-label={row.published ? 'Hide' : 'Publish'}
                >
                  {row.published ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
