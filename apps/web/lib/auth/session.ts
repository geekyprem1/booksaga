import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminDb } from '@/lib/supabase/admin';
import { getViewAsState } from './view-as';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  parentAgencyId: string | null;
  resellerOwnerId: string | null;
  avatarUrl: string | null;
  lastActiveAt: string | null;
  viewingAs?: boolean;
}

const ACTIVITY_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Current user + profile, or null when signed out. Cached per request. */
export const getRealSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, email, name, role, status, parent_agency_id, reseller_owner_id, avatar_url, last_active_at',
    )
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role === 'admin' ? 'admin' : 'user',
    status: profile.status === 'suspended' ? 'suspended' : 'active',
    parentAgencyId: profile.parent_agency_id,
    resellerOwnerId: profile.reseller_owner_id,
    avatarUrl: profile.avatar_url,
    lastActiveAt: profile.last_active_at,
  };
});

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const real = await getRealSessionUser();
  const state = await getViewAsState(true);
  if (
    !real ||
    !state ||
    real.role !== 'admin' ||
    real.status !== 'active' ||
    state.adminId !== real.id
  )
    return real;
  if (state.expiresAt <= Date.now()) redirect('/admin/view-as/exit');
  const { data: profile } = await getAdminDb()
    .from('profiles')
    .select(
      'id, email, name, role, status, parent_agency_id, reseller_owner_id, avatar_url, last_active_at',
    )
    .eq('id', state.userId)
    .maybeSingle();
  if (!profile || profile.role === 'admin' || profile.status !== 'active') {
    redirect('/admin/view-as/exit');
  }
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: 'user',
    status: 'active',
    parentAgencyId: profile.parent_agency_id,
    resellerOwnerId: profile.reseller_owner_id,
    avatarUrl: profile.avatar_url,
    lastActiveAt: profile.last_active_at,
    viewingAs: true,
  };
});

/**
 * Require a signed-in, active user. Redirects to /login otherwise. Suspended users are signed out.
 * Also records activity (analytics only), at most once per hour per user.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.status !== 'active') redirect('/auth/signout?reason=suspended');

  const last = user.lastActiveAt ? Date.parse(user.lastActiveAt) : 0;
  if (!user.viewingAs && Date.now() - last > ACTIVITY_TOUCH_INTERVAL_MS) {
    await getAdminDb()
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id);
  }
  return user;
}

/** Require an active admin. Non-admins get a 404 so the admin area is not discoverable. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') notFound();
  return user;
}
