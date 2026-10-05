import { NextResponse } from 'next/server';
import { runTrackingWatch } from '@/lib/tracking/watch';
import { isPlatformAdmin } from '@/lib/auth/platform';

/**
 * GET /api/cron/tracking-watch
 * Detects drivers whose location sharing went silent (and came back), and
 * nudges silent on-shift drivers — see lib/tracking/watch.ts.
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */
async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    const url = new URL(request.url);
    if (header === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  return isPlatformAdmin();
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // Same job the server also runs every minute (lib/cron/internal-scheduler);
    // this endpoint stays as GitHub Actions' backup trigger.
    return NextResponse.json(await runTrackingWatch());
  } catch (error) {
    console.error('tracking-watch failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
