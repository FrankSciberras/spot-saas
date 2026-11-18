import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { isXeroConfigured } from '@/lib/xero/client';
import { connectionSettings, isXeroNotInstalled, syncXeroFleet, type XeroConnection } from '@/lib/xero/sync';

/**
 * GET /api/cron/xero-sync
 * Hourly: sends whatever is waiting for every fleet that has Xero connected
 * with automatic sending on. Fleets go one after another, least recently
 * synced first; the run stops taking on new fleets after ~4 minutes so the
 * scheduler's request never times out.
 *
 * Besides catching anything the "right after a change" sync missed, this is
 * what keeps a quiet fleet connected: Xero's refresh token expires after 60
 * days without use, and every run uses it.
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
  if (!isXeroConfigured()) return NextResponse.json({ fleets: 0, note: 'Xero is not configured.' });

  const started = Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('xero_connections')
    .select('*')
    .eq('status', 'connected')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .range(0, 999);
  if (error) {
    if (isXeroNotInstalled(error)) return NextResponse.json({ fleets: 0, note: 'Xero tables not installed yet.' });
    console.error('xero-sync: loading connections failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let sent = 0;
  for (const conn of (data ?? []) as XeroConnection[]) {
    if (Date.now() - started > TIME_BUDGET_MS || !connectionSettings(conn).auto_sync) {
      skipped++;
      continue;
    }
    const result = await syncXeroFleet(admin, conn.organization_id);
    if (result.ok) {
      synced++;
      sent += result.outcome.sent;
    } else if (result.reason === 'busy') {
      skipped++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ fleets: (data ?? []).length, synced, failed, skipped, sent });
}
