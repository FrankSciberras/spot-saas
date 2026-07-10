import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import VehicleForm from '@/components/admin/VehicleForm';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit Vehicle Page
 */
export default async function EditVehiclePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch the vehicle
  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !vehicle) {
    notFound();
  }

  // Fetch drivers for assignment
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone, assigned_vehicle_id')
    .eq('organization_id', user.organization_id)
    .eq('status', 'active')
    .order('full_name');

  // Fetch documents for this vehicle
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'vehicle')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  return (
    <FleetShell user={user} title={`Edit: ${vehicle.registration_number}`}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleMain}>
          <h2>Edit Vehicle</h2>
          <span className={styles.subtitle}>
            Updating: {vehicle.registration_number} - {vehicle.make} {vehicle.model}
          </span>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/fleet/vehicles/${id}`} className="btn btn-secondary">
            ← Back to Vehicle
          </Link>
        </div>
      </div>

      <VehicleForm 
        vehicle={vehicle}
        drivers={drivers || []} 
        documents={documents || []}
        mode="edit" 
      />
    </FleetShell>
  );
}
