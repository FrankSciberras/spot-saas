import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import ShiftsWorkspace, { type ShiftItem } from '@/components/fleet/shifts/ShiftsWorkspace';

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function ShiftsPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'rostering');
  return (
    <FleetShell user={user} title="Driver Shifts">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <ShiftsContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function ShiftsContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const timeZone = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const { data } = await supabase
    .from('driver_shifts')
    .select('id, start_time, end_time, starting_mileage, dashcam_checked, car_internal_checked, drivers:driver_id (full_name), vehicles:vehicle_id (registration_number)')
    .eq('organization_id', orgId)
    .gte('start_time', cutoff.toISOString())
    .order('start_time', { ascending: false })
    .limit(200);

  const rows = (data || []) as any[];
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone });

  const colorByDriver = new Map<string, string>();
  let colorIdx = 0;

  const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
  const minutesOf = (d: Date) => {
    const parts = d.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
    const [h, m] = parts.split(':').map(Number);
    return h * 60 + m;
  };
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone });

  const shifts: ShiftItem[] = rows.map((r) => {
    const driver = (Array.isArray(r.drivers) ? r.drivers[0] : r.drivers)?.full_name || 'Unknown';
    const vehicle = (Array.isArray(r.vehicles) ? r.vehicles[0] : r.vehicles)?.registration_number || '—';
    if (!colorByDriver.has(driver)) colorByDriver.set(driver, PALETTE[colorIdx++ % PALETTE.length]);
    const start = new Date(r.start_time);
    const end = r.end_time ? new Date(r.end_time) : null;
    const status: 'live' | 'completed' = end ? 'completed' : 'live';
    const endRef = end || now;
    const hours = Math.max(0, (endRef.getTime() - start.getTime()) / 3600000);
    const dateKey = dayKey(start);
    const dayOffset = Math.floor((new Date(todayStr).getTime() - new Date(dateKey).getTime()) / 86400000);
    return {
      id: r.id,
      driver,
      driverInitials: initialsOf(driver),
      driverColor: colorByDriver.get(driver)!,
      vehicle,
      start: fmtTime(start),
      end: end ? fmtTime(end) : 'now',
      startMin: minutesOf(start),
      endMin: minutesOf(endRef),
      hours,
      date: dateKey,
      dayLabel: start.toLocaleDateString('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'short' }),
      dayOffset: Math.max(0, dayOffset),
      status,
      mileage: r.starting_mileage || 0,
      dashcam: !!r.dashcam_checked,
      internal: !!r.car_internal_checked,
    };
  });

  const driverNames = Array.from(new Set(shifts.map((s) => s.driver))).sort();

  return <ShiftsWorkspace shifts={shifts} driverNames={driverNames} />;
}
