import { createAdminClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';

// =============================================================================
// DRIVER NUDGE — "your fleet can't see your location, open the app"
// =============================================================================
// Sent by a fleet admin/staff from the Live Map ("Send alert"), or by the
// tracking watcher when an on-shift driver's phone goes silent. Delivered as a
// Rovora notification (driver portal + app), web push when configured, and
// email. Every nudge is logged in driver_nudges (Activity feed) and
// rate-limited so a driver isn't flooded.
// =============================================================================

const MANUAL_GAP_MS = 5 * 60_000;
const AUTO_GAP_MS = 30 * 60_000;

export interface NudgeInput {
  organizationId: string;
  driverId: string;
  /** The person sending it; null = automatic (the watcher). */
  sentBy: string | null;
  /** Shown to the driver under the main message, e.g. what to fix. */
  reason?: string | null;
}

export type NudgeResult =
  | { ok: true; channels: string[] }
  | { ok: false; error: string; retryAfter?: number };

export async function sendDriverNudge({ organizationId, driverId, sentBy, reason }: NudgeInput): Promise<NudgeResult> {
  const admin = createAdminClient();

  const { data: driver } = await admin
    .from('drivers')
    .select('id, full_name, user_id, organization_id, organizations:organization_id (name), users:user_id (email)')
    .eq('id', driverId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!driver) return { ok: false, error: 'Driver not found in this fleet.' };

  // Rate limit. Fails open if the table doesn't exist yet (migration not run).
  const gap = sentBy ? MANUAL_GAP_MS : AUTO_GAP_MS;
  const { data: last } = await admin
    .from('driver_nudges')
    .select('created_at')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    const wait = Date.parse(last.created_at) + gap - Date.now();
    if (wait > 0) {
      return { ok: false, error: 'They were alerted a moment ago — give them a few minutes.', retryAfter: Math.ceil(wait / 1000) };
    }
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const fleet = (one(driver.organizations as { name: string } | { name: string }[] | null)?.name) || 'Your fleet';
  const email = one(driver.users as { email: string } | { email: string }[] | null)?.email ?? null;
  const firstName = (driver.full_name || '').split(' ')[0] || null;

  const title = 'Your fleet can’t see your location';
  const body =
    `${fleet} isn’t receiving your live location while you’re on shift. ` +
    'Open the Rovora Driver app — it checks your phone’s settings and starts sharing again.' +
    (reason ? `\n\n${reason}` : '');

  const channels: string[] = [];
  const now = new Date().toISOString();

  const { error: notifErr } = await admin.from('notifications').insert({
    organization_id: organizationId,
    driver_id: driverId,
    title,
    body,
    type: 'warning',
    action_url: '/driver/tracking',
    target_role: 'driver',
    sent_at: now,
    created_at: now,
  });
  if (!notifErr) channels.push('in_app');

  if (driver.user_id) {
    try {
      if (await sendPushNotification(driver.user_id, { title, body, url: '/driver/tracking' })) channels.push('push');
    } catch {
      // push is optional
    }
  }
  if (email) {
    try {
      if (await sendEmailNotification({ to: email, subject: title, body, driverName: firstName ?? undefined })) channels.push('email');
    } catch {
      // email is optional
    }
  }

  if (!channels.length) return { ok: false, error: 'Couldn’t reach this driver — no notification channel worked.' };

  await admin.from('driver_nudges').insert({
    organization_id: organizationId,
    driver_id: driverId,
    sent_by: sentBy,
    reason: reason ?? null,
    channels,
  });
  return { ok: true, channels };
}
