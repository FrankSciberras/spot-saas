import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { runGpsSync } from '@/lib/gps/sync';

/**
 * GET /api/cron/gps-sync
 * Pulls the latest positions for every connected GPS account. The live server
 * already does this every minute in-process (lib/cron/internal-scheduler.ts);
 * this endpoint is the backup trigger (GitHub cron / manual).
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
  const result = await runGpsSync(createAdminClient(), 90_000);
  return NextResponse.json(result);
}
