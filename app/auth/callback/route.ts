import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Auth callback route for Supabase OAuth/Magic Link/Password Recovery authentication
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const nextParam = requestUrl.searchParams.get('next') || '/';
  // Only allow internal paths — block open-redirect via absolute/protocol-relative URLs.
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Password recovery and fleet invites both land on the set-password page
    // (an invited user has no password yet).
    if (type === 'recovery' || type === 'invite') {
      return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
