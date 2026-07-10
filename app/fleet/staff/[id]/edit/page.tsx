import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import StaffForm from '@/components/admin/StaffForm';
import styles from '@/components/admin/AdminForms.module.css';

interface EditStaffPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit Staff Page
 */
export default async function EditStaffPage({ params }: EditStaffPageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Scope to THIS fleet's members (users has no organization_id — join via memberships).
  const { data: orgMembers } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', user.organization_id);
  const memberIds = (orgMembers || []).map((m) => m.user_id);

  const { data: staff, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .in('id', memberIds)
    .or('role.eq.staff,also_staff.eq.true')
    .single();

  if (error || !staff) {
    notFound();
  }

  return (
    <FleetShell user={user} title="Edit Staff">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleMain}>
          <h2>Edit Staff</h2>
          <span className={styles.subtitle}>Update staff member details</span>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/fleet/staff/${staff.id}`} className="btn btn-secondary">
            ← Back to Details
          </Link>
        </div>
      </div>

      <StaffForm staff={staff} mode="edit" />
    </FleetShell>
  );
}
