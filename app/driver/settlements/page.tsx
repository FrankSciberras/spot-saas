import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import { PLATFORMS } from '@/lib/config/settlements';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
import type { DriverSettlement, SettlementPlatform, Driver } from '@/lib/types/database';
import styles from './driver-settlements.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

/**
 * Driver Settlements Page - View own weekly settlements
 */
export default async function DriverSettlementsPage() {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const supabase = await createClient();

  // Get driver record for current user
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single();

  if (driverError || !driver) {
    if (user.role !== 'driver') {
      redirect('/admin');
    }
    return (
      <DashboardLayout user={user} variant="driver" title="My Settlements">
        <div className={styles.errorCard}>
          <h3>Profile Not Found</h3>
          <p>Your driver profile has not been set up yet. Please contact an administrator.</p>
        </div>
      </DashboardLayout>
    );
  }

  // Fetch settlements for this driver
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      settlement_platforms (*)
    `)
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .order('week_start', { ascending: false })
    .limit(12);

  // Get the most recent settlement for the balance card
  const latestSettlement = settlements?.[0] as SettlementWithPlatforms | undefined;

  // Get platform icon
  const getPlatformIcon = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId)?.icon || '📊';
  };

  return (
    <DashboardLayout user={user} variant="driver" title="My Settlements">
      <div className={styles.container}>
        {/* Latest Balance Card */}
        {latestSettlement && (
          <div className={styles.balanceCard}>
            <div className={styles.balanceHeader}>
              <span className={styles.balanceLabel}>Latest Weekly Balance</span>
              <span className={styles.balanceWeek}>{latestSettlement.week_label}</span>
            </div>
            <div className={styles.balanceAmount}>
              {formatCurrency(latestSettlement.final_balance)}
            </div>
            <div className={styles.balanceBreakdown}>
              <div className={styles.breakdownItem}>
                <span>Total Earnings</span>
                <span>{formatCurrency(latestSettlement.total_gross_fare)}</span>
              </div>
              <div className={styles.breakdownItem}>
                <span>Your Net</span>
                <span>{formatCurrency(latestSettlement.total_net)}</span>
              </div>
              <div className={styles.breakdownItem}>
                <span>FSS/Tax</span>
                <span>-{formatCurrency(latestSettlement.fss_tax)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Settlements History */}
        <div className={styles.historySection}>
          <h2>Settlement History</h2>
          
          {!settlements || settlements.length === 0 ? (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
              <h3>No settlements yet</h3>
              <p>Your weekly settlements will appear here once they are finalized.</p>
            </div>
          ) : (
            <div className={styles.settlementsList}>
              {(settlements as SettlementWithPlatforms[]).map(settlement => (
                <div key={settlement.id} className={styles.settlementCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.weekInfo}>
                      <span className={styles.weekLabel}>{settlement.week_label}</span>
                      {settlement.period_name && (
                        <span className={styles.periodName}>{settlement.period_name}</span>
                      )}
                    </div>
                    <span className={`${styles.finalBalance} ${settlement.final_balance >= 0 ? styles.positive : styles.negative}`}>
                      {formatCurrency(settlement.final_balance)}
                    </span>
                  </div>

                  {/* Platform breakdown */}
                  <div className={styles.platformsList}>
                    {settlement.settlement_platforms.map(platform => (
                      <div key={platform.id} className={styles.platformRow}>
                        <span className={styles.platformName}>
                          <span className={styles.platformIcon}>
                            {getPlatformIcon(platform.platform_id)}
                          </span>
                          {platform.platform_name}
                        </span>
                        <div className={styles.platformValues}>
                          <span className={styles.platformGross}>
                            Gross: {formatCurrency(platform.gross_fare)}
                          </span>
                          <span className={styles.platformBalance}>
                            {formatCurrency(platform.balance)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className={styles.cardSummary}>
                    <div className={styles.summaryRow}>
                      <span>Total Net</span>
                      <span>{formatCurrency(settlement.total_net)}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Cash Collected</span>
                      <span>-{formatCurrency(
                        settlement.settlement_platforms.reduce((sum, p) => sum + p.cash_ride, 0)
                      )}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Tips</span>
                      <span>+{formatCurrency(
                        settlement.settlement_platforms.reduce((sum, p) => sum + p.tips, 0)
                      )}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Campaigns</span>
                      <span>+{formatCurrency(
                        settlement.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0)
                      )}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>FSS/Tax</span>
                      <span>-{formatCurrency(settlement.fss_tax)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
