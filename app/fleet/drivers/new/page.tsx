import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import DriverForm from '@/components/admin/DriverForm';
import styles from '@/components/admin/AdminForms.module.css';

/**
 * Add New Driver Page
 */
export default async function NewDriverPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch available users (with driver role that don't have a driver record yet)
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('role', 'driver')
    .order('email');

  // Filter out users who already have a driver record
  const { data: existingDrivers } = await supabase
    .from('drivers')
    .select('user_id');

  const existingUserIds = new Set(existingDrivers?.map(d => d.user_id) || []);
  const availableUsers = users?.filter(u => !existingUserIds.has(u.id)) || [];

  // Fetch vehicles for assignment
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, assigned_driver_id')
    .order('registration_number');

  return (
    <FleetShell user={user} title="Add New Driver">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Add New Driver</h2>
          <span className={styles.subtitle}>Create a new driver profile and link to a user account</span>
        </div>
        <div className={styles.pageActions}>
          <Link href="/fleet/drivers" className="btn btn-secondary">
            ← Back to Drivers
          </Link>
        </div>
      </div>

      <DriverForm 
        vehicles={vehicles || []} 
        users={availableUsers}
        mode="create" 
      />
    </FleetShell>
  );
}
