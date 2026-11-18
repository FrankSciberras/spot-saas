import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { authorizeUrl, isXeroConfigured } from '@/lib/xero/client';
import { XERO_STATE_COOKIE, XERO_STATE_MAX_AGE, newOauthState } from '@/lib/xero/oauth-state';
import { appUrl } from '@/lib/urls';

/**
 * GET /api/xero/connect
 * Sends a fleet ADMIN to Xero to approve the connection. Xero sends them back
 * to /api/xero/callback.
 */
export const dynamic = 'force-dynamic';

const back = (params: string) => NextResponse.redirect(`${appUrl()}/fleet/xero${params}`);

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);
  if (user.role !== 'admin') return back('?error=not_admin');
  if (!isXeroConfigured()) return back('?error=not_configured');

  const { state, cookie } = newOauthState(user.organization_id, user.id);
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set(XERO_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    // Lax: the cookie must come back on the top-level redirect from Xero.
    sameSite: 'lax',
    path: '/api/xero',
    maxAge: XERO_STATE_MAX_AGE,
  });
  return response;
}
