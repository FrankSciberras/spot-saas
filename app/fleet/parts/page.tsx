import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import PartsWorkspace, {
  type PartRow,
  type UsageRow,
  type VehicleOption,
} from '@/components/fleet/parts/PartsWorkspace';

/**
 * Parts & Inventory — stock list with low-stock alerts + usage log.
 * Module-gated ('parts'); admins and staff can manage stock.
 */
export default async function PartsPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'parts');
  return (
    <FleetShell user={user} title="Parts">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={4} />}>
        <PartsContent orgId={user.organization_id} isAdmin={user.role === 'admin'} />
      </Suspense>
    </FleetShell>
  );
}

interface PartRecord {
  id: string;
  name: string;
  part_number: string | null;
  category: string | null;
  quantity: number;
  min_quantity: number;
  unit_cost: number | null;
  supplier: string | null;
  location: string | null;
  notes: string | null;
}

interface UsageRecord {
  id: string;
  quantity: number;
  unit_cost_at_use: number | null;
  used_at: string;
  notes: string | null;
  parts: { name: string } | null;
  vehicles: { registration_number: string } | null;
}

async function PartsContent({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const supabase = await createClient();

  const [{ data: partRows }, { data: usageRows }, { data: vehicleRows }] = await Promise.all([
    supabase
      .from('parts')
      .select('id, name, part_number, category, quantity, min_quantity, unit_cost, supplier, location, notes')
      .eq('organization_id', orgId)
      .order('name'),
    supabase
      .from('part_usage')
      .select('id, quantity, unit_cost_at_use, used_at, notes, parts:part_id(name), vehicles:vehicle_id(registration_number)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('vehicles')
      .select('id, registration_number')
      .eq('organization_id', orgId)
      .order('registration_number'),
  ]);

  const parts: PartRow[] = ((partRows ?? []) as PartRecord[]).map((p) => ({
    id: p.id,
    name: p.name,
    partNumber: p.part_number,
    category: p.category,
    quantity: p.quantity,
    minQuantity: p.min_quantity,
    unitCost: p.unit_cost != null ? Number(p.unit_cost) : null,
    supplier: p.supplier,
    location: p.location,
    notes: p.notes,
  }));

  const usage: UsageRow[] = ((usageRows ?? []) as unknown as UsageRecord[]).map((u) => ({
    id: u.id,
    partName: u.parts?.name ?? 'Part',
    vehicleReg: u.vehicles?.registration_number ?? null,
    quantity: u.quantity,
    unitCost: u.unit_cost_at_use != null ? Number(u.unit_cost_at_use) : null,
    usedAt: u.used_at,
    notes: u.notes,
  }));

  const vehicles: VehicleOption[] = ((vehicleRows ?? []) as { id: string; registration_number: string }[]).map((v) => ({
    id: v.id,
    reg: v.registration_number,
  }));

  return <PartsWorkspace parts={parts} usage={usage} vehicles={vehicles} isAdmin={isAdmin} />;
}
