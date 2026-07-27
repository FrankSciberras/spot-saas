import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAppRoute } from '@/lib/routes';

/*
 * Auth gate. Routes requiring a signed-in user come from APP_ROUTE_PREFIXES in
 * lib/routes.ts — add new private sections there, not here.
 *
 * Anything not listed is treated as public and handed to Next. (Page server
 * components still run their own requireAuth/role checks — this is the first
 * gate, not the only one.)
 *
 * The previous version inverted this: everything not on a public allow-list was
 * redirected to /login. That quietly broke SEO — every unknown or retired URL
 * answered `200 OK` with the login page instead of a real 404, so Google saw
 * soft-404s and dead URLs never dropped out of the index.
 */

/** API routes authenticate themselves; middleware must not redirect them to HTML. */
const isApiRoute = (pathname: string) => pathname.startsWith('/api');

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public marketing pages and unknown paths: skip the Supabase session refresh
  // entirely. Touching auth here added a network round-trip to every page view
  // and marked the response uncacheable, so marketing pages could never be
  // served from cache. Unknown paths fall through to Next's not-found (a real
  // 404) instead of being redirected to /login.
  if (!isAppRoute(pathname) && !isApiRoute(pathname)) {
    return NextResponse.next();
  }

  // Update session and get user
  const { supabaseResponse, user } = await updateSession(request);

  // API routes handle their own authorization; just keep the session fresh.
  if (isApiRoute(pathname)) {
    return supabaseResponse;
  }

  // Redirect to login if not authenticated
  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // For authenticated users, we let the page handle role-based access
  // The actual role check happens in the page server components
  // This is because we need to query the users table to get the role

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt / sitemap.xml (search engine files — must never redirect)
     * - manifest.webmanifest (PWA manifest)
     * - sw.js (service worker)
     * - icons folder (PWA icons)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
