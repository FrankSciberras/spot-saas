import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppStatusInfo } from '@/lib/tracking/sharing-diagnosis';

/** Inputs for diagnoseNotSharing, keyed by driver id. */
export interface SharingInfo {
  app: Record<string, AppStatusInfo>;
  lastEvent: Record<string, { event: string; at: string }>;
}

export const EMPTY_SHARING_INFO: SharingInfo = { app: {}, lastEvent: {} };

/**
 * Loads what's needed to explain why on-shift drivers aren't sharing: their
 * app status rows and their latest tracking event since their shift began.
 * Works with the server or browser client (RLS: fleet admins/staff). Fails
 * soft to "nothing known" — e.g. before the driver_app_status migration.
 */
export async function loadSharingInfo(
  supabase: SupabaseClient,
  orgId: string,
  onShift: { driverId: string; startTime: string }[]
): Promise<SharingInfo> {
  if (!onShift.length) return EMPTY_SHARING_INFO;
  const ids = onShift.map((s) => s.driverId);
  const earliest = onShift.reduce((min, s) => (s.startTime < min ? s.startTime : min), onShift[0].startTime);

  const [statusRes, eventsRes] = await Promise.all([
    supabase.from('driver_app_status').select('*').eq('organization_id', orgId).in('driver_id', ids),
    supabase
      .from('driver_tracking_events')
      .select('driver_id, event, occurred_at')
      .eq('organization_id', orgId)
      .in('driver_id', ids)
      .gte('occurred_at', earliest)
      .order('occurred_at', { ascending: false })
      .limit(200),
  ]);

  const app: SharingInfo['app'] = {};
  for (const r of (statusRes.data ?? []) as Record<string, string | boolean | null>[]) {
    app[r.driver_id as string] = {
      appSeenAt: (r.app_seen_at as string) ?? null,
      browserSeenAt: (r.browser_seen_at as string) ?? null,
      platform: (r.platform as string) ?? null,
      appVersion: (r.app_version as string) ?? null,
      tracking: (r.tracking as boolean) ?? null,
      lastSentAt: (r.last_sent_at as string) ?? null,
      lastError: (r.last_error as string) ?? null,
      locationAccess: (r.location_access as string) ?? null,
      accessCheckedAt: (r.access_checked_at as string) ?? null,
      promptDismissedAt: (r.prompt_dismissed_at as string) ?? null,
      updatedAt: (r.updated_at as string) ?? null,
    };
  }

  const lastEvent: SharingInfo['lastEvent'] = {};
  for (const e of (eventsRes.data ?? []) as { driver_id: string; event: string; occurred_at: string }[]) {
    if (!lastEvent[e.driver_id]) lastEvent[e.driver_id] = { event: e.event, at: e.occurred_at };
  }
  return { app, lastEvent };
}
