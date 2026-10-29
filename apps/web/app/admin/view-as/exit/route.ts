import { NextResponse, type NextRequest } from 'next/server';
import { VIEW_AS_COOKIE } from '@/lib/auth/view-as-token';

/** Clear an expired/deleted target without impersonating or mutating that account. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin/users', request.url));
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
