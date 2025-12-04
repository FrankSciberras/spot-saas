import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
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
    .single();

  if (error || !vehicle) {
    notFound();
  }

  // Fetch drivers for assignment
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone, assigned_vehicle_id')
    .eq('status', 'active')
    .order('full_name');

  return (
    <DashboardLayout user={user} variant="admin" title={`Edit: ${vehicle.registration_number}`}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Edit Vehicle</h2>
          <span className={styles.subtitle}>
            Updating: {vehicle.registration_number} - {vehicle.make} {vehicle.model}
          </span>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/admin/vehicles/${id}`} className="btn btn-secondary">
            ← Back to Vehicle
          </Link>
        </div>
      </div>

      <VehicleForm 
        vehicle={vehicle}
        drivers={drivers || []} 
        mode="edit" 
      />
    </DashboardLayout>
  );
}
