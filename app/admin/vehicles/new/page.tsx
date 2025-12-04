import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import VehicleForm from '@/components/admin/VehicleForm';
import styles from '@/components/admin/AdminForms.module.css';

/**
 * Add New Vehicle Page
 */
export default async function NewVehiclePage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch drivers for assignment
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone, assigned_vehicle_id')
    .eq('status', 'active')
    .order('full_name');

  return (
    <DashboardLayout user={user} variant="admin" title="Add New Vehicle">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Add New Vehicle</h2>
          <span className={styles.subtitle}>Register a new vehicle to your fleet</span>
        </div>
        <div className={styles.pageActions}>
          <Link href="/admin/vehicles" className="btn btn-secondary">
            ← Back to Vehicles
          </Link>
        </div>
      </div>

      <VehicleForm 
        drivers={drivers || []} 
        mode="create" 
      />
    </DashboardLayout>
  );
}
