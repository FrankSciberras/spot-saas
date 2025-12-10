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
    .limit(3) : { data: null };

  // Check for expiring documents
  const checkExpiry = (dateStr: string | null): 'ok' | 'warning' | 'danger' => {
    if (!dateStr) return 'warning';
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    if (date < now) return 'danger';
    if (date <= thirtyDays) return 'warning';
    return 'ok';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getExpiryLabel = (dateStr: string | null) => {
    if (!dateStr) return 'Not set';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Expired';
    if (diff <= 30) return `${diff} days left`;
    return formatDate(dateStr);
  };

  return (
    <DashboardLayout user={user} variant="driver" title="Dashboard">
      <div className={styles.dashboard}>
        {!driver ? (
          <div className={styles.alertCard}>
            <span className={styles.alertIcon}>⚠️</span>
            <p>Your driver profile is not yet set up. Please contact an administrator.</p>
          </div>
        ) : (
          <>
            {/* Welcome & Go Online */}
            <div className={styles.welcomeSection}>
              <div className={styles.welcomeText}>
                <h1>Hello, {driver.full_name?.split(' ')[0] || 'Driver'}</h1>
                <p>Ready to start your shift?</p>
              </div>
              <Link href="/driver/go-online" className={styles.goOnlineBtn}>
                <span className={styles.goOnlineIcon}>▶</span>
                Go Online
              </Link>
            </div>

            {/* Quick Stats */}
            <div className={styles.statsRow}>
              {/* Vehicle Card */}
              <div className={styles.statCard}>
                <div className={styles.statIcon}>🚗</div>
                <div className={styles.statContent}>
                  <span className={styles.statLabel}>My Vehicle</span>
                  {driver.vehicles ? (
                    <>
                      <span className={styles.statValue}>{driver.vehicles.registration_number}</span>
                      <span className={styles.statSub}>{driver.vehicles.make} {driver.vehicles.model}</span>
                    </>
                  ) : (
                    <span className={styles.statValue}>Not assigned</span>
                  )}
                </div>
              </div>

              {/* Documents Card */}
              <div className={styles.statCard}>
                <div className={styles.statIcon}>📄</div>
                <div className={styles.statContent}>
                  <span className={styles.statLabel}>Documents</span>
                  <span className={styles.statValue}>
                    {[
                      checkExpiry(driver.id_card_expiry_date),
                      checkExpiry(driver.police_conduct_expiry_date),
                      checkExpiry(driver.driving_license_expiry_date)
                    ].filter(s => s === 'ok').length}/3 Valid
                  </span>
                  <Link href="/driver/profile" className={styles.statLink}>View Details →</Link>
                </div>
              </div>
            </div>

            {/* Document Status */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2>Document Expiry</h2>
                <Link href="/driver/profile" className={styles.viewAllBtn}>View All</Link>
              </div>
              <div className={styles.docGrid}>
                <div className={`${styles.docItem} ${styles[checkExpiry(driver.id_card_expiry_date)]}`}>
                  <span className={styles.docName}>ID Card</span>
                  <span className={styles.docExpiry}>{getExpiryLabel(driver.id_card_expiry_date)}</span>
                </div>
                <div className={`${styles.docItem} ${styles[checkExpiry(driver.police_conduct_expiry_date)]}`}>
                  <span className={styles.docName}>Police Conduct</span>
                  <span className={styles.docExpiry}>{getExpiryLabel(driver.police_conduct_expiry_date)}</span>
                </div>
                <div className={`${styles.docItem} ${styles[checkExpiry(driver.driving_license_expiry_date)]}`}>
                  <span className={styles.docName}>Driving License</span>
                  <span className={styles.docExpiry}>{getExpiryLabel(driver.driving_license_expiry_date)}</span>
                </div>
              </div>
            </div>

            {/* Recent Shifts */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h2>Recent Shifts</h2>
                <Link href="/driver/shifts" className={styles.viewAllBtn}>View All</Link>
              </div>
              {recentShifts && recentShifts.length > 0 ? (
                <div className={styles.shiftsList}>
                  {recentShifts.map((shift) => (
                    <Link href={`/driver/shifts/${shift.id}`} key={shift.id} className={styles.shiftItem}>
                      <div className={styles.shiftDate}>
                        {new Date(shift.start_time).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short'
                        })}
                      </div>
                      <div className={styles.shiftMileage}>
                        {shift.starting_mileage?.toLocaleString()} km
                      </div>
                      <span className={styles.shiftArrow}>→</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyText}>No shifts recorded yet</p>
              )}
            </div>

            {/* Quick Links */}
            <div className={styles.quickLinks}>
              <Link href="/driver/roster" className={styles.quickLink}>
                <span>📅</span>
                My Roster
              </Link>
              <Link href="/driver/earnings" className={styles.quickLink}>
                <span>💰</span>
                Earnings
              </Link>
              <Link href="/driver/profile" className={styles.quickLink}>
                <span>👤</span>
                Profile
              </Link>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
