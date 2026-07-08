'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
} from 'recharts';
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

export default function DashboardClient(props: {
  firstName: string;
  settlements: Settlement[];
  nextShift: NextShift;
  totalShifts: number;
  hasActiveShift: boolean;
}) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');

  const handleEndShift = async () => {
    if (ending) return;
    setEnding(true);
    setEndError('');
    try {
      // Stop background location in the app (no-op in a plain browser).
      const native = (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView;
      if (native) native.postMessage(JSON.stringify({ type: 'stop-tracking' }));

      const res = await fetch('/api/shifts/end', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Could not end shift.');
      }
      router.refresh();
    } catch (e) {
      setEndError(e instanceof Error ? e.message : 'Could not end shift.');
    } finally {
      setEnding(false);
    }
  };

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
  const earningsSeries = chartData.map((s) => {
    const platforms = Array.isArray(s.settlement_platforms) ? s.settlement_platforms : [];
    const net = safeNumber(s.total_net);
    const tips = platforms.reduce((sum, p) => sum + safeNumber(p.tips), 0);
    const campaigns = platforms.reduce((sum, p) => sum + safeNumber(p.campaigns), 0);
    const total = net + tips + campaigns;
    const label = new Date(s.week_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return {
      label,
      week_label: s.week_label,
      net,
      tips,
      campaigns,
      total,
    };
  });

  const recentSettlements = settlementsData.slice(0, 5);

  return (
    <div className={styles.dashboardShell}>
      <section className={styles.dashboardTopbar}>
        <div className={styles.dashboardTopbarLeft}>
          <span className={styles.dashboardKicker}>Welcome back</span>
          <h1 className={styles.dashboardTitle}>{props.firstName}</h1>
          <div className={styles.dashboardMeta}>
            {props.hasActiveShift && (
              <>
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● On shift — sharing location</span>
                <span className={styles.metaDot} />
              </>
            )}
            <span>Last 8 weeks: {formatCurrency(periodTotal)}</span>
            <span className={styles.metaDot} />
            <span>MTD: {formatCurrency(monthToDateTotal)}</span>
          </div>
        </div>
        <div className={styles.dashboardTopbarRight}>
          {props.hasActiveShift ? (
            <button
              type="button"
              onClick={handleEndShift}
              disabled={ending}
              className={styles.dashboardPrimaryAction}
              style={{ background: 'var(--color-danger)', border: 'none', cursor: ending ? 'wait' : 'pointer' }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              {ending ? 'Ending…' : 'End Shift'}
            </button>
          ) : (
            <Link href="/driver/go-online" className={styles.dashboardPrimaryAction}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start Shift
            </Link>
          )}
          <Link href="/driver/earnings" className={styles.dashboardSecondaryAction}>My Earnings</Link>
          {endError && (
            <span style={{ color: 'var(--color-danger)', fontSize: 12, alignSelf: 'center' }}>{endError}</span>
          )}
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
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={earningsSeries} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="driverDashboardNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(var(--color-primary-rgb), 0.45)" />
                        <stop offset="100%" stopColor="rgba(var(--color-primary-rgb), 0.05)" />
                      </linearGradient>
                      <linearGradient id="driverDashboardTips" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(var(--color-success-rgb), 0.35)" />
                        <stop offset="100%" stopColor="rgba(var(--color-success-rgb), 0.05)" />
                      </linearGradient>
                      <linearGradient id="driverDashboardCampaigns" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(var(--color-warning-rgb), 0.35)" />
                        <stop offset="100%" stopColor="rgba(var(--color-warning-rgb), 0.05)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      labelFormatter={(_, payload) => (payload?.[0] as any)?.payload?.week_label ?? ''}
                      formatter={(value: unknown) => formatCurrency(Number(value))}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stackId="earnings"
                      stroke="var(--color-primary)"
                      fill="url(#driverDashboardNet)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="tips"
                      name="Tips"
                      stackId="earnings"
                      stroke="var(--color-success)"
                      fill="url(#driverDashboardTips)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="campaigns"
                      name="Campaigns"
                      stackId="earnings"
                      stroke="var(--color-warning)"
                      fill="url(#driverDashboardCampaigns)"
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
              <Link href="/driver/go-online" className={styles.actionTile}>Start Shift</Link>
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
