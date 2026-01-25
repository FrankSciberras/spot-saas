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

type FinancialPoint = {
  label: string;
  income: number;
  expenses: number;
  profit: number;
};

type BreakdownPoint = {
  name: string;
  value: number;
  color: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function AdminDashboardInsights(props: {
  financialSeries: FinancialPoint[];
  totals: {
    income: number;
    expenses: number;
    profit: number;
  };
  incomeBreakdown: BreakdownPoint[];
  expenseBreakdown: BreakdownPoint[];
}) {
  const financialSeries = Array.isArray(props.financialSeries) ? props.financialSeries : [];
  const incomeBreakdown = Array.isArray(props.incomeBreakdown) ? props.incomeBreakdown : [];
  const expenseBreakdown = Array.isArray(props.expenseBreakdown) ? props.expenseBreakdown : [];

  const hasData = financialSeries.length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Earnings</div>
              <div className={styles.cardSubtitle}>All time</div>
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Income</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.income)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Expenses</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.expenses)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Profit</div>
              <div className={styles.kpiValue}>{formatCurrency(props.totals.profit)}</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiLabel}>Margin</div>
              <div className={styles.kpiValue}>
                {props.totals.income > 0
                  ? `${((props.totals.profit / props.totals.income) * 100).toFixed(1)}%`
                  : '0.0%'}
              </div>
            </div>
          </div>

          {hasData ? (
            <div className={styles.chart}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={financialSeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="adminEarningsIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(var(--color-success-rgb), 0.25)" />
                      <stop offset="100%" stopColor="rgba(var(--color-success-rgb), 0.05)" />
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
                  <Area type="monotone" dataKey="income" name="Income" stroke="var(--color-success)" fill="url(#adminEarningsIncome)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="var(--color-danger)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--text-primary)" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.empty}>No bookkeeping entries yet.</div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>Breakdown</div>
              <div className={styles.cardSubtitle}>Income + expenses</div>
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
                  <Pie data={incomeBreakdown} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {incomeBreakdown.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className={styles.miniChart}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseBreakdown} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
                  <Bar dataKey="value" name="Expenses" fill="var(--color-danger)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
