import 'server-only';
import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/auth/session';

export type SeriesRow = Awaited<ReturnType<typeof loadSeries>>;

/**
 * Load a series the signed-in user may see: their own, an agency client's (read-only), or any
 * series when they are an admin. Returns `notFound()` otherwise — never a 403, so ids are not
 * enumerable.
 */
export async function loadSeries(seriesId: string, user: SessionUser) {
  const db = getAdminDb();
  const { data: series } = await db.from('series').select('*').eq('id', seriesId).maybeSingle();
  if (!series) notFound();

  const isOwner = series.user_id === user.id;
  if (!isOwner && user.role !== 'admin') {
    const { data: link } = await db
      .from('agency_clients')
      .select('owner_id')
      .eq('owner_id', user.id)
      .eq('client_id', series.user_id)
      .maybeSingle();
    if (!link) notFound();
  }

  return { series, isOwner: isOwner || user.role === 'admin' };
}
