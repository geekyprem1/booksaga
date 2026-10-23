import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Liveness + DB reachability. Redis is added with the queue in M2. */
export async function GET() {
  try {
    const { error } = await getAdminDb().from('plans').select('code').limit(1);
    if (error) throw error;
    return NextResponse.json({ status: 'ok', db: true });
  } catch {
    return NextResponse.json({ status: 'error', db: false }, { status: 503 });
  }
}
