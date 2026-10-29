import { getSessionUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { checkRateLimit } from '@booksaga/core';
import { isAppError } from '@booksaga/shared';
import { getQueues } from '@/lib/queue';

/**
 * Signed-URL gateway for private files (T5.9).
 *
 *   /api/files/exports/<userId>/<bookId>/<exportId>.zip          -> 302 to a 5-minute signed URL
 *   /api/files/exports/<userId>/<bookId>/<exportId>.zip?stream=1 -> proxied bytes (for pdf.js)
 *
 * The first path segment after the bucket must be the caller's own user id (every upload uses that
 * layout), so a user can never read another account's files. Admins may read anything.
 */
const BUCKETS = new Set(['exports', 'covers', 'cover-art', 'uploads', 'audio']);

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
};

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
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

  try {
    await checkRateLimit(getQueues(), 'downloads', user.id, 120, 60_000);
  } catch (error) {
    const limited = isAppError(error) && error.code === 'RATE_LIMITED';
    return new Response(limited ? 'Too many downloads' : 'Downloads temporarily unavailable', {
      status: limited ? 429 : 503,
      headers: {
        'retry-after': String(isAppError(error) ? (error.details?.retryAfter ?? 60) : 60),
      },
    });
  }

  const db = getAdminDb();
  const stream = new URL(request.url).searchParams.get('stream') === '1';

  if (stream) {
    const download = await db.storage.from(bucket).download(objectPath);
    if (download.error || !download.data) return new Response('Not found', { status: 404 });

    const extension = objectPath.split('.').pop()?.toLowerCase() ?? '';
    return new Response(await download.data.arrayBuffer(), {
      headers: {
        'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=60',
      },
    });
  }

  const { data, error } = await db.storage.from(bucket).createSignedUrl(objectPath, 300);
  if (error || !data?.signedUrl) return new Response('Not found', { status: 404 });

  return Response.redirect(data.signedUrl, 302);
}
