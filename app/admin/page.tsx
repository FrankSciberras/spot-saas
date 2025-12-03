import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './admin.module.css';

/**
 * Admin Dashboard - Overview page
 * Shows summary of drivers, vehicles, and recent shifts
 */
export default async function AdminDashboardPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  // Fetch summary data
  const [driversResult, vehiclesResult, shiftsResult] = await Promise.all([
    supabase.from('drivers').select('id, status').eq('status', 'active'),
    supabase.from('vehicles').select('id, status'),
    supabase.from('driver_shifts').select('id, start_time, driver_id').order('start_time', { ascending: false }).limit(5),
  ]);

  const activeDrivers = driversResult.data?.length || 0;
  const totalVehicles = vehiclesResult.data?.length || 0;
  const activeVehicles = vehiclesResult.data?.filter(v => v.status === 'active').length || 0;
  const recentShifts = shiftsResult.data || [];

  // Get drivers with expiring documents (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiryDate = thirtyDaysFromNow.toISOString().split('T')[0];

  const { data: expiringDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date')
    .or(`id_card_expiry_date.lte.${expiryDate},police_conduct_expiry_date.lte.${expiryDate},driving_license_expiry_date.lte.${expiryDate}`)
    .limit(5);

  return (
    <DashboardLayout user={user} variant="admin" title="Dashboard">
      <div className={styles.dashboard}>
        {/* Stats Cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>👤</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{activeDrivers}</span>
              <span className={styles.statLabel}>Active Drivers</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🚗</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{activeVehicles}</span>
              <span className={styles.statLabel}>Active Vehicles</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🚙</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{totalVehicles}</span>
              <span className={styles.statLabel}>Total Vehicles</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>📋</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{recentShifts.length}</span>
              <span className={styles.statLabel}>Recent Shifts</span>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className={styles.contentGrid}>
          {/* Expiring Documents Alert */}
          <div className="card">
            <div className="card-header">
              <h3>⚠️ Expiring Documents</h3>
            </div>
            <div className="card-body">
              {expiringDrivers && expiringDrivers.length > 0 ? (
                <ul className={styles.alertList}>
                  {expiringDrivers.map((driver) => (
                    <li key={driver.id} className={styles.alertItem}>
                      <strong>{driver.full_name}</strong>
                      <div className={styles.expiryDetails}>
                        {driver.id_card_expiry_date && new Date(driver.id_card_expiry_date) <= thirtyDaysFromNow && (
                          <span className="badge badge-warning">ID Card: {driver.id_card_expiry_date}</span>
                        )}
                        {driver.police_conduct_expiry_date && new Date(driver.police_conduct_expiry_date) <= thirtyDaysFromNow && (
                          <span className="badge badge-warning">Police: {driver.police_conduct_expiry_date}</span>
                        )}
                        {driver.driving_license_expiry_date && new Date(driver.driving_license_expiry_date) <= thirtyDaysFromNow && (
                          <span className="badge badge-warning">License: {driver.driving_license_expiry_date}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No documents expiring soon.</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">
              <h3>🚀 Quick Actions</h3>
            </div>
            <div className="card-body">
              <div className={styles.quickActions}>
                <a href="/admin/drivers/new" className="btn btn-primary">
                  Add New Driver
                </a>
                <a href="/admin/vehicles/new" className="btn btn-secondary">
                  Add New Vehicle
                </a>
                <a href="/admin/shifts" className="btn btn-outline">
                  View All Shifts
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
