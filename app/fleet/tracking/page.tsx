import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import TrackingWorkspace, {
  type ActivityItem,
  type PositionItem,
  type ZoneItem,
} from '@/components/fleet/tracking/TrackingWorkspace';

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function TrackingPage() {
  const user = await requireRole(['admin', 'staff']);
  return (
    <FleetShell user={user} title="Live Map">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <TrackingContent orgId={user.organization_id} canManage={user.role === 'admin'} />
      </Suspense>
    </FleetShell>
  );
}

async function TrackingContent({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const supabase = await createClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [positionsRes, zonesRes, maxSpeedsRes, trackingEventsRes, zoneEventsRes] = await Promise.all([
    supabase
      .from('driver_positions')
      .select('driver_id, latitude, longitude, accuracy, heading, speed, is_tracking, recorded_at, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('geofences')
      .select('id, name, latitude, longitude, radius_m, notify_on, active')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase.rpc('driver_max_speeds', { p_since: startOfDay.toISOString() }),
    supabase
      .from('driver_tracking_events')
      .select('id, event, occurred_at, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(30),
    supabase
      .from('geofence_events')
      .select('id, event, occurred_at, drivers:driver_id (full_name), geofences:geofence_id (name)')
      .eq('organization_id', orgId)
      .order('occurred_at', { ascending: false })
      .limit(30),
  ]);

  const maxSpeedByDriver = new Map<string, number>(
    ((maxSpeedsRes.data || []) as any[]).map((r) => [r.driver_id, Number(r.max_speed)])
  );

  const positions: PositionItem[] = ((positionsRes.data || []) as any[]).map((r, i) => {
    const name = (Array.isArray(r.drivers) ? r.drivers[0] : r.drivers)?.full_name || 'Unknown driver';
    return {
      driverId: r.driver_id,
      name,
      initials: initialsOf(name),
      color: PALETTE[i % PALETTE.length],
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      heading: r.heading,
      speed: r.speed,
      maxSpeedToday: maxSpeedByDriver.get(r.driver_id) ?? null,
      isTracking: !!r.is_tracking,
      recordedAt: r.recorded_at,
    };
  });

  const zones: ZoneItem[] = ((zonesRes.data || []) as any[]).map((z) => ({
    id: z.id,
    name: z.name,
    latitude: z.latitude,
    longitude: z.longitude,
    radiusM: z.radius_m,
    notifyOn: z.notify_on,
    active: z.active,
  }));

  const nameOf = (rel: any) => (Array.isArray(rel) ? rel[0] : rel)?.full_name || 'Unknown driver';
  const zoneNameOf = (rel: any) => (Array.isArray(rel) ? rel[0] : rel)?.name || 'zone';

  const activity: ActivityItem[] = [
    ...((trackingEventsRes.data || []) as any[]).map((e) => ({
      id: `t-${e.id}`,
      kind: 'tracking' as const,
      event: e.event as string,
      driverName: nameOf(e.drivers),
      zoneName: null,
      occurredAt: e.occurred_at as string,
    })),
    ...((zoneEventsRes.data || []) as any[]).map((e) => ({
      id: `z-${e.id}`,
      kind: 'zone' as const,
      event: e.event as string,
      driverName: nameOf(e.drivers),
      zoneName: zoneNameOf(e.geofences),
      occurredAt: e.occurred_at as string,
    })),
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 40);

  return (
    <TrackingWorkspace
      orgId={orgId}
      canManage={canManage}
      initialPositions={positions}
      initialZones={zones}
      initialActivity={activity}
    />
  );
}
