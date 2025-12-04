import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Routes that don't require authentication
const publicRoutes = ['/login', '/auth/callback'];

// Route patterns for role-based access
const adminRoutes = /^\/admin/;
const driverRoutes = /^\/driver/;
const apiRoutes = /^\/api/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and API routes (API routes handle their own auth)
  if (publicRoutes.includes(pathname) || apiRoutes.test(pathname)) {
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
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
