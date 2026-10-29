import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16 renamed `middleware` to `proxy`. It refreshes the Supabase session cookie and keeps
// signed-out visitors away from the app. Authorisation (admin, suspended, plans) is enforced
// server-side in requireUser()/requireAdmin(), not here.
const PUBLIC_PATHS = [
  /^\/login(\/|$)/,
  /^\/auth\//,
  /^\/forgot-password(\/|$)/,
  /^\/reset-password(\/|$)/,
  /^\/legal\//,
  /^\/api\/healthz$/,
  /^\/api\/webhooks\//,
];

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const realtimeUrl = `${supabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${supabaseUrl.host}`;
  const development = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${supabaseUrl.origin} ${realtimeUrl}${development ? ' ws: wss:' : ''}`,
    `img-src 'self' data: blob: https: ${supabaseUrl.origin}`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${supabaseUrl.origin}`,
    "worker-src 'self' blob:",
    `frame-src 'self' blob: ${supabaseUrl.origin} https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_URL?.startsWith('https://') ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const next = () => {
    const result = NextResponse.next({ request: { headers: requestHeaders } });
    result.headers.set('Content-Security-Policy', csp);
    if (process.env.APP_URL?.startsWith('https://'))
      result.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return result;
  };
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const { name, value } of list) request.cookies.set(name, value);
          requestHeaders.set('cookie', request.cookies.toString());
          response = next();
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getUser() validates the token with the auth server (never trust the cookie alone).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));

  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    redirect.headers.set('Content-Security-Policy', csp);
    if (process.env.APP_URL?.startsWith('https://'))
      redirect.headers.set('Strict-Transport-Security', 'max-age=31536000');
    // Carry over refreshed session cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return redirectTo(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return redirectTo(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
