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

  // Fetch available users: driver-role MEMBERS OF THIS FLEET only. An admin can
  // belong to several fleets, so a bare users query (RLS = "anyone I share an
  // org with") would mix other fleets' accounts into the picker.
  const { data: memberRows } = await supabase
    .from('memberships')
    .select('user_id, users:user_id (id, email, full_name, role)')
    .eq('organization_id', user.organization_id)
    .eq('role', 'driver');

  // Filter out users who already have a driver record in this fleet
  const { data: existingDrivers } = await supabase
    .from('drivers')
    .select('user_id')
    .eq('organization_id', user.organization_id);

  const existingUserIds = new Set(existingDrivers?.map(d => d.user_id) || []);
  const availableUsers = (memberRows || [])
    .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users))
    .filter((u): u is { id: string; email: string; full_name: string; role: string } => Boolean(u))
    .filter((u) => !existingUserIds.has(u.id))
    .sort((a, b) => (a.email || '').localeCompare(b.email || ''));

  // Fetch vehicles for assignment (explicit fleet filter, belt-and-braces)
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, assigned_driver_id')
    .eq('organization_id', user.organization_id)
    .order('registration_number');

  return (
    <FleetShell user={user} title="Add New Driver">
      <div className={`${styles.pageHeader} header-mobile-row`}>
        <div className={styles.pageTitle}>
          <div className={styles.breadcrumb}>Operations / Drivers / New</div>
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
