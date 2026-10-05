import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { getLiveTrackingSettings } from '@/lib/tracking/live-tracking';
import { loadSharingInfo } from '@/lib/tracking/sharing-info';
import { loadActivity } from '@/lib/tracking/activity';
import TrackingWorkspace, {
  type OnShiftItem,
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
  await requireModule(user.organization_id, 'tracking');
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

  const [positionsRes, zonesRes, maxSpeedsRes, orgRes, distancesRes, openShiftsRes, liveTracking, activity] = await Promise.all([
    supabase
      .from('driver_positions')
      .select('driver_id, latitude, longitude, accuracy, heading, speed, is_tracking, recorded_at, battery_pct, battery_charging, gps_enabled, location_permission, drivers:driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('geofences')
      .select('id, name, latitude, longitude, radius_m, notify_on, active')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase.rpc('driver_max_speeds', { p_since: startOfDay.toISOString() }),
    supabase.from('organizations').select('speed_limit_kmh').eq('id', orgId).single(),
    supabase.rpc('driver_distances', { p_since: startOfDay.toISOString() }),
    // Who's on shift right now — the map flags those not sharing their location.
    supabase
      .from('driver_shifts')
      .select('driver_id, start_time, drivers:driver_id (full_name, phone)')
      .eq('organization_id', orgId)
      .is('end_time', null)
      .order('start_time', { ascending: true }),
    getLiveTrackingSettings(orgId),
    loadActivity(supabase, orgId),
  ]);

  const maxSpeedByDriver = new Map<string, number>(
    ((maxSpeedsRes.data || []) as any[]).map((r) => [r.driver_id, Number(r.max_speed)])
  );
  const distanceByDriver = new Map<string, number>(
    ((distancesRes.data || []) as any[]).map((r) => [r.driver_id, Number(r.distance_m)])
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
      distanceToday: distanceByDriver.get(r.driver_id) ?? null,
      isTracking: !!r.is_tracking,
      recordedAt: r.recorded_at,
      batteryPct: r.battery_pct ?? null,
      batteryCharging: r.battery_charging ?? null,
      gpsEnabled: r.gps_enabled ?? null,
      locationPermission: r.location_permission ?? null,
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

  type OpenShiftRow = { driver_id: string; start_time: string; drivers: unknown };
  const onShift: OnShiftItem[] = ((openShiftsRes.data || []) as unknown as OpenShiftRow[]).map((s) => ({
    driverId: s.driver_id,
    name: nameOf(s.drivers),
    phone: (Array.isArray(s.drivers) ? s.drivers[0] : (s.drivers as { phone?: string | null } | null))?.phone ?? null,
    startTime: s.start_time,
  }));
  // Why the on-shift drivers who aren't sharing aren't (the Live Map explains it).
  const sharingInfo = await loadSharingInfo(supabase, orgId, onShift);

  return (
    <TrackingWorkspace
      orgId={orgId}
      canManage={canManage}
      initialPositions={positions}
      onShift={onShift}
      initialSharingInfo={sharingInfo}
      expectSharing={liveTracking.trackOnShift}
      initialZones={zones}
      initialActivity={activity}
      initialSpeedLimit={(orgRes.data as any)?.speed_limit_kmh ?? null}
    />
  );
}
