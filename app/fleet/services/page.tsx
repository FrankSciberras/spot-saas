import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import ServicesWorkspace, {
  type SvcRecord,
  type SvcStatus,
  type SpendMonth,
  type DueSoonVehicle,
} from '@/components/fleet/services/ServicesWorkspace';

interface VehicleService {
  id: string;
  vehicle_id: string;
  service_date: string;
  service_type: string;
  mileage_at_service: number;
  next_service_mileage: number | null;
  next_service_date: string | null;
  cost: number | null;
  currency: string;
  service_provider: string | null;
  description: string | null;
  vehicles: {
    id: string;
    registration_number: string;
    make: string;
    model: string;
  } | null;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  tire_replacement: 'Tire Replacement',
  brake_service: 'Brake Service',
  brake_pads: 'Brake Pads',
  brake_discs: 'Brake Discs',
  air_filter: 'Air Filter',
  cabin_filter: 'Cabin Filter',
  spark_plugs: 'Spark Plugs',
  battery: 'Battery',
  transmission: 'Transmission',
  coolant_flush: 'Coolant Flush',
  timing_belt: 'Timing Belt',
  general_inspection: 'General Inspection',
  annual_service: 'Annual Service',
  major_service: 'Major Service',
  repair: 'Repair',
  other: 'Other',
};

const INSPECTION_TYPES = new Set(['general_inspection', 'annual_service', 'major_service']);

function categoryFor(serviceType: string): SvcRecord['category'] {
  if (serviceType === 'repair') return 'repair';
  if (INSPECTION_TYPES.has(serviceType)) return 'inspection';
  return 'scheduled';
}

export default async function ServicesPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const { data: services } = await supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: vehiclesData } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, mileage');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const svc = (services || []) as VehicleService[];

  const records: SvcRecord[] = svc.map((s) => {
    const d = new Date(s.service_date);
    const status: SvcStatus = d > today ? 'scheduled' : 'completed';
    return {
      id: s.id,
      vehicleId: s.vehicle_id,
      plate: s.vehicles?.registration_number || '—',
      type: SERVICE_TYPE_LABELS[s.service_type] || s.service_type,
      garage: s.service_provider || '—',
      mechanic: '—',
      cost: s.cost,
      date: s.service_date,
      status,
      category: categoryFor(s.service_type),
    };
  });

  // Spend this month (completed records dated in the current month)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const spendMonth = svc
    .filter((s) => new Date(s.service_date) >= monthStart)
    .reduce((sum, s) => sum + (s.cost || 0), 0);

  // Last 6 months of spend, grouped by calendar month
  const spend6mo: SpendMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const v = svc
      .filter((s) => {
        const d = new Date(s.service_date);
        return d >= start && d < end;
      })
      .reduce((sum, s) => sum + (s.cost || 0), 0);
    spend6mo.push({ label: start.toLocaleDateString('en-GB', { month: 'short' }), v });
  }

  // Due soon + overdue by km, from the latest service per vehicle that has a next_service_mileage
  const latestByVehicle = new Map<string, VehicleService>();
  for (const s of svc) {
    if (s.next_service_mileage) {
      const existing = latestByVehicle.get(s.vehicle_id);
      if (!existing || s.mileage_at_service > existing.mileage_at_service) {
        latestByVehicle.set(s.vehicle_id, s);
      }
    }
  }

  const dueAll: DueSoonVehicle[] = [];
  for (const vehicle of vehiclesData || []) {
    const last = latestByVehicle.get(vehicle.id);
    if (last?.next_service_mileage) {
      const currentMileage = Math.max(vehicle.mileage || 0, last.mileage_at_service);
      const kmRemaining = last.next_service_mileage - currentMileage;
      dueAll.push({
        vehicleId: vehicle.id,
        plate: vehicle.registration_number,
        model: `${vehicle.make} ${vehicle.model}`.trim(),
        kmRemaining,
      });
    }
  }
  dueAll.sort((a, b) => a.kmRemaining - b.kmRemaining);

  const overdueCount = dueAll.filter((v) => v.kmRemaining <= 0).length;
  const dueSoon = dueAll.slice(0, 6);

  return (
    <FleetShell user={user} title="Services">
      <ServicesWorkspace
        records={records}
        spend6mo={spend6mo}
        dueSoon={dueSoon}
        overdueCount={overdueCount}
        spendMonth={spendMonth}
      />
    </FleetShell>
  );
}
