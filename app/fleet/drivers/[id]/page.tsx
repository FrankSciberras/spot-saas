import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DriverProfile from '@/components/admin/DriverProfile';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Driver Detail Page — Modern unified view + inline edit
 */
export default async function DriverDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: driver, error } = await supabase
    .from('drivers')
    .select(`
      *,
      users:user_id (id, email, full_name, also_staff),
      vehicles:assigned_vehicle_id (id, registration_number, make, model)
    `)
    .eq('id', id)
    .single();

  if (error || !driver) {
    notFound();
  }

  const alsoStaff = (driver.users as { also_staff?: boolean } | null)?.also_staff ?? false;

  // Fetch documents
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'driver')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  // Fetch recent shifts
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select('id, start_time, end_time, starting_mileage')
    .eq('driver_id', id)
    .order('start_time', { ascending: false })
    .limit(5);

  // Fetch all vehicles for assignment dropdown
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, assigned_driver_id')
    .order('registration_number');

  return (
    <DashboardLayout user={user} variant="admin" title={driver.full_name}>
      <DriverProfile
        driver={driver}
        vehicles={vehicles || []}
        documents={documents || []}
        recentShifts={recentShifts || []}
        isAdmin={isAdmin}
        alsoStaff={alsoStaff}
      />
    </DashboardLayout>
  );
}
