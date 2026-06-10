import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import DamagesWorkspace, { type DamageVehicle } from '@/components/fleet/damages/DamagesWorkspace';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

const PLATE_COLORS = ['#1e293b', '#0f172a', '#0c4a6e', '#7f1d1d', '#854d0e', '#14532d', '#1e3a8a', '#334155'];

export default async function FleetDamagesPage() {
  const user = await requireRole(['admin', 'staff']);
  return (
    <FleetShell user={user} title="Fleet Damages">
      <Suspense fallback={<FleetPageSkeleton variant="grid" stats={0} />}>
        <DamagesContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function DamagesContent({ user }: { user: FleetUser }) {
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const [vehiclesResult, damagesResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, registration_number, make, model, year')
      .order('registration_number'),
    supabase
      .from('vehicle_damages')
      .select('vehicle_id, severity, status'),
  ]);

  const vehicleRows = (vehiclesResult.data || []) as any[];
  const damageRows = (damagesResult.data || []) as any[];

  const byVehicle = new Map<string, { severe: number; open: number; total: number }>();
  for (const d of damageRows) {
    if (!d.vehicle_id) continue;
    const agg = byVehicle.get(d.vehicle_id) || { severe: 0, open: 0, total: 0 };
    agg.total += 1;
    if (d.status === 'open') agg.open += 1;
    if (d.severity === 'severe' && d.status !== 'repaired') agg.severe += 1;
    byVehicle.set(d.vehicle_id, agg);
  }

  const vehicles: DamageVehicle[] = vehicleRows
    .map((v, i) => ({
      id: v.id,
      plate: v.registration_number,
      model: `${v.make} ${v.model}`.trim(),
      year: v.year,
      color: PLATE_COLORS[i % PLATE_COLORS.length],
      damages: byVehicle.get(v.id) || { severe: 0, open: 0, total: 0 },
    }))
    .sort((a, b) => {
      if (a.damages.total > 0 && b.damages.total === 0) return -1;
      if (a.damages.total === 0 && b.damages.total > 0) return 1;
      return b.damages.open - a.damages.open;
    });

  return <DamagesWorkspace vehicles={vehicles} canManage={isAdmin} />;
}
