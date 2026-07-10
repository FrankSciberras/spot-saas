import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
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

  const isDualRoleStaff = staff.role === 'driver' && staff.also_staff;

  return (
    <FleetShell user={user} title="Staff Details">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>{staff.full_name || staff.email}</h2>
          <div className={styles.actions}>
            <Link href="/fleet/staff" className="btn btn-secondary">
              ← Back
            </Link>
            <Link href={`/fleet/staff/${staff.id}/edit`} className="btn btn-primary">
              Edit
            </Link>
            <DeleteStaffButton
              staffId={staff.id}
              staffName={staff.full_name || staff.email}
              isDualRole={isDualRoleStaff}
            />
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
                <span className="badge badge-info">{isDualRoleStaff ? 'driver + staff' : staff.role}</span>
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
    </FleetShell>
  );
}
