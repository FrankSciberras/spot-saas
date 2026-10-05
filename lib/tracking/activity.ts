import type { SupabaseClient } from '@supabase/supabase-js';

/** One line in the Live Map's Activity feed. */
export interface ActivityItem {
  id: string;
  kind: 'tracking' | 'zone' | 'speed' | 'health';
  event: string;
  driverName: string;
  zoneName: string | null;
  detail: string | null;
  occurredAt: string;
}

type Rel = { full_name?: string | null; name?: string | null } | { full_name?: string | null; name?: string | null }[] | null;
const one = (rel: Rel) => (Array.isArray(rel) ? rel[0] : rel);
const nameOf = (rel: Rel) => one(rel)?.full_name || 'Unknown driver';

/**
 * The Activity feed: tracking on/off/lost/back, zone entries, speeding and
 * phone health, newest first. Shared by the page (server) and the
 * Live Map's polling (browser) so both build it identically. Selects use '*'
 * where a newer column may not exist yet, and a missing table just contributes
 * nothing — the feed never fails because a migration hasn't run.
 */
export async function loadActivity(supabase: SupabaseClient, orgId: string): Promise<ActivityItem[]> {
  const [trackingRes, zoneRes, speedRes, healthRes] = await Promise.all([
    supabase
      .from('driver_tracking_events')
      .select('*, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('geofence_events')
      .select('id, event, occurred_at, drivers:driver_id (full_name), geofences:geofence_id (name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('speeding_events')
      .select('id, speed_kmh, limit_kmh, occurred_at, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase
      .from('device_health_events')
      .select('id, event, detail, occurred_at, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(20),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const items: ActivityItem[] = [
    ...((trackingRes.data || []) as any[]).map((e) => ({
      id: `t-${e.id}`,
      kind: 'tracking' as const,
      event: e.event as string,
      driverName: nameOf(e.drivers),
      zoneName: null,
      detail: (e.detail as string | undefined) ?? null,
      occurredAt: e.occurred_at as string,
    })),
    ...((zoneRes.data || []) as any[]).map((e) => ({
      id: `z-${e.id}`,
      kind: 'zone' as const,
      event: e.event as string,
      driverName: nameOf(e.drivers),
      zoneName: one(e.geofences)?.name || 'zone',
      detail: null,
      occurredAt: e.occurred_at as string,
    })),
    ...((speedRes.data || []) as any[]).map((e) => ({
      id: `s-${e.id}`,
      kind: 'speed' as const,
      event: 'speeding',
      driverName: nameOf(e.drivers),
      zoneName: null,
      detail: `${e.speed_kmh} km/h (limit ${e.limit_kmh})`,
      occurredAt: e.occurred_at as string,
    })),
    ...((healthRes.data || []) as any[]).map((e) => ({
      id: `h-${e.id}`,
      kind: 'health' as const,
      event: e.event as string,
      driverName: nameOf(e.drivers),
      zoneName: null,
      detail: (e.detail as string) ?? null,
      occurredAt: e.occurred_at as string,
    })),
  ];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 40);
}
