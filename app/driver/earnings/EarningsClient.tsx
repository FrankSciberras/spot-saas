'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
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
type WeekRange = 1 | 4 | 'all' | 'single';

const WEEK_RANGES: { value: WeekRange; label: string }[] = [
  { value: 1, label: 'Last Week' },
  { value: 4, label: 'Last 4 Weeks' },
  { value: 'all', label: 'All Time' },
  { value: 'single', label: 'Specific Week' },
];

function parseDateOnly(value: string): Date {
  const dateStr = value.includes('T') ? value.split('T')[0] : value;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getSettlementTotal(s: SettlementWithPlatforms): number {
  const tips = s.settlement_platforms.reduce((sum, p) => sum + p.tips, 0);
  const campaigns = s.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0);
  return s.total_net + tips + campaigns;
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '0.0%';
  return `${value.toFixed(1)}%`;
}

export default function EarningsClient({ settlements: allSettlements, driverName }: EarningsClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [weekRange, setWeekRange] = useState<WeekRange>(4);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);

  // Filter settlements based on selected week range
  const settlements = useMemo(() => {
    if (weekRange === 'single' && selectedWeekId) {
      const found = allSettlements.find(s => s.id === selectedWeekId);
      return found ? [found] : [];
    }
    if (weekRange === 'all') return allSettlements;
    return allSettlements.slice(0, weekRange as number);
  }, [allSettlements, weekRange, selectedWeekId]);

  // Handle week range change
  const handleWeekRangeChange = (range: WeekRange) => {
    setWeekRange(range);
    if (range === 'single' && allSettlements.length > 0 && !selectedWeekId) {
      setSelectedWeekId(allSettlements[0].id);
    }
  };

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
    const weeklyData = settlements.slice(0, Math.min(settlements.length, 16)).reverse().map(s => {
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
      const month = parseDateOnly(String(s.week_start)).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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
      avgWeeklyEarnings: settlements.length > 0 ? (totalNet + totalTips + totalCampaigns) / settlements.length : 0,
      bestWeek,
      platformBreakdown,
      weeklyData,
      monthlyData,
    };
  }, [settlements]);

  // Get current period earnings
  const currentWeek = settlements[0];
  const lastWeek = settlements[1];
  const currentWeekTotal = currentWeek ? getSettlementTotal(currentWeek) : 0;
  const lastWeekTotal = lastWeek ? getSettlementTotal(lastWeek) : 0;
  const weekChange = currentWeek && lastWeek && lastWeekTotal > 0
    ? ((currentWeekTotal - lastWeekTotal) / lastWeekTotal) * 100
    : 0;

  // Get platform icon
  const getPlatformIcon = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId)?.icon || '📊';
  };

  // Chart max for scaling
  const chartData = viewMode === 'weekly' ? stats.weeklyData : stats.monthlyData;

  // Calculate growth trend (comparing first half to second half of period)
  const growthTrend = useMemo(() => {
    if (settlements.length < 4) return 0;

    const getTotal = (s: SettlementWithPlatforms) => {
      const tips = s.settlement_platforms.reduce((sum, p) => sum + p.tips, 0);
      const campaigns = s.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0);
      return s.total_net + tips + campaigns;
    };

    const half = Math.floor(settlements.length / 2);
    const recentHalf = settlements.slice(0, half);
    const olderHalf = settlements.slice(half);
    const recentAvg = recentHalf.reduce((sum, s) => sum + getTotal(s), 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((sum, s) => sum + getTotal(s), 0) / olderHalf.length;
    return olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  }, [settlements]);

  const periodTotal = stats.totalNet + stats.totalTips + stats.totalCampaigns;

  const comparison = useMemo(() => {
    if (allSettlements.length === 0) return { previousTotal: 0, deltaPct: 0, hasPrevious: false };

    const sumTotal = (items: SettlementWithPlatforms[]) =>
      items.reduce((sum, s) => sum + getSettlementTotal(s), 0);

    if (weekRange === 'single' && selectedWeekId) {
      const idx = allSettlements.findIndex(s => s.id === selectedWeekId);
      const prev = idx >= 0 ? allSettlements[idx + 1] : undefined;
      if (!prev) return { previousTotal: 0, deltaPct: 0, hasPrevious: false };
      const current = sumTotal(settlements);
      const previous = sumTotal([prev]);
      const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
      return { previousTotal: previous, deltaPct, hasPrevious: true };
    }

    if (weekRange === 'all') {
      return { previousTotal: 0, deltaPct: 0, hasPrevious: false };
    }

    const n = weekRange as number;
    const currentSlice = allSettlements.slice(0, n);
    const previousSlice = allSettlements.slice(n, n * 2);
    if (previousSlice.length === 0) return { previousTotal: 0, deltaPct: 0, hasPrevious: false };
    const current = sumTotal(currentSlice);
    const previous = sumTotal(previousSlice);
    const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    return { previousTotal: previous, deltaPct, hasPrevious: true };
  }, [allSettlements, periodTotal, settlements, selectedWeekId, weekRange]);

  const tipsShare = periodTotal > 0 ? (stats.totalTips / periodTotal) * 100 : 0;
  const campaignsShare = periodTotal > 0 ? (stats.totalCampaigns / periodTotal) * 100 : 0;

  const topPlatform = useMemo(() => {
    if (stats.platformBreakdown.length === 0) return null;
    return [...stats.platformBreakdown].sort((a, b) => b.total - a.total)[0];
  }, [stats.platformBreakdown]);

  const trendSeries = useMemo(() => {
    return (chartData as Array<{ label: string; net: number; tips: number; campaigns: number }>).map((item) => ({
      label: item.label,
      net: item.net,
      tips: item.tips,
      campaigns: item.campaigns,
      total: item.net + item.tips + item.campaigns,
    }));
  }, [chartData]);

  const trendMax = useMemo(() => {
    return Math.max(...trendSeries.map((s) => s.total), 1);
  }, [trendSeries]);

  const platformPieData = useMemo(() => {
    return stats.platformBreakdown.map((p) => ({
      name: p.name,
      value: p.total,
      color: p.color,
    }));
  }, [stats.platformBreakdown]);

  return (
    <div className={styles.container}>
      {/* Week Range Selector */}
      <div className={styles.periodSelector}>
        <span className={styles.periodLabel}>Show earnings for:</span>
        <div className={styles.periodButtons}>
          {WEEK_RANGES.map(range => (
            <button
              key={range.value}
              className={`${styles.periodBtn} ${weekRange === range.value ? styles.active : ''}`}
              onClick={() => handleWeekRangeChange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
        
        {/* Specific Week Dropdown */}
        {weekRange === 'single' && allSettlements.length > 0 && (
          <select
            className={styles.weekSelect}
            value={selectedWeekId || ''}
            onChange={(e) => setSelectedWeekId(e.target.value)}
          >
            {allSettlements.map(s => (
              <option key={s.id} value={s.id}>
                {s.week_label} — {formatCurrency(s.total_net)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary Banner */}
      <div className={styles.summaryBanner}>
        <div className={styles.summaryMain}>
          <span className={styles.summaryLabel}>Total Earnings</span>
          <span className={styles.summaryAmount}>
            {formatCurrency(periodTotal)}
          </span>
          <span className={styles.summaryPeriod}>
            {weekRange === 'all'
              ? 'all time'
              : `from ${settlements.length} week${settlements.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className={styles.trendBadges}>
          {comparison.hasPrevious && (
            <div className={`${styles.trendBadge} ${comparison.deltaPct >= 0 ? styles.positive : styles.negative}`}>
              {comparison.deltaPct >= 0 ? '↑' : '↓'} {formatPct(Math.abs(comparison.deltaPct))} vs prev
            </div>
          )}
          {growthTrend !== 0 && (
            <div className={`${styles.trendBadge} ${growthTrend >= 0 ? styles.positive : styles.negative}`}>
              {growthTrend >= 0 ? '↑' : '↓'} {formatPct(Math.abs(growthTrend))} trend
            </div>
          )}
        </div>
      </div>

      {/* Header Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Latest Week</span>
            <span className={styles.statValue}>
              {currentWeek ? formatCurrency(currentWeekTotal) : '€0.00'}
            </span>
            {weekChange !== 0 && (
              <span className={`${styles.statChange} ${weekChange >= 0 ? styles.positive : styles.negative}`}>
                {weekChange >= 0 ? '↑' : '↓'} {formatPct(Math.abs(weekChange))}
              </span>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M7 15l4-4 3 3 6-6" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Avg / Week</span>
            <span className={styles.statValue}>{formatCurrency(stats.avgWeeklyEarnings)}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Tips</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalTips)}</span>
            <span className={styles.statChange}>{formatPct(tipsShare)} of total</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Campaigns</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalCampaigns)}</span>
            <span className={styles.statChange}>{formatPct(campaignsShare)} of total</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M7 4h10" />
              <path d="M17 4a5 5 0 0 1-10 0" />
              <path d="M5 9h14" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Best Week</span>
            <span className={styles.statValue}>
              {stats.bestWeek ? formatCurrency(getSettlementTotal(stats.bestWeek)) : '—'}
            </span>
            <span className={styles.statChange}>{stats.bestWeek ? stats.bestWeek.week_label : 'no data yet'}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="M8 17V9" />
              <path d="M12 17V7" />
              <path d="M16 17v-5" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Top Platform</span>
            <span className={styles.statValue}>{topPlatform ? topPlatform.name : '—'}</span>
            <span className={styles.statChange}>{topPlatform ? formatPct(topPlatform.percentage) : 'no platform data'}</span>
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
              <div className={styles.trendChart}>
                <div className={styles.trendMeta}>
                  <span className={styles.trendMetaLabel}>Peak</span>
                  <span className={styles.trendMetaValue}>{formatCurrency(trendMax)}</span>
                </div>

                <div className={styles.trendCanvas}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trendSeries} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="driverEarningsNet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(var(--color-primary-rgb), 0.45)" />
                          <stop offset="100%" stopColor="rgba(var(--color-primary-rgb), 0.06)" />
                        </linearGradient>
                        <linearGradient id="driverEarningsTips" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(var(--color-success-rgb), 0.35)" />
                          <stop offset="100%" stopColor="rgba(var(--color-success-rgb), 0.06)" />
                        </linearGradient>
                        <linearGradient id="driverEarningsCampaigns" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(var(--color-warning-rgb), 0.35)" />
                          <stop offset="100%" stopColor="rgba(var(--color-warning-rgb), 0.06)" />
                        </linearGradient>
                      </defs>

                      <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 12,
                          boxShadow: 'var(--shadow-md)',
                        }}
                        formatter={(value: unknown) => formatCurrency(Number(value))}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />

                      <Area
                        type="monotone"
                        dataKey="net"
                        name="Net"
                        stackId="earnings"
                        stroke="var(--color-primary)"
                        fill="url(#driverEarningsNet)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="tips"
                        name="Tips"
                        stackId="earnings"
                        stroke="var(--color-success)"
                        fill="url(#driverEarningsTips)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="campaigns"
                        name="Campaigns"
                        stackId="earnings"
                        stroke="var(--color-warning)"
                        fill="url(#driverEarningsCampaigns)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total"
                        stroke="var(--text-primary)"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              {/* Legend */}
              <div className={styles.chartLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: 'var(--color-primary)' }} />
                  Total earnings (net + tips + campaigns)
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
            <>
              <div className={styles.platformChart}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrency(Number(value))}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Pie
                      data={platformPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {platformPieData.map((p) => (
                        <Cell key={p.name} fill={p.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

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
            </>
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
