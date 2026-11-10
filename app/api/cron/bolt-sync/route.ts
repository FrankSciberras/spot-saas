import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { syncBoltFleet, type BoltConnection } from '@/lib/bolt/sync';

/**
 * GET /api/cron/bolt-sync
 * Hourly: refreshes every connected fleet's Bolt drivers, vehicles and ride
 * history. Fleets are done one after another, least-recently-synced first, and
 * the run stops taking on new fleets after ~4 minutes so the scheduler's
 * request never times out — whoever is left simply goes first next hour.
 *
 * A fleet whose key Bolt has refused is retried only once a day (the admin has
 * already been notified; hammering a dead key helps nobody).
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

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

  const started = Date.now();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('bolt_connections')
    .select('*')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .range(0, 999);

  if (error) {
    // Before the migration is applied there is simply nothing to do.
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ fleets: 0, note: 'Bolt tables not installed yet.' });
    }
    console.error('bolt-sync: loading connections failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let rides = 0;

  for (const conn of (data ?? []) as (BoltConnection & { updated_at: string })[]) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      skipped++;
      continue;
    }
    if (conn.status === 'error' && Date.now() - new Date(conn.updated_at).getTime() < 23 * 3600_000) {
      skipped++;
      continue;
    }

    const result = await syncBoltFleet(admin, conn);
    if (result.ok) {
      synced++;
      rides += result.rides;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ fleets: (data ?? []).length, synced, failed, skipped, rides });
}
