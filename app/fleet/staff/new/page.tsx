import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import StaffForm from '@/components/admin/StaffForm';
import styles from '@/components/admin/AdminForms.module.css';

/**
 * Add New Staff Page
 */
export default async function NewStaffPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  const { data: existingAccounts } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('role', 'driver')
    .eq('also_staff', false)
    .order('full_name');

  return (
    <FleetShell user={user} title="Add New Staff">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Add New Staff</h2>
          <span className={styles.subtitle}>Create a new account or grant staff access to an existing driver</span>
        </div>
        <div className={styles.pageActions}>
          <Link href="/fleet/staff" className="btn btn-secondary">
            ← Back to Staff
          </Link>
        </div>
      </div>

      <StaffForm mode="create" existingAccounts={existingAccounts || []} />
    </FleetShell>
  );
}
