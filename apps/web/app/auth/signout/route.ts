import { NextResponse, type NextRequest } from 'next/server';
import { getServerEnv } from '@booksaga/shared';
import { createClient } from '@/lib/supabase/server';
import { VIEW_AS_COOKIE } from '@/lib/auth/view-as-token';

function loginUrl(reason?: string) {
  const url = new URL('/login', getServerEnv().APP_URL);
  if (reason) url.searchParams.set('reason', reason);
  return url;
}

/** User-initiated sign out (form POST from the user menu). */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(loginUrl(), 303);
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}

/**
 * Forced sign out used when a suspended account hits the app. Only the `suspended` reason is
 * honoured so this endpoint cannot be used for arbitrary logout links.
 */
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('reason') !== 'suspended') {
    return NextResponse.redirect(loginUrl(), 303);
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(loginUrl('suspended'), 303);
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
