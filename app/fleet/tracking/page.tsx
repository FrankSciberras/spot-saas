import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import TrackingWorkspace, { type PositionItem } from '@/components/fleet/tracking/TrackingWorkspace';

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
        <TrackingContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function TrackingContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('driver_positions')
    .select('driver_id, latitude, longitude, accuracy, heading, speed, is_tracking, recorded_at, drivers:driver_id (full_name)')
    .eq('organization_id', orgId)
    .order('recorded_at', { ascending: false });

  const positions: PositionItem[] = ((data || []) as any[]).map((r, i) => {
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
      isTracking: !!r.is_tracking,
      recordedAt: r.recorded_at,
    };
  });

  return <TrackingWorkspace orgId={orgId} initialPositions={positions} />;
}
