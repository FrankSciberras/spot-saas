import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import AdminDashboardInsights from '@/components/admin/AdminDashboardInsights';
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

  // Get drivers & vehicles with documents that are expired or expiring within 30 days
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const expiryDate = thirtyDaysFromNow.toISOString().split('T')[0];

  const { data: expiringDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date')
    .or(`id_card_expiry_date.lte.${expiryDate},police_conduct_expiry_date.lte.${expiryDate},driving_license_expiry_date.lte.${expiryDate}`)
    .limit(5);

  const { data: expiringVehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, insurance_expiry_date, road_license_expiry_date')
    .or(`insurance_expiry_date.lte.${expiryDate},road_license_expiry_date.lte.${expiryDate}`)
    .limit(5);

  const renderExpiryBadge = (label: string, dateStr: string | null) => {
    if (!dateStr) return null;

    const date = new Date(dateStr);

    if (date < now) {
      return (
        <span className="badge badge-danger">
          {label}: {dateStr} (Expired - needs renewal)
        </span>
      );
    }

    if (date <= thirtyDaysFromNow) {
      return (
        <span className="badge badge-warning">
          {label}: {dateStr} (Expiring soon)
        </span>
      );
    }

    return null;
  };

  const hasDriverDocs = !!expiringDrivers && expiringDrivers.length > 0;
  const hasVehicleDocs = !!expiringVehicles && expiringVehicles.length > 0;
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString().split('T')[0];

  const { data: recentSettlements } = await supabase
    .from('driver_settlements')
    .select(
      `
        id,
        driver_id,
        week_start,
        week_label,
        status,
        total_net,
        drivers:driver_id (full_name),
        settlement_platforms (platform_id, platform_name, net, tips, campaigns)
      `
    )
    .eq('status', 'finalized')
    .gte('week_start', sinceIso)
    .order('week_start', { ascending: true });

  const settlementRows = recentSettlements || [];

  const seriesMap = new Map<string, { label: string; net: number; tips: number; campaigns: number; total: number }>();
  const platformMap = new Map<string, { name: string; value: number }>();
  const driverMap = new Map<string, { name: string; total: number }>();

  let totalNet = 0;
  let totalTips = 0;
  let totalCampaigns = 0;

  for (const s of settlementRows as any[]) {
    const weekStart = String(s.week_start || '');
    const key = weekStart;
    const label = weekStart
      ? new Date(weekStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : 'Period';

    const platforms = Array.isArray(s.settlement_platforms) ? s.settlement_platforms : [];
    const net = Number(s.total_net) || 0;
    const tips = platforms.reduce((sum: number, p: any) => sum + (Number(p.tips) || 0), 0);
    const campaigns = platforms.reduce((sum: number, p: any) => sum + (Number(p.campaigns) || 0), 0);
    const total = net + tips + campaigns;

    totalNet += net;
    totalTips += tips;
    totalCampaigns += campaigns;

    const existing = seriesMap.get(key) || { label, net: 0, tips: 0, campaigns: 0, total: 0 };
    existing.net += net;
    existing.tips += tips;
    existing.campaigns += campaigns;
    existing.total += total;
    seriesMap.set(key, existing);

    for (const p of platforms) {
      const pid = String(p.platform_id || p.platform_name || 'platform');
      const pname = String(p.platform_name || p.platform_id || 'Platform');
      const pTotal = (Number(p.net) || 0) + (Number(p.tips) || 0) + (Number(p.campaigns) || 0);
      const prev = platformMap.get(pid) || { name: pname, value: 0 };
      prev.value += pTotal;
      platformMap.set(pid, prev);
    }

    const driverId = String(s.driver_id || 'driver');
    const driverName = String(s.drivers?.full_name || 'Unknown Driver');
    const prevDriver = driverMap.get(driverId) || { name: driverName, total: 0 };
    prevDriver.total += total;
    driverMap.set(driverId, prevDriver);
  }

  const earningsSeries = Array.from(seriesMap.values());
  const totals = {
    total: totalNet + totalTips + totalCampaigns,
    net: totalNet,
    tips: totalTips,
    campaigns: totalCampaigns,
    settlements: settlementRows.length,
  };

  const defaultPlatformColors: Record<string, string> = {
    bolt: '#34D186',
    uber: '#111827',
    ecabs: '#FFB800',
  };

  const platformSeries = Array.from(platformMap.entries()).map(([id, p]) => ({
    name: p.name,
    value: p.value,
    color: defaultPlatformColors[id] || 'var(--color-primary)',
  }));

  const topDrivers = Array.from(driverMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <DashboardLayout user={user} variant="admin" title="">
      <div className={styles.dashboard}>
        {/* Welcome Section */}
        <div className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Welcome back 👋</h1>
          <p className={styles.welcomeSubtitle}>Here&apos;s what&apos;s happening with your fleet today.</p>
        </div>

        <AdminDashboardInsights
          earningsSeries={earningsSeries}
          totals={totals}
          platformSeries={platformSeries}
          topDrivers={topDrivers}
        />

        {/* Stats Cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>👤</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{activeDrivers}</span>
              <span className={styles.statLabel}>Active Drivers</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconGreen}`}>🚗</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{activeVehicles}</span>
              <span className={styles.statLabel}>Active Vehicles</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>🚙</div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>{totalVehicles}</span>
              <span className={styles.statLabel}>Total Fleet</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconOrange}`}>📋</div>
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
              {hasDriverDocs || hasVehicleDocs ? (
                <>
                  {hasDriverDocs && (
                    <>
                      <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Drivers</h4>
                      <ul className={styles.alertList}>
                        {expiringDrivers!.map((driver) => (
                          <li key={driver.id} className={styles.alertItem}>
                            <strong>{driver.full_name}</strong>
                            <div className={styles.expiryDetails}>
                              {renderExpiryBadge('ID Card', driver.id_card_expiry_date)}
                              {renderExpiryBadge('Police', driver.police_conduct_expiry_date)}
                              {renderExpiryBadge('License', driver.driving_license_expiry_date)}
                            </div>
                            <div className={styles.expiryActions}>
                              <a
                                href={`/admin/drivers/${driver.id}/edit`}
                                className={styles.renewLink}
                              >
                                Renew
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {hasVehicleDocs && (
                    <>
                      <h4 style={{ marginTop: hasDriverDocs ? '0.75rem' : 0, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Vehicles</h4>
                      <ul className={styles.alertList}>
                        {expiringVehicles!.map((vehicle) => (
                          <li key={vehicle.id} className={styles.alertItem}>
                            <strong>
                              {vehicle.registration_number} 
                              {vehicle.make && vehicle.model && ` - ${vehicle.make} ${vehicle.model}`}
                            </strong>
                            <div className={styles.expiryDetails}>
                              {renderExpiryBadge('Insurance', vehicle.insurance_expiry_date)}
                              {renderExpiryBadge('Road License', vehicle.road_license_expiry_date)}
                            </div>
                            <div className={styles.expiryActions}>
                              <a
                                href={`/admin/vehicles/${vehicle.id}/edit`}
                                className={styles.renewLink}
                              >
                                Renew
                              </a>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <p className="text-muted">No driver or vehicle documents expired or expiring soon. All good! </p>
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
                  + Add New Driver
                </a>
                <a href="/admin/vehicles/new" className="btn btn-secondary">
                  + Add New Vehicle
                </a>
                <a href="/admin/rosters" className="btn btn-secondary">
                  📅 Manage Rosters
                </a>
                <a href="/admin/shifts" className="btn btn-outline">
                  View All Shifts →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
