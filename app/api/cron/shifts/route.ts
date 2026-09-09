import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { sendPushNotification } from '@/lib/notifications/push';

/**
 * GET /api/cron/shifts — open-shift watch (hourly).
 *
 * Drivers forget to clock out. Left alone, an open shift keeps "sharing
 * location" switched on in the fleet's eyes, skews the hours used for wage
 * settlements, and blocks the driver from starting the next shift (one open
 * shift per driver). So:
 *   - after NUDGE_AFTER_HOURS: remind the driver once (in-app + push);
 *   - after AUTO_CLOSE_AFTER_HOURS: close the shift at start + 24h, mark it
 *     auto_closed_at, tell the fleet's admins so they can correct the times.
 *
 * Idempotent: the nudge is recorded on the row, and a closed shift drops out of
 * the scan.
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

const NUDGE_AFTER_HOURS = 14;
const AUTO_CLOSE_AFTER_HOURS = 24;
const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

interface OpenShiftRow {
  id: string;
  organization_id: string;
  driver_id: string;
  start_time: string;
  long_shift_nudged_at: string | null;
  drivers: { full_name: string | null; user_id: string | null } | { full_name: string | null; user_id: string | null }[] | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const now = Date.now();
    const nudgeCutoff = new Date(now - NUDGE_AFTER_HOURS * 3_600_000).toISOString();

    const { data: rows, error } = await supabase
      .from('driver_shifts')
      .select('id, organization_id, driver_id, start_time, long_shift_nudged_at, drivers:driver_id (full_name, user_id)')
      .is('end_time', null)
      .lt('start_time', nudgeCutoff);

    if (error) {
      console.error('shifts cron: query failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    let nudged = 0;
    let autoClosed = 0;
    const errors: string[] = [];

    for (const row of (rows || []) as unknown as OpenShiftRow[]) {
      const driver = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
      const name = driver?.full_name || 'A driver';
      const startMs = new Date(row.start_time).getTime();
      const hoursOpen = (now - startMs) / 3_600_000;
      const nowIso = new Date().toISOString();

      try {
        if (hoursOpen >= AUTO_CLOSE_AFTER_HOURS) {
          const endIso = new Date(startMs + AUTO_CLOSE_AFTER_HOURS * 3_600_000).toISOString();
          const { error: closeError } = await supabase
            .from('driver_shifts')
            .update({ end_time: endIso, auto_closed_at: nowIso })
            .eq('id', row.id)
            .is('end_time', null);
          if (closeError) throw closeError;

          await supabase
            .from('driver_positions')
            .update({ is_tracking: false })
            .eq('driver_id', row.driver_id);

          await supabase.from('notifications').insert([
            {
              organization_id: row.organization_id,
              driver_id: null,
              title: 'Shift closed automatically',
              body: `${name}'s shift from ${fmt(row.start_time)} was still open after ${AUTO_CLOSE_AFTER_HOURS} hours and has been closed at ${fmt(endIso)}. Correct the times if needed.`,
              type: 'warning',
              action_url: `/fleet/shifts/${row.id}`,
              target_role: 'admin',
              sent_at: nowIso,
              created_at: nowIso,
            },
            {
              organization_id: row.organization_id,
              driver_id: row.driver_id,
              title: 'Your shift was closed automatically',
              body: `Your shift from ${fmt(row.start_time)} was still open after ${AUTO_CLOSE_AFTER_HOURS} hours, so it has been closed. Remember to end your shift when you finish.`,
              type: 'info',
              action_url: '/driver/shifts',
              target_role: 'driver',
              sent_at: nowIso,
              created_at: nowIso,
            },
          ]);
          autoClosed++;
          continue;
        }

        if (!row.long_shift_nudged_at) {
          const { error: nudgeError } = await supabase
            .from('driver_shifts')
            .update({ long_shift_nudged_at: nowIso })
            .eq('id', row.id)
            .is('long_shift_nudged_at', null);
          if (nudgeError) throw nudgeError;

          const body = `You clocked in ${Math.floor(hoursOpen)} hours ago (${fmt(row.start_time)}). If your shift is over, end it now so your hours stay correct.`;
          await supabase.from('notifications').insert({
            organization_id: row.organization_id,
            driver_id: row.driver_id,
            title: 'Still on shift?',
            body,
            type: 'warning',
            action_url: '/driver/end-shift',
            target_role: 'driver',
            sent_at: nowIso,
            created_at: nowIso,
          });
          if (driver?.user_id) {
            await sendPushNotification(driver.user_id, {
              title: 'Still on shift?',
              body,
              url: '/driver/end-shift',
            });
          }
          nudged++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`shifts cron: shift ${row.id} failed:`, msg);
        errors.push(`${row.id}: ${msg}`);
      }
    }

    return NextResponse.json(
      { checked: (rows || []).length, nudged, autoClosed, errors },
      { status: errors.length ? 500 : 200 }
    );
  } catch (error) {
    console.error('shifts cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
