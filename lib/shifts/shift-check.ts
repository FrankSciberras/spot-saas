import { createAdminClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';

// =============================================================================
// "STILL ON SHIFT?" — catch shifts drivers forgot to end
// =============================================================================
// Per fleet (Settings → Long shift check; supabase/migrations/20261005_shift_check):
//   * after `afterHours` on shift — from the start, or from their last "yes" —
//     ask the driver: Rovora notification + email (+ web push if set up), and
//     the Rovora Driver app shows it as a phone notification (mobile/lib/reminders);
//   * opening the app answers it (POST /api/shifts/still-on-shift) and the
//     clock restarts;
//   * no answer within `graceMinutes` → end the shift at the moment we asked,
//     stop its tracking, and tell the fleet's admins and the driver.
// Fleets with the check off keep the old safety net: closed after 24 hours.
// Runs every minute from lib/cron/internal-scheduler (and /api/cron/shifts).
// =============================================================================

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';
const SAFETY_CLOSE_HOURS = 24;
const HOUR = 3_600_000;

export interface ShiftCheckSettings {
  enabled: boolean;
  afterHours: number;
  graceMinutes: number;
}

export const DEFAULT_SHIFT_CHECK: ShiftCheckSettings = { enabled: true, afterHours: 12, graceMinutes: 30 };

/** Reads a fleet's settings from an organizations row (tolerates missing columns). */
export function shiftCheckFromOrg(org: Record<string, unknown> | null | undefined): ShiftCheckSettings {
  const hours = Number(org?.shift_check_after_hours);
  const grace = Number(org?.shift_check_grace_minutes);
  return {
    enabled: org?.shift_check_enabled !== false,
    afterHours: Number.isFinite(hours) && hours >= 1 ? hours : DEFAULT_SHIFT_CHECK.afterHours,
    graceMinutes: Number.isFinite(grace) && grace >= 15 ? grace : DEFAULT_SHIFT_CHECK.graceMinutes,
  };
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dayClock = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hoursLabel = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1)) + (h === 1 ? ' hour' : ' hours');

interface OpenShiftRow {
  id: string;
  organization_id: string;
  driver_id: string;
  start_time: string;
  check_requested_at: string | null;
  check_deadline_at: string | null;
  last_confirmed_at: string | null;
  drivers: DriverRel | DriverRel[] | null;
}
type DriverRel = { full_name: string | null; user_id: string | null; users: { email: string | null } | { email: string | null }[] | null };

export interface ShiftCheckReport {
  asked: number;
  closed: number;
}

/** `admin` / `now` are injectable for tests; production passes nothing. */
export async function runShiftCheck(
  opts: { admin?: ReturnType<typeof createAdminClient>; now?: number } = {}
): Promise<ShiftCheckReport> {
  const admin = opts.admin ?? createAdminClient();
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const report: ShiftCheckReport = { asked: 0, closed: 0 };

  // '*' so the scan still works before the shift-check migration (old columns only).
  const { data: shifts, error } = await admin
    .from('driver_shifts')
    .select('*, drivers:driver_id (full_name, user_id, users:user_id (email))')
    .is('end_time', null);
  if (error) throw error;
  const rows = (shifts ?? []) as OpenShiftRow[];
  if (!rows.length) return report;

  const orgIds = [...new Set(rows.map((r) => r.organization_id))];
  const { data: orgs } = await admin.from('organizations').select('*').in('id', orgIds);
  const settings = new Map((orgs ?? []).map((o) => [o.id as string, shiftCheckFromOrg(o)]));

  for (const row of rows) {
    const s = settings.get(row.organization_id) ?? DEFAULT_SHIFT_CHECK;
    const driver = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
    const user = driver ? (Array.isArray(driver.users) ? driver.users[0] : driver.users) : null;
    const name = driver?.full_name || 'A driver';
    const firstName = driver?.full_name?.split(' ')[0];

    try {
      // ── Check off: only the 24 h safety close ─────────────────────────────
      if (!s.enabled) {
        if (now - Date.parse(row.start_time) >= SAFETY_CLOSE_HOURS * HOUR) {
          const endIso = new Date(Date.parse(row.start_time) + SAFETY_CLOSE_HOURS * HOUR).toISOString();
          if (await closeShift(admin, row, endIso, 'max_duration', nowIso)) {
            report.closed++;
            await tellClosed(admin, row,
              `${name}'s shift from ${dayClock(row.start_time)} was still open after ${SAFETY_CLOSE_HOURS} hours and has been ended at ${dayClock(endIso)}. Correct the times if needed.`,
              `Your shift from ${dayClock(row.start_time)} was still open after ${SAFETY_CLOSE_HOURS} hours, so it has been ended. Remember to end your shift when you finish.`, nowIso);
          }
        }
        continue;
      }

      // ── Asked, no answer in time → end it when we asked ──────────────────
      if (row.check_requested_at) {
        const deadline = row.check_deadline_at
          ? Date.parse(row.check_deadline_at)
          : Date.parse(row.check_requested_at) + s.graceMinutes * 60_000;
        if (now < deadline) continue;
        const endIso = row.check_requested_at;
        if (await closeShift(admin, row, endIso, 'no_response', nowIso)) {
          report.closed++;
          const hrs = hoursLabel(Math.round(((Date.parse(endIso) - Date.parse(row.start_time)) / HOUR) * 10) / 10);
          await tellClosed(admin, row,
            `${name} didn't answer “Still on shift?” (asked at ${clock(endIso)}), so their shift from ${dayClock(row.start_time)} was ended at ${clock(endIso)} — ${hrs}. Correct the times if they were still working.`,
            `We asked at ${clock(endIso)} whether you were still on shift and didn't hear back, so your shift was ended at ${clock(endIso)}. If you were still working, tell your fleet so they can correct it.`, nowIso);
        }
        continue;
      }

      // ── Time to ask ───────────────────────────────────────────────────────
      const since = Math.max(Date.parse(row.start_time), row.last_confirmed_at ? Date.parse(row.last_confirmed_at) : 0);
      if (now - since < s.afterHours * HOUR) continue;

      const deadlineIso = new Date(now + s.graceMinutes * 60_000).toISOString();
      const { data: claimed } = await admin
        .from('driver_shifts')
        .update({ check_requested_at: nowIso, check_deadline_at: deadlineIso })
        .eq('id', row.id)
        .is('end_time', null)
        .is('check_requested_at', null)
        .select('id');
      if (!claimed?.length) continue; // another run got there first
      report.asked++;

      const onShiftFor = hoursLabel(Math.floor(((now - Date.parse(row.start_time)) / HOUR) * 2) / 2);
      const title = 'Are you still on shift?';
      const body =
        `You’ve been on shift since ${clock(row.start_time)} (${onShiftFor}). Open Rovora Driver to carry on — ` +
        `if we don’t hear from you by ${clock(deadlineIso)}, your shift will end automatically.`;
      await admin.from('notifications').insert({
        organization_id: row.organization_id,
        driver_id: row.driver_id,
        title,
        body,
        type: 'warning',
        action_url: '/driver',
        target_role: 'driver',
        sent_at: nowIso,
        created_at: nowIso,
      });
      if (driver?.user_id) {
        try { await sendPushNotification(driver.user_id, { title, body, url: '/driver' }); } catch { /* optional */ }
      }
      if (user?.email) {
        try { await sendEmailNotification({ to: user.email, subject: title, body, driverName: firstName }); } catch { /* optional */ }
      }
    } catch (e) {
      console.error(`shift check: shift ${row.id} failed:`, e);
    }
  }
  return report;
}

/** End an open shift (only if still open) and switch its location sharing off. */
async function closeShift(
  admin: ReturnType<typeof createAdminClient>,
  row: OpenShiftRow,
  endIso: string,
  reason: 'no_response' | 'max_duration',
  nowIso: string
): Promise<boolean> {
  let { data, error } = await admin
    .from('driver_shifts')
    .update({ end_time: endIso, auto_closed_at: nowIso, auto_close_reason: reason, check_requested_at: null, check_deadline_at: null })
    .eq('id', row.id)
    .is('end_time', null)
    .select('id');
  if (error?.code === 'PGRST204') {
    // Before the shift-check migration: the new columns don't exist yet.
    ({ data, error } = await admin
      .from('driver_shifts')
      .update({ end_time: endIso, auto_closed_at: nowIso })
      .eq('id', row.id)
      .is('end_time', null)
      .select('id'));
  }
  if (error) throw error;
  if (!data?.length) return false;
  await admin.from('driver_positions').update({ is_tracking: false }).eq('driver_id', row.driver_id);
  return true;
}

async function tellClosed(
  admin: ReturnType<typeof createAdminClient>,
  row: OpenShiftRow,
  adminBody: string,
  driverBody: string,
  nowIso: string
) {
  await admin.from('notifications').insert([
    {
      organization_id: row.organization_id,
      driver_id: null,
      title: 'Shift ended automatically',
      body: adminBody,
      type: 'warning',
      action_url: `/fleet/shifts/${row.id}`,
      target_role: 'admin',
      sent_at: nowIso,
      created_at: nowIso,
    },
    {
      organization_id: row.organization_id,
      driver_id: row.driver_id,
      title: 'Your shift was ended automatically',
      body: driverBody,
      type: 'info',
      action_url: '/driver/shifts',
      target_role: 'driver',
      sent_at: nowIso,
      created_at: nowIso,
    },
  ]);
}

/**
 * The driver is clearly still around (they opened the app or portal): answer a
 * pending "still on shift?" for their open shift. Returns true if one was
 * pending. Service-role write — only call with the authenticated user's id.
 */
export async function confirmStillOnShift(userId: string): Promise<{ confirmed: boolean }> {
  const admin = createAdminClient();
  const { data: drivers } = await admin.from('drivers').select('id').eq('user_id', userId);
  const ids = (drivers ?? []).map((d) => d.id as string);
  if (!ids.length) return { confirmed: false };
  const { data } = await admin
    .from('driver_shifts')
    .update({ check_requested_at: null, check_deadline_at: null, last_confirmed_at: new Date().toISOString() })
    .in('driver_id', ids)
    .is('end_time', null)
    .not('check_requested_at', 'is', null)
    .select('id');
  return { confirmed: !!data?.length };
}
