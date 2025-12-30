import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
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

  const { data: staff, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .eq('role', 'staff')
    .single();

  if (error || !staff) {
    notFound();
  }

  return (
    <DashboardLayout user={user} variant="admin" title="Edit Staff">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Edit Staff</h2>
          <span className={styles.subtitle}>Update staff member details</span>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/admin/staff/${staff.id}`} className="btn btn-secondary">
            ← Back to Details
          </Link>
        </div>
      </div>

      <StaffForm staff={staff} mode="edit" />
    </DashboardLayout>
  );
}
