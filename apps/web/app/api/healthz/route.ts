import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabase/admin';
import { getQueues } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/** Readiness includes both services needed to authenticate and enqueue jobs. */
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const [{ error }] = await Promise.race([
      Promise.all([
        getAdminDb().from('plans').select('code').limit(1).abortSignal(AbortSignal.timeout(3000)),
        getQueues().system.getJobCounts('waiting'),
      ]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness timeout')), 3000);
      }),
    ]);
    if (error) throw error;
    return NextResponse.json({ status: 'ok', db: true, redis: true });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
