import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { runShiftCheck } from '@/lib/shifts/shift-check';

/**
 * GET /api/cron/shifts — "Still on shift?" check for open shifts.
 * The logic (per-fleet ask-after / end-if-no-answer, 24 h safety close for
 * fleets that turned it off) lives in lib/shifts/shift-check and also runs
 * every minute inside the server; this endpoint is GitHub Actions' backup.
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
    return NextResponse.json(await runShiftCheck());
  } catch (error) {
    console.error('shifts cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
