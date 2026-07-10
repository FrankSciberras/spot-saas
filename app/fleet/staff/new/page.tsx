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

  // Only this fleet's members (users has no organization_id — join via memberships).
  const { data: orgMembers } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', user.organization_id);
  const memberIds = (orgMembers || []).map((m) => m.user_id);

  const { data: existingAccounts } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .in('id', memberIds)
    .eq('role', 'driver')
    .eq('also_staff', false)
    .order('full_name');

  return (
    <FleetShell user={user} title="Add New Staff">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleMain}>
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
