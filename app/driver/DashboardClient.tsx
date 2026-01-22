'use client';

import Link from 'next/link';
import { formatCurrency, safeNumber } from '@/lib/utils/settlementCalculations';
import styles from './driver.module.css';

type NextShift = {
  assignment_date: string;
  vehicles: { registration_number: string; make: string; model: string } | null;
  rosters: { title: string; status: string } | null;
} | null;

type SettlementPlatform = {
  platform_id: string;
  platform_name: string;
  net: number;
  tips: number;
  campaigns: number;
  balance: number;
};

type Settlement = {
  id: string;
  week_start: string;
  week_label: string;
  final_balance: number;
  total_gross_fare: number;
  total_net: number;
  settlement_platforms: SettlementPlatform[];
};

function parseDateOnly(value: string): Date {
  const dateStr = value.includes('T') ? value.split('T')[0] : value;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '0.0%';
  return `${value.toFixed(1)}%`;
}

function getSettlementTotal(settlement: Settlement): number {
  const platforms = Array.isArray(settlement.settlement_platforms) ? settlement.settlement_platforms : [];
  const tips = platforms.reduce((sum, p) => sum + safeNumber(p.tips), 0);
  const campaigns = platforms.reduce((sum, p) => sum + safeNumber(p.campaigns), 0);
  return safeNumber(settlement.total_net) + tips + campaigns;
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cx = (curr.x + next.x) / 2;
    const cy = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${cx} ${cy}`;
  }

  const secondLast = points[points.length - 2];
  const last = points[points.length - 1];
  d += ` Q ${secondLast.x} ${secondLast.y} ${last.x} ${last.y}`;
  return d;
}

export default function DashboardClient(props: {
  firstName: string;
  settlements: Settlement[];
  nextShift: NextShift;
  totalShifts: number;
}) {
  const settlementsData = Array.isArray(props.settlements) ? props.settlements : [];
  const periodSettlements = settlementsData.slice(0, 8);
  const prevPeriodSettlements = settlementsData.slice(8, 16);

  const periodTotal = periodSettlements.reduce((sum, s) => sum + getSettlementTotal(s), 0);
  const prevPeriodTotal = prevPeriodSettlements.reduce((sum, s) => sum + getSettlementTotal(s), 0);
  const periodChange = prevPeriodTotal > 0 ? ((periodTotal - prevPeriodTotal) / prevPeriodTotal) * 100 : 0;

  const latestSettlement = periodSettlements[0];
  const previousSettlement = periodSettlements[1];
  const currentWeekTotal = latestSettlement ? getSettlementTotal(latestSettlement) : 0;
  const lastWeekTotal = previousSettlement ? getSettlementTotal(previousSettlement) : 0;
  const weekChange = previousSettlement && lastWeekTotal > 0 ? ((currentWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 : 0;

  const avgWeekly = periodSettlements.length > 0 ? periodTotal / periodSettlements.length : 0;

  const periodTips = periodSettlements.reduce((sum, s) => {
    const platforms = Array.isArray(s.settlement_platforms) ? s.settlement_platforms : [];
    return sum + platforms.reduce((acc, p) => acc + safeNumber(p.tips), 0);
  }, 0);

  const periodCampaigns = periodSettlements.reduce((sum, s) => {
    const platforms = Array.isArray(s.settlement_platforms) ? s.settlement_platforms : [];
    return sum + platforms.reduce((acc, p) => acc + safeNumber(p.campaigns), 0);
  }, 0);

  const tipsShare = periodTotal > 0 ? (periodTips / periodTotal) * 100 : 0;
  const campaignsShare = periodTotal > 0 ? (periodCampaigns / periodTotal) * 100 : 0;

  const bestWeek = periodSettlements.reduce<Settlement | null>((best, s) => {
    if (!best) return s;
    return getSettlementTotal(s) > getSettlementTotal(best) ? s : best;
  }, null);

  const bestWeekTotal = bestWeek ? getSettlementTotal(bestWeek) : 0;

  const totalNet = periodSettlements.reduce((sum, s) => sum + safeNumber(s.total_net), 0);
  const platformTotals = new Map<string, { name: string; total: number }>();
  periodSettlements.forEach(s => {
    const platforms = Array.isArray(s.settlement_platforms) ? s.settlement_platforms : [];
    platforms.forEach(p => {
      const key = String(p.platform_id);
      const existing = platformTotals.get(key);
      const nextTotal = (existing?.total || 0) + safeNumber(p.net);
      platformTotals.set(key, { name: String(p.platform_name || 'Platform'), total: nextTotal });
    });
  });

  const topPlatform = Array.from(platformTotals.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total)[0];

  const topPlatformShare = topPlatform && totalNet > 0 ? (topPlatform.total / totalNet) * 100 : 0;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthToDateTotal = settlementsData
    .filter(s => parseDateOnly(String(s.week_start)) >= monthStart)
    .reduce((sum, s) => sum + getSettlementTotal(s), 0);

  const chartData = periodSettlements.slice(0, 8).reverse();
  const chartTotals = chartData.map(s => getSettlementTotal(s));

  const chartWidth = 600;
  const chartHeight = 220;
  const chartBaseY = 180;
  const chartPlotHeight = 120;

  const maxEarning = Math.max(...chartTotals, 1);
  const minEarning = Math.min(...chartTotals, 0);
  const chartRange = maxEarning - minEarning || 1;

  const points = chartTotals.map((value, i) => {
    const x = chartTotals.length > 1 ? (i / (chartTotals.length - 1)) * chartWidth : chartWidth / 2;
    const y = chartBaseY - ((value - minEarning) / chartRange) * chartPlotHeight;
    return { x, y };
  });

  const linePath = buildSmoothPath(points);
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${chartBaseY} L ${points[0].x} ${chartBaseY} Z`
    : '';

  const recentSettlements = settlementsData.slice(0, 5);

  return (
    <div className={styles.dashboardShell}>
      <section className={styles.dashboardTopbar}>
        <div className={styles.dashboardTopbarLeft}>
          <span className={styles.dashboardKicker}>Welcome back</span>
          <h1 className={styles.dashboardTitle}>{props.firstName}</h1>
          <div className={styles.dashboardMeta}>
            <span>Last 8 weeks: {formatCurrency(periodTotal)}</span>
            <span className={styles.metaDot} />
            <span>MTD: {formatCurrency(monthToDateTotal)}</span>
          </div>
        </div>
        <div className={styles.dashboardTopbarRight}>
          <Link href="/driver/go-online" className={styles.dashboardPrimaryAction}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M8 5v14l11-7z" />
            </svg>
            Start Shift
          </Link>
          <Link href="/driver/earnings" className={styles.dashboardSecondaryAction}>My Earnings</Link>
        </div>
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardKicker}>Earnings trend</div>
              <div className={styles.cardValue}>{formatCurrency(periodTotal)}</div>
              <div className={styles.badgeRow}>
                {prevPeriodTotal > 0 && (
                  <span className={`${styles.badge} ${periodChange >= 0 ? styles.badgeUp : styles.badgeDown}`}>
                    vs prev {formatPct(periodChange)}
                  </span>
                )}
                {previousSettlement && lastWeekTotal > 0 && (
                  <span className={`${styles.badge} ${weekChange >= 0 ? styles.badgeUp : styles.badgeDown}`}>
                    this week {formatPct(weekChange)}
                  </span>
                )}
              </div>
            </div>
            <Link href="/driver/earnings" className={styles.cardLink}>View details →</Link>
          </div>

          {chartData.length > 1 ? (
            <div className={styles.chartWrap}>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className={styles.chart} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#dashboardArea)" />
                <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {chartData.map((d, i) => {
                  const point = points[i];
                  if (!point) return null;
                  const total = chartTotals[i] || 0;
                  return (
                    <circle
                      key={d.week_start}
                      cx={point.x}
                      cy={point.y}
                      r={i === chartData.length - 1 ? 8 : 5}
                      fill={i === chartData.length - 1 ? 'var(--color-primary)' : 'var(--bg-card)'}
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                    >
                      <title>{`${new Date(d.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • ${formatCurrency(total)}`}</title>
                    </circle>
                  );
                })}
              </svg>
              <div className={styles.chartLabels}>
                {chartData.map((d, i) => (
                  <span key={d.week_start} className={i === chartData.length - 1 ? styles.chartLabelActive : ''}>
                    {new Date(d.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>Earnings data will appear here once you have more settlements.</div>
          )}

          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Avg / week</div>
              <div className={styles.kpiValue}>{formatCurrency(avgWeekly)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Tips</div>
              <div className={styles.kpiValue}>{formatCurrency(periodTips)} ({formatPct(tipsShare)})</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Campaigns</div>
              <div className={styles.kpiValue}>{formatCurrency(periodCampaigns)} ({formatPct(campaignsShare)})</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Best week</div>
              <div className={styles.kpiValue}>{bestWeek ? formatCurrency(bestWeekTotal) : '—'}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Top platform</div>
              <div className={styles.kpiValue}>{topPlatform ? `${topPlatform.name} (${formatPct(topPlatformShare)})` : '—'}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total shifts</div>
              <div className={styles.kpiValue}>{safeNumber(props.totalShifts)}</div>
            </div>
          </div>
        </section>

        <aside className={styles.sideCol}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardKicker}>Next shift</div>
                <div className={styles.cardValueSmall}>
                  {props.nextShift
                    ? new Date(props.nextShift.assignment_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                    : 'No upcoming shift'}
                </div>
                {props.nextShift?.vehicles && (
                  <div className={styles.cardSubtext}>
                    {props.nextShift.vehicles.registration_number} • {props.nextShift.vehicles.make} {props.nextShift.vehicles.model}
                  </div>
                )}
              </div>
              <Link href="/driver/roster" className={styles.cardLink}>Roster →</Link>
            </div>
            <div className={styles.quickActions}>
              <Link href="/driver/go-online" className={styles.actionTile}>Go Online</Link>
              <Link href="/driver/shifts" className={styles.actionTile}>My Shifts</Link>
              <Link href="/driver/settlements" className={styles.actionTile}>Settlements</Link>
              <Link href="/driver/profile" className={styles.actionTile}>Profile</Link>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardKicker}>Recent settlements</div>
                <div className={styles.cardSubtext}>Latest 5 weeks</div>
              </div>
              <Link href="/driver/settlements" className={styles.cardLink}>All →</Link>
            </div>
            <div className={styles.recentList}>
              {recentSettlements.length > 0 ? recentSettlements.map(s => (
                <div key={s.id} className={styles.recentRow}>
                  <div>
                    <div className={styles.recentTitle}>{s.week_label}</div>
                    <div className={styles.recentMeta}>{new Date(s.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <div className={styles.recentValue}>{formatCurrency(getSettlementTotal(s))}</div>
                </div>
              )) : (
                <div className={styles.emptyState}>No settlements found yet.</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
