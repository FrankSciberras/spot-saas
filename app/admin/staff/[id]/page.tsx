import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DeleteStaffButton from '@/components/admin/DeleteStaffButton';
import styles from '../staff.module.css';

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Staff Detail Page
 */
export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
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
    <DashboardLayout user={user} variant="admin" title="Staff Details">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>{staff.full_name || staff.email}</h2>
          <div className={styles.actions}>
            <Link href="/admin/staff" className="btn btn-secondary">
              ← Back
            </Link>
            <Link href={`/admin/staff/${staff.id}/edit`} className="btn btn-primary">
              Edit
            </Link>
            <DeleteStaffButton staffId={staff.id} staffName={staff.full_name || staff.email} />
          </div>
        </div>

        <div className="card">
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>Full Name</div>
              <div className={styles.detailValue}>{staff.full_name || '-'}</div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>Email</div>
              <div className={styles.detailValue}>{staff.email}</div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>Role</div>
              <div className={styles.detailValue}>
                <span className="badge badge-info">{staff.role}</span>
              </div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>Created At</div>
              <div className={styles.detailValue}>
                {new Date(staff.created_at).toLocaleDateString()} at {new Date(staff.created_at).toLocaleTimeString()}
              </div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>Last Updated</div>
              <div className={styles.detailValue}>
                {new Date(staff.updated_at).toLocaleDateString()} at {new Date(staff.updated_at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
