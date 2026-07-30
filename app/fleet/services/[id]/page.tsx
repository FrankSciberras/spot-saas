import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import ServiceDetail, {
  type ServiceDetailRecord,
  type ServiceDetailVehicle,
  type SiblingService,
  type SvcDetailStatus,
} from '@/components/fleet/services/ServiceDetail';

interface PageProps {
  params: Promise<{ id: string }>;
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
  transmission: 'Transmission Service',
  coolant_flush: 'Coolant Flush',
  timing_belt: 'Timing Belt',
  general_inspection: 'General Inspection',
  annual_service: 'Annual Service',
  major_service: 'Major Service',
  repair: 'Repair',
  other: 'Other',
};

const INSPECTION_TYPES = new Set(['general_inspection', 'annual_service', 'major_service']);

function categoryFor(serviceType: string): ServiceDetailRecord['category'] {
  if (serviceType === 'repair') return 'repair';
  if (INSPECTION_TYPES.has(serviceType)) return 'inspection';
  return 'scheduled';
}

const labelFor = (t: string) => SERVICE_TYPE_LABELS[t] || t;

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'maintenance');
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: service, error } = await supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model, year, mileage),
      users:created_by (full_name, email)
    `)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !service) {
    notFound();
  }

  // Other jobs on the same vehicle, so the record sits in context instead of
  // dead-ending. Fetched newest-first and capped — this is a sidebar, not a log.
  const { data: siblingRows } = service.vehicle_id
    ? await supabase
        .from('vehicle_services')
        .select('id, service_date, service_type, mileage_at_service, cost')
        .eq('organization_id', user.organization_id)
        .eq('vehicle_id', service.vehicle_id)
        .neq('id', id)
        .order('service_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6)
    : { data: [] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const vehicle: ServiceDetailVehicle | null = service.vehicles
    ? {
        id: service.vehicles.id,
        plate: service.vehicles.registration_number,
        make: service.vehicles.make,
        model: service.vehicles.model,
        year: service.vehicles.year ?? null,
        mileage: service.vehicles.mileage ?? 0,
      }
    : null;

  // A future-dated record is still a booking; anything else is work already done.
  // "Overdue" is reserved for a booking whose date has slipped past today.
  const serviceDate = new Date(service.service_date);
  const status: SvcDetailStatus = serviceDate > today ? 'scheduled' : 'completed';

  const creator = service.users as { full_name: string | null; email: string | null } | null;

  const record: ServiceDetailRecord = {
    id: service.id,
    serviceType: service.service_type,
    typeLabel: labelFor(service.service_type),
    category: categoryFor(service.service_type),
    serviceDate: service.service_date,
    mileageAtService: service.mileage_at_service ?? 0,
    nextServiceMileage: service.next_service_mileage ?? null,
    nextServiceDate: service.next_service_date ?? null,
    cost: service.cost ?? null,
    currency: service.currency || 'EUR',
    serviceProvider: service.service_provider ?? null,
    description: service.description ?? null,
    partsReplaced: service.parts_replaced ?? null,
    createdAt: service.created_at,
    createdBy: creator?.full_name || creator?.email || null,
    status,
  };

  const siblings: SiblingService[] = (siblingRows || []).map((s) => ({
    id: s.id,
    typeLabel: labelFor(s.service_type),
    date: s.service_date,
    cost: s.cost ?? null,
    mileage: s.mileage_at_service ?? 0,
  }));

  return (
    <FleetShell user={user} title={`${record.typeLabel}${vehicle ? ` · ${vehicle.plate}` : ''}`}>
      <ServiceDetail service={record} vehicle={vehicle} siblings={siblings} isAdmin={isAdmin} />
    </FleetShell>
  );
}
