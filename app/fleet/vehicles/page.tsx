import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import VehiclesWorkspace, { type VehicleItem, type VehStatus } from '@/components/fleet/vehicles/VehiclesWorkspace';
import { latestServiceByVehicle } from '@/lib/maintenance/serviceDue';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

const PLATE_COLORS = ['#1e293b', '#0f172a', '#0c4a6e', '#7f1d1d', '#854d0e', '#14532d', '#1e3a8a', '#334155'];

function mapStatus(status: string): VehStatus {
  if (status === 'active') return 'active';
  if (status === 'in_service' || status === 'service') return 'service';
  return 'idle';
}

export default async function VehiclesPage() {
  const user = await requireRole(['admin', 'staff']);
  return (
    <FleetShell user={user} title="Vehicles">
      <Suspense fallback={<FleetPageSkeleton variant="grid" />}>
        <VehiclesContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function VehiclesContent({ user }: { user: FleetUser }) {
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const orgId = user.organization_id;
  const [vehiclesResult, assignmentsResult, shiftsResult, damagesResult, servicesResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model, year, mileage, status, insurance_expiry_date, road_license_expiry_date, drivers:assigned_driver_id (full_name)')
      .eq('organization_id', orgId)
      .order('registration_number'),
    supabase
      .from('driver_vehicle_assignments')
      .select('vehicle_id, drivers:driver_id (full_name)')
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
    // Next-service target per vehicle (table view), same rule as the Services page.
    supabase
      .from('vehicle_services')
      .select('id, vehicle_id, service_date, mileage_at_service, next_service_mileage, next_service_date')
      .eq('organization_id', orgId),
  ]);
  const nextService = latestServiceByVehicle(
    (servicesResult.data || []) as {
      id: string;
      vehicle_id: string;
      service_date: string | null;
      mileage_at_service: number | null;
      next_service_mileage: number | null;
      next_service_date: string | null;
    }[],
  );

  const vehicleRows = (vehiclesResult.data || []) as any[];
  const assignmentRows = (assignmentsResult.data || []) as any[];
  const shiftRows = (shiftsResult.data || []) as any[];
  const damageRows = (damagesResult.data || []) as any[];

  // Driver names per vehicle (assignments + assigned_driver_id fallback)
  const driversByVehicle = new Map<string, Set<string>>();
  for (const row of assignmentRows) {
    if (!row.vehicle_id) continue;
    const d = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
    if (!d?.full_name) continue;
    if (!driversByVehicle.has(row.vehicle_id)) driversByVehicle.set(row.vehicle_id, new Set());
    driversByVehicle.get(row.vehicle_id)!.add(d.full_name);
  }

  // Utilisation: distinct days with a shift in the last 7 days
  const shiftDaysByVehicle = new Map<string, Set<string>>();
  for (const s of shiftRows) {
    if (!s.vehicle_id || !s.start_time) continue;
    const day = new Date(s.start_time).toISOString().split('T')[0];
    if (!shiftDaysByVehicle.has(s.vehicle_id)) shiftDaysByVehicle.set(s.vehicle_id, new Set());
    shiftDaysByVehicle.get(s.vehicle_id)!.add(day);
  }

  // Damage counts per vehicle
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
      insuranceExpiry: v.insurance_expiry_date ?? null,
      roadLicenseExpiry: v.road_license_expiry_date ?? null,
      nextServiceKm: nextService.get(v.id)?.next_service_mileage ?? null,
      nextServiceDate: nextService.get(v.id)?.next_service_date ?? null,
    };
  });

  return <VehiclesWorkspace vehicles={vehicles} canAdd={isAdmin} />;
}
