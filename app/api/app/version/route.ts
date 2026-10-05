import { NextResponse } from 'next/server';
import { appReleaseInfo, PLAY_STORE_APP_URL, PLAY_STORE_WEB_URL } from '@/lib/app-release';

/**
 * GET /api/app/version — which Rovora Driver version drivers need.
 * Public (the driver portal asks before it knows anything else). See
 * lib/app-release for where the numbers come from.
 */
export async function GET() {
  const info = await appReleaseInfo();
  return NextResponse.json(
    { ...info, storeUrl: PLAY_STORE_APP_URL, storeWebUrl: PLAY_STORE_WEB_URL },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
