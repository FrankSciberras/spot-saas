import { createAdminClient } from '@/lib/supabase/server';

// =============================================================================
// TRACKING WATCH — notice when a sharing phone goes quiet, and when it's back
// =============================================================================
// Runs every minute inside the server (lib/cron/internal-scheduler), with the
// GitHub Actions cron (/api/cron/tracking-watch) as a backup — GitHub's
// "every 5 minutes" turned out to fire only once or twice an hour.
//
//  * lost    — still marked sharing, but no position for SILENCE_MINUTES:
//              log it (with what they were last doing) and alert the admins.
//  * resumed — a position arrived after a 'lost': log "back after N min".
// Reminding the driver is the app's job (mobile/lib/reminders.ts — a phone
// notification, no push service needed). Alerts the fleet can send from here
// wait for real push notifications.
// =============================================================================

const SILENCE_MINUTES = 5;
const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });


interface PositionRow {
  driver_id: string;
  organization_id: string;
  shift_id: string | null;
  recorded_at: string;
  speed: number | null;
  battery_pct: number | null;
  drivers: { full_name: string | null } | { full_name: string | null }[] | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** Insert a tracking event; retries without `detail` before that column exists. */
async function logEvent(admin: AdminClient, row: Record<string, unknown>) {
  const { error } = await admin.from('driver_tracking_events').insert(row);
  if (error && 'detail' in row) {
    const { detail: _drop, ...rest } = row;
    void _drop;
    await admin.from('driver_tracking_events').insert(rest);
  }
}

export interface WatchReport {
  lost: number;
  resumed: number;
}

export async function runTrackingWatch(): Promise<WatchReport> {
  const admin = createAdminClient();
  const now = Date.now();
  const report: WatchReport = { lost: 0, resumed: 0 };

  const { data: sharing } = await admin
    .from('driver_positions')
    .select('driver_id, organization_id, shift_id, recorded_at, speed, battery_pct, drivers:driver_id (full_name)')
    .eq('is_tracking', true);
  const rows = (sharing ?? []) as PositionRow[];
  if (!rows.length) return report;

  // Latest tracking event per sharing driver (one query, last 48h is plenty).
  const ids = rows.map((r) => r.driver_id);
  const { data: events } = await admin
    .from('driver_tracking_events')
    .select('driver_id, event, occurred_at')
    .in('driver_id', ids)
    .gte('occurred_at', new Date(now - 48 * 3600_000).toISOString())
    .order('occurred_at', { ascending: false });
  const lastEvent = new Map<string, { event: string; occurred_at: string }>();
  for (const e of events ?? []) if (!lastEvent.has(e.driver_id)) lastEvent.set(e.driver_id, e);

  for (const row of rows) {
    const silentMin = (now - Date.parse(row.recorded_at)) / 60_000;
    const last = lastEvent.get(row.driver_id);
    const name = (Array.isArray(row.drivers) ? row.drivers[0] : row.drivers)?.full_name || 'A driver';

    // ── Back again after a 'lost' ─────────────────────────────────────────
    if (silentMin < SILENCE_MINUTES) {
      if (last?.event === 'lost' && row.recorded_at > last.occurred_at) {
        const gap = Math.max(1, Math.round((Date.parse(row.recorded_at) - Date.parse(last.occurred_at)) / 60_000) + SILENCE_MINUTES);
        await logEvent(admin, {
          organization_id: row.organization_id,
          driver_id: row.driver_id,
          shift_id: row.shift_id,
          event: 'resumed',
          detail: `after about ${gap} min`,
        });
        report.resumed++;
      }
      continue;
    }

    // ── Gone quiet ────────────────────────────────────────────────────────
    const alreadyLost = last?.event === 'lost' && last.occurred_at > row.recorded_at;
    if (!alreadyLost) {
      const moving = row.speed != null && row.speed > 1.5;
      const detail = moving
        ? `last seen ${clock(row.recorded_at)}, moving at ${Math.round((row.speed as number) * 3.6)} km/h`
        : `last seen ${clock(row.recorded_at)}, stationary`;
      await logEvent(admin, {
        organization_id: row.organization_id,
        driver_id: row.driver_id,
        shift_id: row.shift_id,
        event: 'lost',
        detail,
      });
      report.lost++;

      const batteryHint =
        row.battery_pct != null && row.battery_pct <= 20
          ? ` Battery was at ${row.battery_pct}% — the phone may have died.`
          : ' The phone may have closed the app, lost signal, or been switched off.';
      await admin.from('notifications').insert({
        organization_id: row.organization_id,
        driver_id: null,
        title: 'Tracking signal lost',
        body: `${name}'s location sharing went silent (${detail}).${batteryHint}`,
        type: 'warning',
        action_url: '/fleet/tracking',
        target_role: 'admin',
      });
    }

  }

  return report;
}
