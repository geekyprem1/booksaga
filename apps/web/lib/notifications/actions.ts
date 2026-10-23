'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@booksaga/shared';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const map = (row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}): NotificationRow => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  link: row.link,
  readAt: row.read_at,
  createdAt: row.created_at,
});

export async function listNotificationsAction(
  limit = 20,
): Promise<ActionResult<NotificationRow[]>> {
  return runAction(async () => {
    const user = await requireUser();
    const { data, error } = await getAdminDb()
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new AppError('INTERNAL', `Could not load notifications: ${error.message}`);
    return (data ?? []).map(map);
  });
}

export async function unreadCountAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const user = await requireUser();
    const { count, error } = await getAdminDb()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) throw new AppError('INTERNAL', `Could not count notifications: ${error.message}`);
    return count ?? 0;
  });
}

export async function markNotificationsReadAction(input: {
  ids?: string[];
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const ids = z.array(z.string().uuid()).optional().parse(input.ids);
    const db = getAdminDb();

    let query = db
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (ids && ids.length > 0) query = query.in('id', ids);

    const { error } = await query;
    if (error) throw new AppError('INTERNAL', `Could not update notifications: ${error.message}`);

    revalidatePath('/notifications');
    return undefined;
  });
}
