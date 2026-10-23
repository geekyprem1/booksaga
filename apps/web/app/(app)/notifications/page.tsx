import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser();
  const { data } = await getAdminDb()
    .from('notifications')
    .select('id, type, title, body, link, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const items = data ?? [];
  const unread = items.filter((item) => !item.read_at).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
          </p>
        </div>
        {unread > 0 ? <MarkAllRead /> : null}
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Bell className="size-7 text-violet-300" aria-hidden="true" />
            <p className="font-semibold">Nothing yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generation results, refunds and arc extensions show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.link ?? '/notifications'}
                className={cn(
                  'flex flex-col gap-1 p-4 hover:bg-muted/40',
                  !item.read_at && 'bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <p className={cn('font-semibold', !item.read_at && 'text-violet-100')}>
                    {item.title}
                  </p>
                  {!item.read_at ? <Badge variant="default">new</Badge> : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                {item.body ? (
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                ) : null}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
