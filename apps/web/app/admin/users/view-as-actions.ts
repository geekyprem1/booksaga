'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { writeAudit } from '@booksaga/core';
import { AppError, getServerEnv } from '@booksaga/shared';
import { getRealSessionUser, requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { signViewAs, VIEW_AS_COOKIE, VIEW_AS_TTL_SECONDS } from '@/lib/auth/view-as-token';
import { assertWritable, getViewAsState } from '@/lib/auth/view-as';

export async function startViewAsAction(form: FormData): Promise<void> {
  await assertWritable();
  const admin = await requireAdmin();
  const userId = z.uuid().parse(form.get('userId'));
  const db = getAdminDb();
  const { data: target } = await db
    .from('profiles')
    .select('id, role, status')
    .eq('id', userId)
    .single();
  if (!target || target.role === 'admin' || target.status !== 'active')
    throw new AppError('FORBIDDEN', 'Choose an active user account.');
  const logged = await db
    .from('audit_log')
    .insert({
      actor_id: admin.id,
      action: 'user.view_as_start',
      target: `user:${userId}`,
      meta: { readOnly: true },
    });
  if (logged.error)
    throw new AppError('INTERNAL', 'Could not record the preview. Please try again.');
  (await cookies()).set(
    VIEW_AS_COOKIE,
    signViewAs(
      {
        adminId: admin.id,
        userId,
        expiresAt: Date.now() + VIEW_AS_TTL_SECONDS * 1000,
      },
      getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
    ),
    {
      httpOnly: true,
      secure: getServerEnv().APP_URL.startsWith('https:'),
      sameSite: 'strict',
      // Keep a session cookie after the 30-minute viewing window so a stale open tab's mutations
      // remain blocked until the admin explicitly exits or navigates through the expiry redirect.
      path: '/',
    },
  );
  redirect('/dashboard');
}

export async function exitViewAsAction(): Promise<void> {
  const real = await getRealSessionUser();
  const state = await getViewAsState(true);
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (!real || real.role !== 'admin' || real.status !== 'active') redirect('/login');
  if (state?.adminId === real.id) {
    await writeAudit(getAdminDb(), {
      actorId: real.id,
      action: 'user.view_as_end',
      target: `user:${state.userId}`,
      meta: { readOnly: true },
    });
  }
  redirect(state?.adminId === real.id ? `/admin/users/${state.userId}` : '/admin/users');
}
