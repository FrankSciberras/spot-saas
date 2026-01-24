'use client';

import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ComposedChart,
  Area,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import styles from './AdminDashboardInsights.module.css';

type EarningsPoint = {
  label: string;
  net: number;
  tips: number;
  campaigns: number;
  total: number;
};

type PlatformPoint = {
  name: string;
  value: number;
  color: string;
};

type DriverPoint = {
  name: string;
  total: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function AdminDashboardInsights(props: {
  earningsSeries: EarningsPoint[];
  totals: { total: number; net: number; tips: number; campaigns: number; settlements: number };
  platformSeries: PlatformPoint[];
  topDrivers: DriverPoint[];
}) {
  const earningsSeries = Array.isArray(props.earningsSeries) ? props.earningsSeries : [];
  const platformSeries = Array.isArray(props.platformSeries) ? props.platformSeries : [];
  const topDrivers = Array.isArray(props.topDrivers) ? props.topDrivers : [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Earnings</div>
              <div className={styles.cardSubtitle}>Last 30 days</div>
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Total</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.total)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Net</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.net)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Tips</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.tips)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Campaigns</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.campaigns)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Settlements</div>
              <div className={styles.kpiValue}>{props.totals.settlements}</div>
            </div>
          </div>

          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={earningsSeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="adminEarningsNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(var(--color-primary-rgb), 0.35)" />
                    <stop offset="100%" stopColor="rgba(var(--color-primary-rgb), 0.05)" />
                  </linearGradient>
                  <linearGradient id="adminEarningsTips" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(var(--color-success-rgb), 0.25)" />
                    <stop offset="100%" stopColor="rgba(var(--color-success-rgb), 0.05)" />
                  </linearGradient>
                  <linearGradient id="adminEarningsCampaigns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(var(--color-warning-rgb), 0.25)" />
                    <stop offset="100%" stopColor="rgba(var(--color-warning-rgb), 0.05)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
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
                <Area type="monotone" dataKey="net" name="Net" stackId="earnings" stroke="var(--color-primary)" fill="url(#adminEarningsNet)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="tips" name="Tips" stackId="earnings" stroke="var(--color-success)" fill="url(#adminEarningsTips)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="campaigns" name="Campaigns" stackId="earnings" stroke="var(--color-warning)" fill="url(#adminEarningsCampaigns)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" name="Total" stroke="var(--text-primary)" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Breakdown</div>
              <div className={styles.cardSubtitle}>Platforms + top drivers</div>
            </div>
          </div>

          <div className={styles.breakdownGrid}>
            <div className={styles.miniChart}>
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
                  <Pie data={platformSeries} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {platformSeries.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles.miniChart}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDrivers} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      boxShadow: 'var(--shadow-md)',
                    }}
                    formatter={(value: unknown) => formatCurrency(Number(value))}
                  />
                  <Bar dataKey="total" name="Top drivers" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
