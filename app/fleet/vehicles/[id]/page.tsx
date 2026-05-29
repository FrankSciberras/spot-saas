import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import VehicleProfile from '@/components/admin/VehicleProfile';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Vehicle Detail Page — Modern unified view + inline edit
 */
export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params;
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
    .single();

  if (error || !vehicle) {
    notFound();
  }

  // Fetch recent shifts
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select(`
      id, start_time, end_time, starting_mileage,
      drivers:driver_id (full_name)
    `)
    .eq('vehicle_id', id)
    .order('start_time', { ascending: false })
    .limit(5);

  // Fetch service history
  const { data: serviceHistory } = await supabase
    .from('vehicle_services')
    .select('id, service_date, service_type, mileage_at_service, next_service_mileage, cost, currency, created_at')
    .eq('vehicle_id', id)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

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

  return (
    <FleetShell user={user} title={vehicle.registration_number}>
      <VehicleProfile
        vehicle={vehicle}
        documents={documents || []}
        assignedDrivers={assignedDrivers}
        recentShifts={(recentShifts || []) as any}
        serviceHistory={(serviceHistory || []) as any}
        nextServiceDue={latestServiceWithDue?.[0] || null}
        isAdmin={isAdmin}
      />
    </FleetShell>
  );
}
