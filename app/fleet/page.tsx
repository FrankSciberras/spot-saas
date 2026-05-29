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
  const bookkeepingEntriesResult = user.role === 'admin'
    ? await supabase
        .from('weekly_bookkeeping')
        .select(
          'week_start, week_label, total_income, total_expenses, net_profit, uber_earnings, bolt_earnings, ecabs_earnings, other_earnings, employees, repairs, insurance, investments, vat, rent, employee_tax, other_expenses'
        )
        .order('week_start', { ascending: true })
    : { data: [] as any[] };
  const bookkeepingEntries = bookkeepingEntriesResult.data || [];

  const financialSeries = bookkeepingEntries.map((b: any) => ({
    label: String(b.week_label || ''),
    income: Number(b.total_income) || 0,
    expenses: Number(b.total_expenses) || 0,
    profit: Number(b.net_profit) || 0,
  }));

  const aggregates = bookkeepingEntries.reduce(
    (
      acc: {
        totals: { income: number; expenses: number; profit: number };
        income: { bolt: number; uber: number; ecabs: number; other: number };
        expenses: {
          employees: number;
          repairs: number;
          insurance: number;
          investments: number;
          vat: number;
          rent: number;
          employee_tax: number;
          other_expenses: number;
        };
      },
      b: any
    ) => {
      acc.totals.income += Number(b.total_income) || 0;
      acc.totals.expenses += Number(b.total_expenses) || 0;
      acc.totals.profit += Number(b.net_profit) || 0;

      acc.income.bolt += Number(b.bolt_earnings) || 0;
      acc.income.uber += Number(b.uber_earnings) || 0;
      acc.income.ecabs += Number(b.ecabs_earnings) || 0;
      acc.income.other += Number(b.other_earnings) || 0;

      acc.expenses.employees += Number(b.employees) || 0;
      acc.expenses.repairs += Number(b.repairs) || 0;
      acc.expenses.insurance += Number(b.insurance) || 0;
      acc.expenses.investments += Number(b.investments) || 0;
      acc.expenses.vat += Number(b.vat) || 0;
      acc.expenses.rent += Number(b.rent) || 0;
      acc.expenses.employee_tax += Number(b.employee_tax) || 0;
      acc.expenses.other_expenses += Number(b.other_expenses) || 0;

      return acc;
    },
    {
      totals: { income: 0, expenses: 0, profit: 0 },
      income: { bolt: 0, uber: 0, ecabs: 0, other: 0 },
      expenses: {
        employees: 0,
        repairs: 0,
        insurance: 0,
        investments: 0,
        vat: 0,
        rent: 0,
        employee_tax: 0,
        other_expenses: 0,
      },
    }
  );

  const totals = aggregates.totals;

  const incomeBreakdown = [
    { name: 'Bolt', value: aggregates.income.bolt, color: '#34D186' },
    { name: 'Uber', value: aggregates.income.uber, color: '#111827' },
    { name: 'Ecabs', value: aggregates.income.ecabs, color: '#FFB800' },
    { name: 'Other', value: aggregates.income.other, color: 'var(--color-secondary)' },
  ].filter((p) => p.value > 0);

  const expenseBreakdown = [
    { name: 'Employees', value: aggregates.expenses.employees, color: 'var(--color-danger)' },
    { name: 'Repairs', value: aggregates.expenses.repairs, color: 'var(--color-danger)' },
    { name: 'Insurance', value: aggregates.expenses.insurance, color: 'var(--color-danger)' },
    { name: 'Investments', value: aggregates.expenses.investments, color: 'var(--color-danger)' },
    { name: 'VAT', value: aggregates.expenses.vat, color: 'var(--color-danger)' },
    { name: 'Rent', value: aggregates.expenses.rent, color: 'var(--color-danger)' },
    { name: 'Employee tax', value: aggregates.expenses.employee_tax, color: 'var(--color-danger)' },
    { name: 'Other', value: aggregates.expenses.other_expenses, color: 'var(--color-danger)' },
  ].filter((p) => p.value > 0);

  return (
    <DashboardLayout user={user} variant="admin" title="">
      <div className={styles.dashboard}>
        {/* Welcome Section */}
        <div className={styles.welcomeSection}>
          <h1 className={styles.welcomeTitle}>Welcome back 👋</h1>
          <p className={styles.welcomeSubtitle}>Here&apos;s what&apos;s happening with your fleet today.</p>
        </div>

        <AdminDashboardInsights
          financialSeries={financialSeries}
          totals={totals}
          incomeBreakdown={incomeBreakdown}
          expenseBreakdown={expenseBreakdown}
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
