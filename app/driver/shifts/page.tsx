import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './shifts.module.css';

/**
 * Driver Shifts List - View all past shifts for the logged-in driver
 */
export default async function DriverShiftsPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <DashboardLayout user={user} variant="driver" title="My Shifts">
        <div className="alert alert-warning">
          Your driver profile is not set up. Please contact an administrator.
        </div>
      </DashboardLayout>
    );
  }

  // Get shifts
  const { data: shifts, error } = await supabase
    .from('driver_shifts')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('driver_id', driver.id)
    .order('start_time', { ascending: false });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <DashboardLayout user={user} variant="driver" title="My Shifts">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>My Shift History</h2>
          <Link href="/driver/go-online" className="btn btn-primary">
            🟢 Go Online
          </Link>
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
                  <th>Date & Time</th>
                  <th>Vehicle</th>
                  <th>Starting Mileage</th>
                  <th>Checks</th>
                  <th>Images</th>
                </tr>
              </thead>
              <tbody>
                {shifts && shifts.length > 0 ? (
                  shifts.map((shift) => (
                    <tr key={shift.id}>
                      <td>{formatDate(shift.start_time)}</td>
                      <td>
                        {shift.vehicles ? (
                          <span>
                            {shift.vehicles.registration_number} - {shift.vehicles.make} {shift.vehicles.model}
                          </span>
                        ) : 'Unknown'}
                      </td>
                      <td>{shift.starting_mileage?.toLocaleString()} km</td>
                      <td>
                        <div className={styles.checks}>
                          <span className={`badge ${shift.dashcam_checked ? 'badge-success' : 'badge-secondary'}`}>
                            Dashcam {shift.dashcam_checked ? '✓' : '✗'}
                          </span>
                          <span className={`badge ${shift.car_internal_checked ? 'badge-success' : 'badge-secondary'}`}>
                            Internal {shift.car_internal_checked ? '✓' : '✗'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.imageLinks}>
                          {shift.front_image_url && (
                            <a href={shift.front_image_url} target="_blank" rel="noopener noreferrer">Front</a>
                          )}
                          {shift.left_image_url && (
                            <a href={shift.left_image_url} target="_blank" rel="noopener noreferrer">Left</a>
                          )}
                          {shift.right_image_url && (
                            <a href={shift.right_image_url} target="_blank" rel="noopener noreferrer">Right</a>
                          )}
                          {shift.back_image_url && (
                            <a href={shift.back_image_url} target="_blank" rel="noopener noreferrer">Back</a>
                          )}
                          {!shift.front_image_url && !shift.left_image_url && !shift.right_image_url && !shift.back_image_url && (
                            <span className="text-muted">No images</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No shifts recorded yet. Click &quot;Go Online&quot; to start your first shift.
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
