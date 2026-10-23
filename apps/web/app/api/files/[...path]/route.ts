import { getSessionUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

/**
 * Signed-URL gateway for private files (T5.9).
 *
 *   /api/files/exports/<userId>/<bookId>/<exportId>.zip
 *
 * The first path segment after the bucket must be the caller's own user id (every upload uses that
 * layout), so a user can never read another account's files. Admins may read anything.
 */
const BUCKETS = new Set(['exports', 'covers', 'cover-art', 'uploads', 'audio']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { path } = await params;
  const [bucket, ...rest] = path;
  const objectPath = rest.join('/');

  if (!bucket || !BUCKETS.has(bucket) || !objectPath) {
    return new Response('Not found', { status: 404 });
  }

  const owner = objectPath.split('/')[0];
  if (owner !== user.id && user.role !== 'admin') {
    return new Response('Not found', { status: 404 });
  }

  const { data, error } = await getAdminDb()
    .storage.from(bucket)
    .createSignedUrl(objectPath, 300);

  if (error || !data?.signedUrl) return new Response('Not found', { status: 404 });

  return Response.redirect(data.signedUrl, 302);
}
