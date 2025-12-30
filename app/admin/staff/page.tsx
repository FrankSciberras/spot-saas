import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import type { User } from '@/lib/types/database';
import styles from './staff.module.css';

/**
 * Admin Staff List Page
 */
export default async function StaffPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  const { data: staffMembers, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'staff')
    .order('full_name');

  return (
    <DashboardLayout user={user} variant="admin" title="Staff">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>All Staff</h2>
          <Link href="/admin/staff/new" className="btn btn-primary">
            + Add Staff
          </Link>
        </div>

        {error && (
          <div className="alert alert-danger">
            Error loading staff: {error.message}
          </div>
        )}

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffMembers && staffMembers.length > 0 ? (
                  staffMembers.map((staff: User) => (
                    <tr key={staff.id}>
                      <td>
                        <strong>{staff.full_name || '-'}</strong>
                      </td>
                      <td>{staff.email}</td>
                      <td>
                        <span className="badge badge-info">
                          {staff.role}
                        </span>
                      </td>
                      <td>
                        {new Date(staff.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/staff/${staff.id}`} className="btn btn-sm btn-outline">
                            View
                          </Link>
                          <Link href={`/admin/staff/${staff.id}/edit`} className="btn btn-sm btn-secondary">
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No staff members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
