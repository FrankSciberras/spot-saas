import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import VehicleProfile from '@/components/admin/VehicleProfile';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import type { TabCost, TabDamage, TabPartUse, TabShift, VehicleTabKey } from '@/components/fleet/vehicles/VehicleTabPanels';

const TABS: VehicleTabKey[] = ['overview', 'shifts', 'service', 'damages', 'costs', 'documents', 'timeline'];

type Rel<T> = T | T[] | null | undefined;
const one = <T,>(r: Rel<T>): T | null => (Array.isArray(r) ? (r[0] ?? null) : (r ?? null));

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/**
 * Vehicle Detail Page — Modern unified view + inline edit
 */
export default async function VehicleDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const initialTab = (TABS as string[]).includes(tab ?? '') ? (tab as VehicleTabKey) : 'overview';
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select(`
      *,
      drivers:assigned_driver_id (id, full_name, phone)
    `)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !vehicle) {
    notFound();
  }

  // Fetch recent shifts
  const { data: shiftRows } = await supabase
    .from('driver_shifts')
    .select(`
      id, start_time, end_time, starting_mileage, ending_mileage, dashcam_checked, car_internal_checked,
      drivers:driver_id (id, full_name)
    `)
    .eq('vehicle_id', id)
    .eq('organization_id', user.organization_id)
    .order('start_time', { ascending: false })
    .limit(100);

  // Fetch service history
  const { data: serviceHistory } = await supabase
    .from('vehicle_services')
    .select('id, service_date, service_type, mileage_at_service, next_service_mileage, cost, currency, created_at')
    .eq('vehicle_id', id)
    .eq('organization_id', user.organization_id)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  // Fetch assigned drivers
  const { data: assignmentRows } = await supabase
    .from('driver_vehicle_assignments')
    .select(`drivers:driver_id (id, full_name, phone)`)
    .eq('vehicle_id', id);

  const normalizeDriver = (d: unknown): { id: string; full_name: string; phone?: string | null } | null => {
    if (!d) return null;
    if (Array.isArray(d)) return (d[0] as { id: string; full_name: string; phone?: string | null } | undefined) || null;
    return d as { id: string; full_name: string; phone?: string | null };
  };

  const assignedDrivers = (assignmentRows || [])
    .map((r: unknown) => normalizeDriver((r as { drivers?: unknown }).drivers))
    .filter((d): d is { id: string; full_name: string; phone?: string | null } => Boolean(d));

  // Fetch next service due
  const { data: latestServiceWithDue } = await supabase
    .from('vehicle_services')
    .select('id, next_service_mileage, mileage_at_service')
    .eq('vehicle_id', id)
    .not('next_service_mileage', 'is', null)
    .order('mileage_at_service', { ascending: false })
    .limit(1);

  // Fetch documents
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'vehicle')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  // Published car-model diagram presets (global, platform-admin managed) for the
  // inline "Car diagram" picker. RLS lets any authenticated user read these.
  const { data: vehicleModels } = await supabase
    .from('vehicle_models')
    .select('id, name')
    .eq('is_published', true)
    .order('name');

  // ── Data for the Damages / Service & parts / Costs tabs ──────────────────
  const modules = await getEnabledModuleKeys(user.organization_id);
  const partsOn = modules.has('parts');
  // Money per car is admin-only, like Bookkeeping itself (RLS agrees).
  const costsOn = isAdmin && modules.has('bookkeeping');
  const sinceYear = new Date();
  sinceYear.setFullYear(sinceYear.getFullYear() - 1);

  const [damagesRes, partsRes, costsRes] = await Promise.all([
    supabase
      .from('vehicle_damages')
      .select('id, zone, description, severity, status, repair_cost, reported_at, repaired_at')
      .eq('vehicle_id', id)
      .eq('organization_id', user.organization_id)
      .order('reported_at', { ascending: false })
      .limit(200),
    partsOn
      ? supabase
          .from('part_usage')
          .select('id, used_at, quantity, unit_cost_at_use, parts:part_id (name, unit_cost)')
          .eq('vehicle_id', id)
          .eq('organization_id', user.organization_id)
          .order('used_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[] }),
    costsOn
      ? supabase
          .from('finance_transactions')
          .select('id, txn_date, amount, description, category:category_id (name, kind)')
          .eq('vehicle_id', id)
          .eq('organization_id', user.organization_id)
          .gte('txn_date', sinceYear.toISOString().slice(0, 10))
          .order('txn_date', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: null }),
  ]);

  const shifts: TabShift[] = ((shiftRows ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    start_time: r.start_time as string,
    end_time: (r.end_time as string | null) ?? null,
    starting_mileage: (r.starting_mileage as number | null) ?? null,
    ending_mileage: (r.ending_mileage as number | null) ?? null,
    dashcam_checked: (r.dashcam_checked as boolean | null) ?? null,
    car_internal_checked: (r.car_internal_checked as boolean | null) ?? null,
    driver: one(r.drivers as Rel<{ id: string; full_name: string }>),
  }));

  const damages: TabDamage[] = ((damagesRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    zone: (r.zone as string) ?? '',
    description: (r.description as string) ?? '',
    severity: (r.severity as string) ?? 'minor',
    status: (r.status as string) ?? 'open',
    repair_cost: r.repair_cost != null ? Number(r.repair_cost) : null,
    reported_at: r.reported_at as string,
    repaired_at: (r.repaired_at as string | null) ?? null,
  }));

  const parts: TabPartUse[] = ((partsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const part = one(r.parts as Rel<{ name: string; unit_cost: number | string | null }>);
    const unit = r.unit_cost_at_use ?? part?.unit_cost ?? null;
    return {
      id: r.id as string,
      used_at: r.used_at as string,
      quantity: Number(r.quantity) || 0,
      unit_cost: unit != null ? Number(unit) : null,
      part_name: part?.name ?? 'Part',
    };
  });

  const costs: TabCost[] | null = costsOn
    ? ((costsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
        const cat = one(r.category as Rel<{ name: string; kind: 'income' | 'expense' }>);
        return {
          id: r.id as string,
          txn_date: r.txn_date as string,
          amount: Number(r.amount) || 0,
          description: (r.description as string | null) ?? null,
          category: cat?.name ?? 'Uncategorised',
          kind: cat?.kind === 'income' ? 'income' : 'expense',
        };
      })
    : null;

  return (
    <FleetShell user={user} title={vehicle.registration_number}>
      <VehicleProfile
        vehicle={vehicle}
        documents={documents || []}
        assignedDrivers={assignedDrivers}
        shifts={shifts}
        damages={damages}
        parts={parts}
        partsOn={partsOn}
        costs={costs}
        initialTab={initialTab}
        serviceHistory={(serviceHistory || []) as any}
        nextServiceDue={latestServiceWithDue?.[0] || null}
        vehicleModels={vehicleModels || []}
        isAdmin={isAdmin}
      />
    </FleetShell>
  );
}
