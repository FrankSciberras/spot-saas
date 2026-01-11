import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
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

  const { data: assignmentRows } = driver ? await supabase
    .from('driver_vehicle_assignments')
    .select(`
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('driver_id', driver.id)
    : { data: null };

  const normalizeVehicle = (v: unknown): { id: string; registration_number: string; make: string; model: string } | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as { id: string; registration_number: string; make: string; model: string } | undefined) || null;
    return v as { id: string; registration_number: string; make: string; model: string };
  };

  const assignedVehicles = (assignmentRows || [])
    .map((r: unknown) => normalizeVehicle((r as { vehicles?: unknown }).vehicles))
    .filter((v): v is { id: string; registration_number: string; make: string; model: string } => Boolean(v));

  // Get recent shifts
  const { data: recentShifts } = driver ? await supabase
    .from('driver_shifts')
    .select('id, start_time, vehicle_id, starting_mileage')
    .eq('driver_id', driver.id)
    .order('start_time', { ascending: false })
    .limit(3) : { data: null };

  // Get earnings stats from settlements
  const thisWeekStart = new Date();
  const dayOfWeek = thisWeekStart.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  thisWeekStart.setDate(thisWeekStart.getDate() + diffToMonday);
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Get finalized settlements for stats
  const { data: settlements } = driver ? await supabase
    .from('driver_settlements')
    .select('week_start, week_label, final_balance, total_gross_fare, total_net, status')
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .order('week_start', { ascending: false })
    .limit(12) : { data: null };

  // Calculate earnings stats
  const latestSettlement = settlements?.[0];
  const previousSettlement = settlements?.[1];
  
  // This month's total
  const monthlyEarnings = settlements?.filter(s => {
    const weekStart = new Date(s.week_start);
    return weekStart >= monthStart;
  }).reduce((sum, s) => sum + (s.final_balance || 0), 0) || 0;

  // Total rides (approximate from shifts)
  const { count: totalShifts } = driver ? await supabase
    .from('driver_shifts')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', driver.id) : { count: 0 };

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

            {/* Earnings Overview Card */}
            <div className={styles.earningsCard}>
              <div className={styles.earningsHeader}>
                <div className={styles.earningsTitle}>
                  <span className={styles.earningsIcon}>💰</span>
                  <div>
                    <h2>My Earnings</h2>
                    <span className={styles.earningsPeriod}>
                      {latestSettlement ? latestSettlement.week_label : 'No settlements yet'}
                    </span>
                  </div>
                </div>
                <Link href="/driver/settlements" className={styles.settlementsBtn}>
                  View Settlements
                </Link>
              </div>
              <div className={styles.earningsStats}>
                <div className={styles.earningStat}>
                  <span className={styles.earningAmount}>
                    {latestSettlement ? formatCurrency(latestSettlement.final_balance) : '€0.00'}
                  </span>
                  <span className={styles.earningLabel}>Latest Balance</span>
                  {previousSettlement && latestSettlement && (
                    <span className={`${styles.earningChange} ${latestSettlement.final_balance >= previousSettlement.final_balance ? styles.positive : styles.negative}`}>
                      {latestSettlement.final_balance >= previousSettlement.final_balance ? '↑' : '↓'}
                      {formatCurrency(Math.abs(latestSettlement.final_balance - previousSettlement.final_balance))}
                    </span>
                  )}
                </div>
                <div className={styles.earningStat}>
                  <span className={styles.earningAmount}>
                    {formatCurrency(monthlyEarnings)}
                  </span>
                  <span className={styles.earningLabel}>This Month</span>
                </div>
                <div className={styles.earningStat}>
                  <span className={styles.earningAmount}>
                    {totalShifts || 0}
                  </span>
                  <span className={styles.earningLabel}>Total Shifts</span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className={styles.statsRow}>
              {/* Vehicle Card */}
              <div className={styles.statCard}>
                <div className={styles.statIcon}>🚗</div>
                <div className={styles.statContent}>
                  <span className={styles.statLabel}>My Vehicle</span>
                  {assignedVehicles.length > 0 ? (
                    <>
                      <span className={styles.statValue}>
                        {assignedVehicles.map((v) => v.registration_number).join(', ')}
                      </span>
                      <span className={styles.statSub}>
                        {assignedVehicles.length} assigned
                      </span>
                    </>
                  ) : driver.vehicles ? (
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
              <Link href="/driver/settlements" className={styles.quickLink}>
                <span>📊</span>
                Settlements
              </Link>
              <Link href="/driver/earnings" className={styles.quickLink}>
                <span>💰</span>
                Earnings
              </Link>
              <Link href="/driver/roster" className={styles.quickLink}>
                <span>📅</span>
                Roster
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
