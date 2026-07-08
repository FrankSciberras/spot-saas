import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Routes that don't require authentication (exact match)
const publicRoutes = ['/', '/login', '/auth/callback', '/offline', '/privacy', '/terms', '/security', '/integrations'];

// Public route prefixes — anything under these is open (marketing pages, etc.)
const publicPrefixes = ['/features', '/about', '/careers', '/contact', '/blog'];

// Route patterns for role-based access
const adminRoutes = /^\/fleet/;
const driverRoutes = /^\/driver/;
const apiRoutes = /^\/api/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and API routes (API routes handle their own auth)
  const isPublic =
    publicRoutes.includes(pathname) ||
    publicPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    apiRoutes.test(pathname);
  if (isPublic) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // Update session and get user
  const { supabaseResponse, user } = await updateSession(request);

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
