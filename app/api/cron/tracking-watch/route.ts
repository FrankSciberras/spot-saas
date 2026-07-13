import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';

/**
 * GET /api/cron/tracking-watch
 * Detects drivers whose location sharing went silent: is_tracking is still
 * true but no position has arrived for 5+ minutes. Logs a 'lost' event and
 * notifies the fleet's admins — once per silence (deduped against the last
 * tracking event for that driver).
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

const SILENCE_MINUTES = 5;

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - SILENCE_MINUTES * 60_000).toISOString();

    const { data: silent } = await supabase
      .from('driver_positions')
      .select('driver_id, organization_id, shift_id, recorded_at, battery_pct, drivers:driver_id (full_name)')
      .eq('is_tracking', true)
      .lt('recorded_at', cutoff);

    let alerts = 0;
    for (const row of (silent || []) as any[]) {
      // Dedup: skip if the latest tracking event for this driver is already a
      // 'lost' that is newer than their last position.
      const { data: lastEvent } = await supabase
        .from('driver_tracking_events')
        .select('event, occurred_at')
        .eq('driver_id', row.driver_id)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEvent?.event === 'lost' && lastEvent.occurred_at > row.recorded_at) continue;

      await supabase.from('driver_tracking_events').insert({
        organization_id: row.organization_id,
        driver_id: row.driver_id,
        shift_id: row.shift_id,
        event: 'lost',
      });

      const name = (Array.isArray(row.drivers) ? row.drivers[0] : row.drivers)?.full_name || 'A driver';
      const lastSeen = new Date(row.recorded_at).toLocaleTimeString('en-GB', {
        timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta',
        hour: '2-digit',
        minute: '2-digit',
      });
      const batteryHint =
        row.battery_pct != null && row.battery_pct <= 20
          ? ` Battery was at ${row.battery_pct}% — the phone may have died.`
          : ' Phone may be off or out of coverage.';
      await supabase.from('notifications').insert({
        organization_id: row.organization_id,
        driver_id: null,
        title: 'Tracking signal lost',
        body: `${name}'s location sharing went silent (last seen ${lastSeen}).${batteryHint}`,
        type: 'warning',
        action_url: '/fleet/tracking',
        target_role: 'admin',
      });
      alerts++;
    }

    return NextResponse.json({ checked: silent?.length || 0, alerts });
  } catch (error) {
    console.error('tracking-watch failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
