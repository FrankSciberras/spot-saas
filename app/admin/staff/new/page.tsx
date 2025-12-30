import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import DashboardLayout from '@/components/shared/DashboardLayout';
import StaffForm from '@/components/admin/StaffForm';
import styles from '@/components/admin/AdminForms.module.css';

/**
 * Add New Staff Page
 */
export default async function NewStaffPage() {
  const user = await requireRole(['admin']);

  return (
    <DashboardLayout user={user} variant="admin" title="Add New Staff">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Add New Staff</h2>
          <span className={styles.subtitle}>Create a new staff member account</span>
        </div>
        <div className={styles.pageActions}>
          <Link href="/admin/staff" className="btn btn-secondary">
            ← Back to Staff
          </Link>
        </div>
      </div>

      <StaffForm mode="create" />
    </DashboardLayout>
  );
}
