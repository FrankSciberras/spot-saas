import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { findOpenShift } from '@/lib/auth/open-shift';
import { createAdminClient } from '@/lib/supabase/server';

// =============================================================================
// POST /api/driver/app-status — the driver portal reporting where it's running
// =============================================================================
// Sent by components/driver/NativeBridge: { context: 'app' | 'browser', status? }
// where `status` is what the Rovora Driver app last told the portal (tracking
// on/off, last send, errors, and from app 1.0.3 its location-access check and
// whether the driver dismissed the share prompt). Stored in driver_app_status
// so the fleet's Live Map can explain why an on-shift driver isn't sharing.
//
// The driver row is resolved here — the open shift's row, else the active
// fleet's — never taken from the request, so nobody can write another driver's
// status. Best effort: a missing table (migration not run) is just ignored.
// =============================================================================

const ACCESS = new Set(['ok', 'services_off', 'no_permission', 'not_always', 'approximate']);
const PLATFORMS = new Set(['android', 'ios']);

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  // Ignore clocks wildly in the future (bad phone time) — they'd mislead.
  return Number.isFinite(t) && t < Date.now() + 5 * 60_000 ? new Date(t).toISOString() : null;
};
const shortText = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { context?: unknown; status?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const context = body.context === 'app' ? 'app' : body.context === 'browser' ? 'browser' : null;
  if (!context) return NextResponse.json({ error: 'Invalid context' }, { status: 400 });

  const open = await findOpenShift(session.id);
  const driverId = open?.driverId ?? session.driver_id;
  const organizationId = open?.organizationId ?? session.organization_id;
  if (!driverId) return new NextResponse(null, { status: 204 }); // not a driver

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    driver_id: driverId,
    organization_id: organizationId,
    updated_at: now,
    [context === 'app' ? 'app_seen_at' : 'browser_seen_at']: now,
  };

  const s = body.status;
  if (context === 'app' && s && typeof s === 'object') {
    if (typeof s.tracking === 'boolean') row.tracking = s.tracking;
    if ('lastSentAt' in s) row.last_sent_at = isoOrNull(s.lastSentAt);
    if ('error' in s) row.last_error = shortText(s.error, 300);
    if (typeof s.access === 'string' && ACCESS.has(s.access)) {
      row.location_access = s.access;
      row.access_checked_at = isoOrNull(s.accessCheckedAt) ?? now;
    }
    if ('promptDismissedAt' in s) row.prompt_dismissed_at = isoOrNull(s.promptDismissedAt);
    const autoRestartedAt = isoOrNull(s.autoRestartedAt);
    if (autoRestartedAt) row.auto_restarted_at = autoRestartedAt;
    const appVersion = shortText(s.appVersion, 20);
    if (appVersion) row.app_version = appVersion;
    if (typeof s.platform === 'string' && PLATFORMS.has(s.platform)) row.platform = s.platform;
  }

  const admin = createAdminClient();
  let { error } = await admin.from('driver_app_status').upsert(row, { onConflict: 'driver_id' });
  if (error?.code === 'PGRST204' && 'auto_restarted_at' in row) {
    // Column added by 20261005_tracking_recovery — keep the rest if it's not there yet.
    delete row.auto_restarted_at;
    ({ error } = await admin.from('driver_app_status').upsert(row, { onConflict: 'driver_id' }));
  }
  if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
    console.error('driver app-status upsert failed:', error);
  }
  return new NextResponse(null, { status: 204 });
}
