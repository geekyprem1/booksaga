import 'server-only';
import { cache } from 'react';
import { getAdminDb } from '@/lib/supabase/admin';

/**
 * Signed URL for a private avatar object. Cached per request; falls back to null (initials) when
 * there is no avatar or the object is gone.
 */
export const getAvatarUrl = cache(async (path: string | null): Promise<string | null> => {
  if (!path) return null;
  const { data } = await getAdminDb().storage.from('avatars').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
});
