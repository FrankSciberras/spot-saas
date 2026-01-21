import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
import styles from './driver.module.css';

/**
 * Driver Dashboard - Fresh Minimal Design
 * What a driver wants to see: Next shift, Earnings graph, Key stats
 */
export default async function DriverDashboardPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <DashboardLayout user={user} variant="driver" title="Dashboard">
        <div className={styles.page}>
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h2>Profile Not Found</h2>
            <p>Please contact an administrator to set up your driver profile.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get settlements for earnings chart (last 8 weeks) with platform breakdown
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      week_start, 
      week_label, 
      final_balance, 
      total_gross_fare,
      settlement_platforms (
        platform_name,
        gross_fare,
        balance
      )
    `)
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .order('week_start', { ascending: false })
    .limit(8);

  // Get next scheduled shift from roster
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: nextShiftData } = await supabase
    .from('roster_assignments')
    .select(`
      assignment_date,
      vehicles:vehicle_id (registration_number, make, model),
      rosters:roster_id (title, status)
    `)
    .eq('driver_id', driver.id)
    .gte('assignment_date', today.toISOString().split('T')[0])
    .order('assignment_date', { ascending: true })
    .limit(1)
    .single();

  interface NextShift {
    assignment_date: string;
    vehicles: { registration_number: string; make: string; model: string } | null;
    rosters: { title: string; status: string } | null;
  }
  
  // Normalize the data from Supabase
  const normalizeNextShift = (): NextShift | null => {
    if (!nextShiftData) return null;
    const data = nextShiftData as { 
      assignment_date: string; 
      vehicles: { registration_number: string; make: string; model: string }[] | { registration_number: string; make: string; model: string } | null;
      rosters: { title: string; status: string }[] | { title: string; status: string } | null;
    };
    
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles[0] : data.vehicles;
    const rosters = Array.isArray(data.rosters) ? data.rosters[0] : data.rosters;
    
    if (rosters?.status !== 'published') return null;
    
    return {
      assignment_date: data.assignment_date,
      vehicles: vehicles || null,
      rosters: rosters || null
    };
  };
  
  const nextShift = normalizeNextShift();

  // Calculate stats
  const chartData = (settlements || []).slice(0, 6).reverse();
  const latestSettlement = settlements?.[0];
  const previousSettlement = settlements?.[1];
  
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthlyEarnings = settlements?.filter(s => new Date(s.week_start) >= monthStart)
    .reduce((sum, s) => sum + (s.final_balance || 0), 0) || 0;

  const totalEarnings = settlements?.reduce((sum, s) => sum + (s.final_balance || 0), 0) || 0;
  const avgWeekly = settlements?.length ? totalEarnings / settlements.length : 0;
  
  const percentChange = previousSettlement && latestSettlement 
    ? ((latestSettlement.final_balance - previousSettlement.final_balance) / (previousSettlement.final_balance || 1) * 100)
    : 0;

  // Calculate week-over-week difference
  const weekDifference = latestSettlement && previousSettlement
    ? latestSettlement.final_balance - previousSettlement.final_balance
    : 0;

  // Get platform earnings from latest settlement
  interface SettlementPlatform {
    platform_name: string;
    gross_fare: number;
    balance: number;
  }
  
  const latestPlatforms = (latestSettlement?.settlement_platforms as SettlementPlatform[] | undefined) || [];
  const boltEarnings = latestPlatforms.find(p => p.platform_name?.toLowerCase().includes('bolt'))?.balance || 0;
  const uberEarnings = latestPlatforms.find(p => p.platform_name?.toLowerCase().includes('uber'))?.balance || 0;

  // Get total shifts
  const { count: totalShifts } = await supabase
    .from('driver_shifts')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', driver.id);

  // Chart calculations
  const maxEarning = Math.max(...chartData.map(s => s.final_balance || 0), 1);
  const minEarning = Math.min(...chartData.map(s => s.final_balance || 0));
  const chartRange = maxEarning - minEarning || 1;

  return (
    <DashboardLayout user={user} variant="driver" title="Dashboard">
      <div className={styles.page}>
        
        {/* Welcome + Start Shift */}
        <section className={styles.welcomeSection}>
          <div className={styles.welcomeText}>
            <span className={styles.welcomeLabel}>Welcome back</span>
            <h1 className={styles.welcomeName}>{driver.full_name?.split(' ')[0]}</h1>
          </div>
          <Link href="/driver/go-online" className={styles.startShiftBtn}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Start Shift
          </Link>
        </section>

        {/* Next Shift Card */}
        {nextShift && (
          <section className={styles.nextShiftCard}>
            <div className={styles.nextShiftHeader}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <span>Next Shift</span>
            </div>
            <div className={styles.nextShiftContent}>
              <div className={styles.nextShiftDate}>
                <span className={styles.nextShiftDay}>
                  {new Date(nextShift.assignment_date).toLocaleDateString('en-GB', { weekday: 'long' })}
                </span>
                <span className={styles.nextShiftFull}>
                  {new Date(nextShift.assignment_date).toLocaleDateString('en-GB', { 
                    day: 'numeric', month: 'long' 
                  })}
                </span>
              </div>
              {nextShift.vehicles && (
                <div className={styles.nextShiftVehicle}>
                  <span className={styles.vehicleReg}>{nextShift.vehicles.registration_number}</span>
                  <span className={styles.vehicleModel}>{nextShift.vehicles.make} {nextShift.vehicles.model}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Earnings Graph Card */}
        <section className={styles.earningsGraphCard}>
          <div className={styles.graphHeader}>
            <div>
              <span className={styles.graphLabel}>Weekly Earnings</span>
              <div className={styles.graphValue}>
                {latestSettlement ? formatCurrency(latestSettlement.final_balance) : '€0'}
                {percentChange !== 0 && (
                  <span className={`${styles.graphChange} ${percentChange >= 0 ? styles.up : styles.down}`}>
                    {percentChange >= 0 ? '↑' : '↓'} {Math.abs(percentChange).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <Link href="/driver/earnings" className={styles.graphLink}>
              View Details →
            </Link>
          </div>

          {/* SVG Line Graph */}
          {chartData.length > 1 && (
            <div className={styles.graphContainer}>
              <svg viewBox="0 0 300 120" className={styles.lineGraph} preserveAspectRatio="none">
                {/* Grid lines */}
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3"/>
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                
                {/* Area fill */}
                <path
                  d={`
                    M 0 ${100 - ((chartData[0]?.final_balance || 0) - minEarning) / chartRange * 80}
                    ${chartData.map((d, i) => {
                      const x = (i / (chartData.length - 1)) * 300;
                      const y = 100 - ((d.final_balance || 0) - minEarning) / chartRange * 80;
                      return `L ${x} ${y}`;
                    }).join(' ')}
                    L 300 100 L 0 100 Z
                  `}
                  fill="url(#areaGradient)"
                />
                
                {/* Line */}
                <path
                  d={`
                    M 0 ${100 - ((chartData[0]?.final_balance || 0) - minEarning) / chartRange * 80}
                    ${chartData.map((d, i) => {
                      const x = (i / (chartData.length - 1)) * 300;
                      const y = 100 - ((d.final_balance || 0) - minEarning) / chartRange * 80;
                      return `L ${x} ${y}`;
                    }).join(' ')}
                  `}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
                {/* Data points */}
                {chartData.map((d, i) => {
                  const x = (i / (chartData.length - 1)) * 300;
                  const y = 100 - ((d.final_balance || 0) - minEarning) / chartRange * 80;
                  return (
                    <circle
                      key={d.week_start}
                      cx={x}
                      cy={y}
                      r={i === chartData.length - 1 ? 6 : 4}
                      fill={i === chartData.length - 1 ? 'var(--color-primary)' : 'var(--bg-card)'}
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                    />
                  );
                })}
              </svg>
              
              {/* X-axis labels */}
              <div className={styles.graphLabels}>
                {chartData.map((d, i) => (
                  <span key={d.week_start} className={i === chartData.length - 1 ? styles.currentLabel : ''}>
                    {new Date(d.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </div>
          )}

          {chartData.length <= 1 && (
            <div className={styles.noDataMessage}>
              <p>Earnings data will appear here once you have more settlements.</p>
            </div>
          )}
        </section>

        {/* Weekly Earnings Breakdown */}
        {latestSettlement && (
          <section className={styles.earningsBreakdown}>
            <div className={styles.breakdownHeader}>
              <div className={styles.breakdownTitle}>
                <span className={styles.breakdownWeek}>{latestSettlement.week_label}</span>
                <span className={styles.breakdownTotal}>{formatCurrency(latestSettlement.final_balance)}</span>
              </div>
              {previousSettlement && (
                <div className={`${styles.breakdownChange} ${weekDifference >= 0 ? styles.up : styles.down}`}>
                  <span className={styles.changeIcon}>{weekDifference >= 0 ? '↑' : '↓'}</span>
                  <span className={styles.changeAmount}>{formatCurrency(Math.abs(weekDifference))}</span>
                  <span className={styles.changeLabel}>vs last week</span>
                </div>
              )}
            </div>
            
            <div className={styles.platformsGrid}>
              {/* Bolt */}
              <div className={styles.platformCard}>
                <div className={styles.platformHeader}>
                  <div className={`${styles.platformDot} ${styles.bolt}`} />
                  <span className={styles.platformName}>Bolt</span>
                </div>
                <span className={styles.platformValue}>{formatCurrency(boltEarnings)}</span>
              </div>
              
              {/* Uber */}
              <div className={styles.platformCard}>
                <div className={styles.platformHeader}>
                  <div className={`${styles.platformDot} ${styles.uber}`} />
                  <span className={styles.platformName}>Uber</span>
                </div>
                <span className={styles.platformValue}>{formatCurrency(uberEarnings)}</span>
              </div>
            </div>
          </section>
        )}

        {/* Quick Actions */}
        <section className={styles.actionsSection}>
          <h2 className={styles.sectionTitle}>Quick Actions</h2>
          <div className={styles.actionsGrid}>
            <Link href="/driver/settlements" className={styles.actionBtn}>
              <div className={styles.actionBtnIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                  <rect x="9" y="3" width="6" height="4" rx="1"/>
                  <path d="M9 12h6M9 16h6"/>
                </svg>
              </div>
              <span>Settlements</span>
            </Link>
            <Link href="/driver/earnings" className={styles.actionBtn}>
              <div className={styles.actionBtnIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <span>Earnings</span>
            </Link>
            <Link href="/driver/roster" className={styles.actionBtn}>
              <div className={styles.actionBtnIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
              </div>
              <span>Roster</span>
            </Link>
            <Link href="/driver/shifts" className={styles.actionBtn}>
              <div className={styles.actionBtnIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <span>Shifts</span>
            </Link>
          </div>
        </section>

      </div>
    </DashboardLayout>
  );
}
