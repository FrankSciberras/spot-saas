import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import VehiclesWorkspace, { type VehicleItem, type VehStatus } from '@/components/fleet/vehicles/VehiclesWorkspace';

type DriverUser = Awaited<ReturnType<typeof requireRole>>;

const PLATE_COLORS = ['#1e293b', '#0f172a', '#0c4a6e', '#7f1d1d', '#854d0e', '#14532d', '#1e3a8a', '#334155'];

function mapStatus(status: string): VehStatus {
  if (status === 'active') return 'active';
  if (status === 'in_service' || status === 'service') return 'service';
  return 'idle';
}

/**
 * Driver Vehicles — the same card workspace the fleet dashboard uses, so both
 * portals share one design. Drivers see their fleet's vehicles with the cars
 * assigned to them listed first; utilisation reflects the shifts they can see
 * (their own) and cards open the driver-side vehicle detail page.
 */
export default async function DriverVehiclesPage() {
  const user = await requireRole(['driver']);
  return (
    <FleetShell user={user} variant="driver" title="Vehicles">
      <Suspense fallback={<FleetPageSkeleton variant="grid" />}>
        <DriverVehiclesContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function DriverVehiclesContent({ user }: { user: DriverUser }) {
  const supabase = await createClient();
  const orgId = user.organization_id;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  // The driver's own row in the ACTIVE fleet (a driver in two fleets has two rows).
  const { data: me } = await supabase
    .from('drivers')
    .select('id, assigned_vehicle_id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .maybeSingle();

  const [vehiclesResult, assignmentsResult, shiftsResult, damagesResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model, year, mileage, status, drivers:assigned_driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('registration_number'),
    supabase
      .from('driver_vehicle_assignments')
      .select('vehicle_id, driver_id, drivers:driver_id (full_name)')
      .eq('organization_id', orgId),
    supabase
      .from('driver_shifts')
      .select('vehicle_id, start_time')
      .eq('organization_id', orgId)
      .gte('start_time', weekStart.toISOString()),
    supabase
      .from('vehicle_damages')
      .select('vehicle_id, severity, status')
      .eq('organization_id', orgId),
  ]);

  type NameRel = { full_name: string | null } | { full_name: string | null }[] | null;
  type VehicleRow = { id: string; registration_number: string; make: string | null; model: string | null; year: number | null; mileage: number | null; status: string; drivers: NameRel };
  type AssignmentRow = { vehicle_id: string | null; driver_id: string | null; drivers: NameRel };
  type ShiftRow = { vehicle_id: string | null; start_time: string | null };
  type DamageRow = { vehicle_id: string | null; severity: string | null; status: string | null };

  const vehicleRows = (vehiclesResult.data || []) as unknown as VehicleRow[];
  const assignmentRows = (assignmentsResult.data || []) as unknown as AssignmentRow[];
  const shiftRows = (shiftsResult.data || []) as unknown as ShiftRow[];
  const damageRows = (damagesResult.data || []) as unknown as DamageRow[];

  // Driver names per vehicle (assignments + assigned_driver_id fallback), and
  // which vehicles are the caller's.
  const driversByVehicle = new Map<string, Set<string>>();
  const mine = new Set<string>();
  if (me?.assigned_vehicle_id) mine.add(me.assigned_vehicle_id);
  for (const row of assignmentRows) {
    if (!row.vehicle_id) continue;
    if (me && row.driver_id === me.id) mine.add(row.vehicle_id);
    const d = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
    if (!d?.full_name) continue;
    if (!driversByVehicle.has(row.vehicle_id)) driversByVehicle.set(row.vehicle_id, new Set());
    driversByVehicle.get(row.vehicle_id)!.add(d.full_name);
  }

  // Utilisation: distinct days with a shift in the last 7 days.
  const shiftDaysByVehicle = new Map<string, Set<string>>();
  for (const s of shiftRows) {
    if (!s.vehicle_id || !s.start_time) continue;
    const day = new Date(s.start_time).toISOString().split('T')[0];
    if (!shiftDaysByVehicle.has(s.vehicle_id)) shiftDaysByVehicle.set(s.vehicle_id, new Set());
    shiftDaysByVehicle.get(s.vehicle_id)!.add(day);
  }

  // Damage counts per vehicle.
  const damagesByVehicle = new Map<string, { severe: number; open: number; total: number }>();
  for (const d of damageRows) {
    if (!d.vehicle_id) continue;
    const agg = damagesByVehicle.get(d.vehicle_id) || { severe: 0, open: 0, total: 0 };
    agg.total += 1;
    if (d.severity === 'severe') agg.severe += 1;
    if (d.status === 'open') agg.open += 1;
    damagesByVehicle.set(d.vehicle_id, agg);
  }

  const vehicles: VehicleItem[] = vehicleRows.map((v, i) => {
    const assigned = Array.isArray(v.drivers) ? v.drivers[0] : v.drivers;
    const names = driversByVehicle.get(v.id) || new Set<string>();
    if (assigned?.full_name) names.add(assigned.full_name);
    const driverList = Array.from(names);
    return {
      id: v.id,
      plate: v.registration_number,
      model: `${v.make} ${v.model}`.trim(),
      year: v.year,
      status: mapStatus(v.status),
      color: PLATE_COLORS[i % PLATE_COLORS.length],
      util: Math.min(1, (shiftDaysByVehicle.get(v.id)?.size || 0) / 7),
      monthlyRevenue: 0,
      km: v.mileage || 0,
      driver: driverList.length ? driverList.join(', ') : '—',
      damages: damagesByVehicle.get(v.id) || { severe: 0, open: 0, total: 0 },
    };
  });

  // The driver's own cars first, then the rest by plate.
  vehicles.sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));

  return <VehiclesWorkspace vehicles={vehicles} canAdd={false} hrefBase="/driver/vehicles" breadcrumb="My fleet / Vehicles" showStats={false} />;
}
