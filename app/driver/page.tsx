import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './driver.module.css';

/**
 * Driver Dashboard - Overview for logged-in drivers
 */
export default async function DriverDashboardPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select(`
      *,
      vehicles:assigned_vehicle_id (
        id,
        registration_number,
        make,
        model,
        year
      )
    `)
    .eq('user_id', user.id)
    .single();

  // Get recent shifts
  const { data: recentShifts } = driver ? await supabase
    .from('driver_shifts')
    .select('id, start_time, vehicle_id, starting_mileage')
    .eq('driver_id', driver.id)
    .order('start_time', { ascending: false })
    .limit(5) : { data: null };

  // Check for expiring documents
  const checkExpiry = (dateStr: string | null): 'ok' | 'warning' | 'danger' => {
    if (!dateStr) return 'ok';
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    if (date < now) return 'danger';
    if (date <= thirtyDays) return 'warning';
    return 'ok';
  };

  return (
    <DashboardLayout user={user} variant="driver" title="Dashboard">
      <div className={styles.dashboard}>
        {!driver ? (
          <div className="alert alert-warning">
            Your driver profile is not yet set up. Please contact an administrator.
          </div>
        ) : (
          <>
            {/* Quick Actions */}
            <div className={styles.quickActionsCard}>
              <Link href="/driver/go-online" className={styles.goOnlineBtn}>
                <span className={styles.goOnlineIcon}>🟢</span>
                <span>Go Online</span>
              </Link>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
              {/* Assigned Vehicle */}
              <div className="card">
                <div className="card-header">
                  <h3>🚗 Assigned Vehicle</h3>
                </div>
                <div className="card-body">
                  {driver.vehicles ? (
                    <div>
                      <p className={styles.vehicleReg}>{driver.vehicles.registration_number}</p>
                      <p className={styles.vehicleInfo}>
                        {driver.vehicles.make} {driver.vehicles.model} ({driver.vehicles.year})
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted">No vehicle assigned</p>
                  )}
                </div>
              </div>

              {/* Document Status */}
              <div className="card">
                <div className="card-header">
                  <h3>📄 Document Status</h3>
                </div>
                <div className="card-body">
                  <ul className={styles.documentList}>
                    <li>
                      <span>ID Card:</span>
                      <span className={`badge badge-${checkExpiry(driver.id_card_expiry_date) === 'ok' ? 'success' : checkExpiry(driver.id_card_expiry_date)}`}>
                        {driver.id_card_expiry_date || 'Not set'}
                      </span>
                    </li>
                    <li>
                      <span>Police Conduct:</span>
                      <span className={`badge badge-${checkExpiry(driver.police_conduct_expiry_date) === 'ok' ? 'success' : checkExpiry(driver.police_conduct_expiry_date)}`}>
                        {driver.police_conduct_expiry_date || 'Not set'}
                      </span>
                    </li>
                    <li>
                      <span>Driving License:</span>
                      <span className={`badge badge-${checkExpiry(driver.driving_license_expiry_date) === 'ok' ? 'success' : checkExpiry(driver.driving_license_expiry_date)}`}>
                        {driver.driving_license_expiry_date || 'Not set'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Recent Shifts */}
            <div className="card">
              <div className="card-header">
                <h3>📋 Recent Shifts</h3>
              </div>
              <div className="card-body">
                {recentShifts && recentShifts.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Starting Mileage</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentShifts.map((shift) => (
                        <tr key={shift.id}>
                          <td>{new Date(shift.start_time).toLocaleString()}</td>
                          <td>{shift.starting_mileage?.toLocaleString()} km</td>
                          <td>
                            <Link href={`/driver/shifts/${shift.id}`} className="btn btn-sm btn-outline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-muted">No shifts recorded yet.</p>
                )}
                <div className={styles.viewAllLink}>
                  <Link href="/driver/shifts">View all shifts →</Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
