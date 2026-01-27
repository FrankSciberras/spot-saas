import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './shifts.module.css';

/**
 * Admin Shifts List Page - View all driver shifts (Go Online records)
 */
export default async function ShiftsPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const timeZone = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

  const { data: shifts, error } = await supabase
    .from('driver_shifts')
    .select(`
      *,
      drivers:driver_id (id, full_name),
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .order('start_time', { ascending: false })
    .limit(100);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DashboardLayout user={user} variant="admin" title="Driver Shifts">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>All Shifts (Go Online Records)</h2>
        </div>

        {error && (
          <div className="alert alert-danger">
            Error loading shifts: {error.message}
          </div>
        )}

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Start Time</th>
                  <th>Driver</th>
                  <th>Vehicle</th>
                  <th>Name on Shift</th>
                  <th>Starting Mileage</th>
                  <th>Checks</th>
                  <th>Images</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts && shifts.length > 0 ? (
                  shifts.map((shift: Record<string, unknown>) => (
                    <tr key={shift.id as string}>
                      <td>{formatDate(shift.start_time as string)}</td>
                      <td>
                        {(shift.drivers as { full_name: string } | null)?.full_name ?? 'Unknown'}
                      </td>
                      <td>
                        {(shift.vehicles as Record<string, unknown>) ? (
                          <span>
                            {(shift.vehicles as Record<string, unknown>).registration_number as string} - {(shift.vehicles as Record<string, unknown>).make as string} {(shift.vehicles as Record<string, unknown>).model as string}
                          </span>
                        ) : 'Unknown'}
                      </td>
                      <td>{shift.name as string}</td>
                      <td>{(shift.starting_mileage as number)?.toLocaleString()} km</td>
                      <td>
                        <div className={styles.checks}>
                          <span className={`badge ${shift.dashcam_checked ? 'badge-success' : 'badge-secondary'}`}>
                            Dashcam: {shift.dashcam_checked ? '✓' : '✗'}
                          </span>
                          <span className={`badge ${shift.car_internal_checked ? 'badge-success' : 'badge-secondary'}`}>
                            Internal: {shift.car_internal_checked ? '✓' : '✗'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.imageIndicators}>
                          {/* {shift.front_image_url && <span title="Front">🚗</span>}
                          {shift.left_image_url && <span title="Left">◀️</span>}
                          {shift.right_image_url && <span title="Right">▶️</span>}
                          {shift.back_image_url && <span title="Back">🔙</span>} */}
                        </div>
                      </td>
                      <td>
                        <Link href={`/admin/shifts/${shift.id as string}`} className="btn btn-sm btn-outline">
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center text-muted">
                      No shifts found.
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
