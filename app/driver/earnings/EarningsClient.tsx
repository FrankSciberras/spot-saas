'use client';

import { useState, useMemo } from 'react';
import { PLATFORMS } from '@/lib/config/settlements';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
import type { DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import styles from './earnings.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

interface EarningsClientProps {
  settlements: SettlementWithPlatforms[];
  driverName: string;
}

type ViewMode = 'weekly' | 'monthly';

export default function EarningsClient({ settlements, driverName }: EarningsClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');

  // Calculate totals and stats
  const stats = useMemo(() => {
    if (settlements.length === 0) {
      return {
        totalNet: 0,
        totalTips: 0,
        totalCampaigns: 0,
        totalGross: 0,
        avgWeeklyEarnings: 0,
        bestWeek: null as SettlementWithPlatforms | null,
        platformBreakdown: [] as { id: string; name: string; icon: string; color: string; total: number; percentage: number }[],
        weeklyData: [] as { label: string; net: number; tips: number; campaigns: number }[],
        monthlyData: [] as { label: string; net: number; tips: number; campaigns: number; weeks: number }[],
      };
    }

    let totalNet = 0;
    let totalTips = 0;
    let totalCampaigns = 0;
    let totalGross = 0;
    const platformTotals: Record<string, number> = {};
    let bestWeek: SettlementWithPlatforms | null = null;

    // Weekly data for chart
    const weeklyData = settlements.slice(0, 12).reverse().map(s => {
      const tips = s.settlement_platforms.reduce((sum, p) => sum + p.tips, 0);
      const campaigns = s.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0);
      return {
        label: s.week_label,
        net: s.total_net,
        tips,
        campaigns,
      };
    });

    // Process settlements
    settlements.forEach(s => {
      totalNet += s.total_net;
      totalGross += s.total_gross_fare;
      
      const weekTotal = s.total_net + 
        s.settlement_platforms.reduce((sum, p) => sum + p.tips + (p.campaigns || 0), 0);
      
      if (!bestWeek || weekTotal > (bestWeek.total_net + 
        bestWeek.settlement_platforms.reduce((sum, p) => sum + p.tips + (p.campaigns || 0), 0))) {
        bestWeek = s;
      }

      s.settlement_platforms.forEach(p => {
        totalTips += p.tips;
        totalCampaigns += p.campaigns || 0;
        platformTotals[p.platform_id] = (platformTotals[p.platform_id] || 0) + p.net;
      });
    });

    // Platform breakdown
    const platformBreakdown = PLATFORMS.map(p => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      total: platformTotals[p.id] || 0,
      percentage: totalNet > 0 ? ((platformTotals[p.id] || 0) / totalNet) * 100 : 0,
    })).filter(p => p.total > 0);

    // Monthly data
    const monthlyMap = new Map<string, { net: number; tips: number; campaigns: number; weeks: number }>();
    settlements.forEach(s => {
      const month = new Date(s.week_start).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const tips = s.settlement_platforms.reduce((sum, p) => sum + p.tips, 0);
      const campaigns = s.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0);
      
      if (monthlyMap.has(month)) {
        const existing = monthlyMap.get(month)!;
        existing.net += s.total_net;
        existing.tips += tips;
        existing.campaigns += campaigns;
        existing.weeks += 1;
      } else {
        monthlyMap.set(month, { net: s.total_net, tips, campaigns, weeks: 1 });
      }
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .map(([label, data]) => ({ label, ...data }))
      .reverse();

    return {
      totalNet,
      totalTips,
      totalCampaigns,
      totalGross,
      avgWeeklyEarnings: settlements.length > 0 ? totalNet / settlements.length : 0,
      bestWeek,
      platformBreakdown,
      weeklyData,
      monthlyData,
    };
  }, [settlements]);

  // Get current period earnings
  const currentWeek = settlements[0];
  const lastWeek = settlements[1];
  const weekChange = currentWeek && lastWeek 
    ? ((currentWeek.total_net - lastWeek.total_net) / lastWeek.total_net) * 100 
    : 0;

  // Get platform icon
  const getPlatformIcon = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId)?.icon || '📊';
  };

  // Chart max for scaling
  const chartData = viewMode === 'weekly' ? stats.weeklyData : stats.monthlyData;
  const maxValue = Math.max(...chartData.map(d => d.net + d.tips + d.campaigns), 1);

  return (
    <div className={styles.container}>
      {/* Header Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>💰</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>This Week</span>
            <span className={styles.statValue}>
              {currentWeek ? formatCurrency(currentWeek.total_net) : '€0.00'}
            </span>
            {weekChange !== 0 && (
              <span className={`${styles.statChange} ${weekChange >= 0 ? styles.positive : styles.negative}`}>
                {weekChange >= 0 ? '↑' : '↓'} {Math.abs(weekChange).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>📈</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Avg Weekly</span>
            <span className={styles.statValue}>{formatCurrency(stats.avgWeeklyEarnings)}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>💵</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Total Tips</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalTips)}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>🎯</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Campaigns</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalCampaigns)}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Earnings Chart */}
        <div className={styles.chartSection}>
          <div className={styles.sectionHeader}>
            <h2>Earnings Overview</h2>
            <div className={styles.viewToggle}>
              <button 
                className={`${styles.toggleBtn} ${viewMode === 'weekly' ? styles.active : ''}`}
                onClick={() => setViewMode('weekly')}
              >
                Weekly
              </button>
              <button 
                className={`${styles.toggleBtn} ${viewMode === 'monthly' ? styles.active : ''}`}
                onClick={() => setViewMode('monthly')}
              >
                Monthly
              </button>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className={styles.emptyChart}>
              <p>No earnings data available yet</p>
            </div>
          ) : (
            <div className={styles.chart}>
              <div className={styles.chartBars}>
                {chartData.map((item, i) => {
                  const netHeight = (item.net / maxValue) * 100;
                  const tipsHeight = (item.tips / maxValue) * 100;
                  const campaignsHeight = (item.campaigns / maxValue) * 100;
                  const total = item.net + item.tips + item.campaigns;
                  
                  return (
                    <div key={i} className={styles.barGroup}>
                      <div className={styles.barContainer}>
                        <div className={styles.barStack}>
                          <div 
                            className={styles.barCampaigns} 
                            style={{ height: `${campaignsHeight}%` }}
                            title={`Campaigns: ${formatCurrency(item.campaigns)}`}
                          />
                          <div 
                            className={styles.barTips} 
                            style={{ height: `${tipsHeight}%` }}
                            title={`Tips: ${formatCurrency(item.tips)}`}
                          />
                          <div 
                            className={styles.barNet} 
                            style={{ height: `${netHeight}%` }}
                            title={`Net: ${formatCurrency(item.net)}`}
                          />
                        </div>
                        <div className={styles.barValue}>{formatCurrency(total)}</div>
                      </div>
                      <span className={styles.barLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
              
              {/* Legend */}
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-primary)' }} />
                  Net Earnings
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#22c55e' }} />
                  Tips
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#f59e0b' }} />
                  Campaigns
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Platform Breakdown */}
        <div className={styles.platformSection}>
          <h2>Earnings by Platform</h2>
          
          {stats.platformBreakdown.length === 0 ? (
            <div className={styles.emptyPlatforms}>
              <p>No platform data available</p>
            </div>
          ) : (
            <div className={styles.platformBreakdown}>
              {stats.platformBreakdown.map(platform => (
                <div key={platform.id} className={styles.platformCard}>
                  <div className={styles.platformHeader}>
                    <span className={styles.platformIcon}>{platform.icon}</span>
                    <span className={styles.platformName}>{platform.name}</span>
                  </div>
                  <div className={styles.platformAmount}>
                    {formatCurrency(platform.total)}
                  </div>
                  <div className={styles.platformBar}>
                    <div 
                      className={styles.platformProgress}
                      style={{ 
                        width: `${platform.percentage}%`,
                        background: platform.color 
                      }}
                    />
                  </div>
                  <div className={styles.platformPercentage}>
                    {platform.percentage.toFixed(1)}% of total
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total Summary */}
          <div className={styles.totalSummary}>
            <div className={styles.summaryRow}>
              <span>Total Net Earnings</span>
              <span className={styles.summaryValue}>{formatCurrency(stats.totalNet)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Total Tips</span>
              <span className={styles.summaryValue}>+{formatCurrency(stats.totalTips)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Total Campaigns</span>
              <span className={styles.summaryValue}>+{formatCurrency(stats.totalCampaigns)}</span>
            </div>
            <div className={`${styles.summaryRow} ${styles.grandTotal}`}>
              <span>Grand Total</span>
              <span className={styles.summaryValue}>
                {formatCurrency(stats.totalNet + stats.totalTips + stats.totalCampaigns)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Best Week Highlight */}
      {stats.bestWeek && (
        <div className={styles.bestWeekCard}>
          <div className={styles.bestWeekBadge}>🏆 Best Week</div>
          <div className={styles.bestWeekContent}>
            <span className={styles.bestWeekLabel}>{stats.bestWeek.week_label}</span>
            <span className={styles.bestWeekAmount}>
              {formatCurrency(
                stats.bestWeek.total_net + 
                stats.bestWeek.settlement_platforms.reduce((sum, p) => sum + p.tips + (p.campaigns || 0), 0)
              )}
            </span>
          </div>
          <div className={styles.bestWeekBreakdown}>
            {stats.bestWeek.settlement_platforms.map(p => (
              <span key={p.id} className={styles.bestWeekPlatform}>
                {getPlatformIcon(p.platform_id)} {formatCurrency(p.net)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Earnings List */}
      <div className={styles.recentSection}>
        <h2>Recent Earnings</h2>
        
        {settlements.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3>No earnings yet</h3>
            <p>Your earnings will appear here once settlements are finalized.</p>
          </div>
        ) : (
          <div className={styles.earningsList}>
            {settlements.slice(0, 8).map(settlement => {
              const tips = settlement.settlement_platforms.reduce((sum, p) => sum + p.tips, 0);
              const campaigns = settlement.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0);
              const totalEarnings = settlement.total_net + tips + campaigns;
              
              return (
                <div key={settlement.id} className={styles.earningsCard}>
                  <div className={styles.earningsHeader}>
                    <span className={styles.earningsWeek}>{settlement.week_label}</span>
                    <span className={styles.earningsTotal}>{formatCurrency(totalEarnings)}</span>
                  </div>
                  
                  <div className={styles.earningsBreakdown}>
                    <div className={styles.earningsRow}>
                      <span>Net from platforms</span>
                      <span>{formatCurrency(settlement.total_net)}</span>
                    </div>
                    {tips > 0 && (
                      <div className={styles.earningsRow}>
                        <span>Tips</span>
                        <span className={styles.positive}>+{formatCurrency(tips)}</span>
                      </div>
                    )}
                    {campaigns > 0 && (
                      <div className={styles.earningsRow}>
                        <span>Campaigns</span>
                        <span className={styles.positive}>+{formatCurrency(campaigns)}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.platformTags}>
                    {settlement.settlement_platforms.map(p => (
                      <span key={p.id} className={styles.platformTag}>
                        {getPlatformIcon(p.platform_id)} {formatCurrency(p.net)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
