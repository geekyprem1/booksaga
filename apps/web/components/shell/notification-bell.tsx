'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import {
  listNotificationsAction,
  markNotificationsReadAction,
  type NotificationRow,
} from '@/lib/notifications/actions';
import { cn } from '@/lib/utils';

/**
 * Bell + dropdown (T3.11). New notifications arrive over Realtime on the `notifications` table
 * (RLS keeps it to the signed-in user) with a 30s polling fallback.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const result = await listNotificationsAction(8);
    if (result.ok) {
      setItems(result.data);
      setUnread(result.data.filter((n) => !n.readAt).length);
    }
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel('notifications:bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          void load();
        },
      )
      .subscribe();

    const poll = setInterval(() => void load(), 30_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  async function markAll() {
    await markNotificationsReadAction({});
    setUnread(0);
    setItems((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? prev);
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        onClick={toggle}
        className="relative flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
              >
                <Check className="size-3" aria-hidden="true" /> Mark all read
              </button>
            ) : null}
          </div>

          <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {items === null ? (
              <li className="px-3 py-4 text-xs text-muted-foreground">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nothing yet. Generation results land here.
              </li>
            ) : (
              items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.link ?? '/notifications'}
                    onClick={() => {
                      setOpen(false);
                      if (!item.readAt) void markNotificationsReadAction({ ids: [item.id] });
                    }}
                    className={cn(
                      'block px-3 py-2.5 text-sm hover:bg-muted/50',
                      !item.readAt && 'bg-primary/5',
                    )}
                  >
                    <p className={cn('font-medium', !item.readAt && 'text-violet-100')}>
                      {item.title}
                    </p>
                    {item.body ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}
