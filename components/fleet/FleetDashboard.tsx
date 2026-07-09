'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import FleetIcon from './FleetIcon';
import GettingStartedCard, { type OnboardingState } from './GettingStartedCard';
import {
  fmtEUR,
  EarningsLineChart,
  ProfitDonut,
  ExpenseBars,
  Sparkline,
  UtilRing,
  type EarningsDatum,
  type ExpenseDatum,
} from './FleetCharts';

export interface DashStats {
  activeDrivers: number;
  totalDrivers: number;
  activeVehicles: number;
  idleVehicles: number;
  serviceVehicles: number;
  totalVehicles: number;
  recentShiftsCount: number;
}

export interface ExpiringDoc {
  kind: 'driver' | 'vehicle';
  subject: string;
  doc: string;
  expires: string;
  daysLeft: number;
  href: string;
}

export interface RecentShift {
  id: string;
  name: string;
  vehicle: string | null;
  clockIn: string;
  date: string;
}

interface FleetDashboardProps {
  userName: string;
  isAdmin: boolean;
  stats: DashStats;
  financialSeries: EarningsDatum[];
  totals: { income: number; expenses: number; profit: number };
  expenseBreakdown: ExpenseDatum[];
  expiringDocs: ExpiringDoc[];
  recentShifts: RecentShift[];
  /** Getting-started checklist state (admin only). Omitted → card not shown. */
  onboarding?: OnboardingState;
}

export default function FleetDashboard({
  userName,
  isAdmin,
  stats,
  financialSeries,
  totals,
  expenseBreakdown,
  expiringDocs,
  recentShifts,
  onboarding,
}: FleetDashboardProps) {
  return (
    <>
      {isAdmin && onboarding && <GettingStartedCard state={onboarding} />}

      <HeroStrip userName={userName} stats={stats} totals={totals} financialSeries={financialSeries} isAdmin={isAdmin} />

      {isAdmin && financialSeries.length > 0 && (
        <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, marginBottom: 16 }}>
          <EarningsPanel data={financialSeries} totals={totals} />
          <ExpiringDocsCard docs={expiringDocs} />
        </div>
      )}

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <FleetStatusCard stats={stats} />
        <RecentShiftsCard shifts={recentShifts} />
        {(!isAdmin || financialSeries.length === 0) ? <ExpiringDocsCard docs={expiringDocs} /> : <QuickActionsCard />}
      </div>

      {isAdmin && financialSeries.length > 0 && (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 24 }}>
          <ExpenseBreakdownCard totals={totals} data={expenseBreakdown} />
          <QuickActionsCard />
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Hero strip ───────────────────────── */
function HeroStrip({
  userName,
  stats,
  totals,
  financialSeries,
  isAdmin,
}: {
  userName: string;
  stats: DashStats;
  totals: { income: number; expenses: number; profit: number };
  financialSeries: EarningsDatum[];
  isAdmin: boolean;
}) {
  const [greeting, setGreeting] = useState('Hello');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  const spark = financialSeries.slice(-8).map((s) => ({ v: s.income }));
  const lastIncome = financialSeries.at(-1)?.income ?? 0;
  const prevIncome = financialSeries.at(-2)?.income ?? 0;
  const incomeDelta = prevIncome > 0 ? ((lastIncome - prevIncome) / prevIncome) * 100 : null;

  return (
    <div style={st.heroWrap}>
      <div className="header-mobile-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>{greeting}, {userName}.</div>
          <div className="hero-h1-mobile" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em' }}>
            {stats.activeDrivers > 0 ? (
              <>Your fleet is <span style={{ color: 'var(--pos)' }}>up and running</span> today.</>
            ) : (
              <>No drivers active right now.</>
            )}
          </div>
        </div>
      </div>

      <div style={st.heroGrid} className="grid-4">
        <HeroTile
          label="Active drivers"
          value={`${stats.activeDrivers}`}
          suffix={`/ ${stats.totalDrivers}`}
          accent="var(--accent)"
          delta={<><FleetIcon name="live" size={10} /> live</>}
          deltaDir="neutral"
          deltaLabel="on shift now"
        />
        <HeroTile
          label="Active vehicles"
          value={`${stats.activeVehicles}`}
          suffix={`/ ${stats.totalVehicles}`}
          accent="var(--pos)"
          delta={`${stats.idleVehicles} idle`}
          deltaDir="neutral"
          deltaLabel={`${stats.serviceVehicles} in service`}
        />
        {isAdmin && financialSeries.length > 0 ? (
          <HeroTile
            label="Income (period)"
            value={fmtEUR(totals.income, { decimals: 0, compact: true })}
            accent="var(--pos)"
            delta={incomeDelta !== null ? `${incomeDelta >= 0 ? '+' : ''}${incomeDelta.toFixed(0)}%` : '—'}
            deltaDir={incomeDelta !== null ? (incomeDelta >= 0 ? 'up' : 'down') : 'neutral'}
            deltaLabel="vs prev week"
            spark={spark.length > 1 ? <Sparkline data={spark} color="#3ecf8e" w={140} h={36} /> : undefined}
          />
        ) : (
          <HeroTile
            label="Recent shifts"
            value={`${stats.recentShiftsCount}`}
            accent="var(--accent)"
            delta="latest"
            deltaDir="neutral"
            deltaLabel="logged shifts"
          />
        )}
        {isAdmin && financialSeries.length > 0 ? (
          <HeroTile
            label="Net profit (period)"
            value={fmtEUR(totals.profit, { decimals: 0, compact: true })}
            accent={totals.profit >= 0 ? 'var(--pos)' : 'var(--neg)'}
            delta={totals.income > 0 ? `${((totals.profit / totals.income) * 100).toFixed(0)}%` : '—'}
            deltaDir={totals.profit >= 0 ? 'up' : 'down'}
            deltaLabel="margin"
          />
        ) : (
          <HeroTile
            label="Total fleet"
            value={`${stats.totalVehicles}`}
            accent="var(--warn)"
            delta={`${stats.activeVehicles} active`}
            deltaDir="neutral"
            deltaLabel="vehicles"
          />
        )}
      </div>
    </div>
  );
}

function HeroTile({
  label,
  value,
  suffix,
  delta,
  deltaDir,
  deltaLabel,
  accent,
  spark,
}: {
  label: string;
  value: string;
  suffix?: string;
  delta?: ReactNode;
  deltaDir?: 'up' | 'down' | 'neutral';
  deltaLabel?: string;
  accent: string;
  spark?: ReactNode;
}) {
  return (
    <div style={st.heroTile}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 28, height: 2, background: accent, borderRadius: '0 0 2px 0' }} />
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="mono tnum" style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{value}</span>
        {suffix && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{suffix}</span>}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {delta != null && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11.5, padding: '2px 6px', borderRadius: 4,
              background: deltaDir === 'up' ? 'var(--pos-soft)' : deltaDir === 'down' ? 'var(--neg-soft)' : 'var(--bg-3)',
              color: deltaDir === 'up' ? 'var(--pos)' : deltaDir === 'down' ? 'var(--neg)' : 'var(--text-2)',
              fontFamily: 'Geist Mono, monospace',
            }}>
              {deltaDir === 'up' && <FleetIcon name="arrow-up" size={10} stroke={2.4} />}
              {deltaDir === 'down' && <FleetIcon name="arrow-down" size={10} stroke={2.4} />}
              {delta}
            </span>
          )}
          {deltaLabel && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{deltaLabel}</span>}
        </div>
        {spark}
      </div>
    </div>
  );
}

/* ───────────────────────── Earnings panel ───────────────────────── */
function EarningsPanel({ data, totals }: { data: EarningsDatum[]; totals: { income: number; expenses: number; profit: number } }) {
  const margin = totals.income > 0 ? (totals.profit / totals.income) * 100 : 0;
  return (
    <Card>
      <CardHeader title="Earnings" subtitle="Income, expenses, profit" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <MiniStat label="Income" value={fmtEUR(totals.income, { decimals: 0 })} color="var(--pos)" />
        <MiniStat label="Expenses" value={fmtEUR(totals.expenses, { decimals: 0 })} color="var(--neg)" />
        <MiniStat label="Profit" value={fmtEUR(totals.profit, { decimals: 0 })} color="var(--accent)" />
        <MiniStat label="Margin" value={margin.toFixed(1) + '%'} color="var(--text-1)" noPipe />
      </div>
      <div style={{ padding: '18px 18px 4px' }}>
        <EarningsLineChart data={data} />
        <div style={{ display: 'flex', gap: 18, fontSize: 11.5, color: 'var(--text-3)', justifyContent: 'center', padding: '8px 0 2px' }}>
          <LegendDot color="#3ecf8e" label="Income" />
          <LegendDot color="#f06464" label="Expenses" />
          <LegendDot color="#2bbd7e" label="Profit" dashed />
        </div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value, color, noPipe }: { label: string; value: string; color: string; noPipe?: boolean }) {
  return (
    <div style={{ padding: '14px 18px', borderRight: noPipe ? 'none' : '1px solid var(--line-1)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <span className="mono tnum" style={{ fontSize: 20, fontWeight: 500, color, letterSpacing: '-0.01em' }}>{value}</span>
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 14, height: 2,
        background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` : color,
        borderRadius: 1,
      }} />
      {label}
    </span>
  );
}

/* ───────────────────────── Fleet status ───────────────────────── */
function FleetStatusCard({ stats }: { stats: DashStats }) {
  const util = stats.totalVehicles > 0 ? stats.activeVehicles / stats.totalVehicles : 0;
  return (
    <Card>
      <CardHeader
        title="Fleet"
        subtitle={`${stats.totalVehicles} vehicles · ${Math.round(util * 100)}% active`}
        right={<Link href="/fleet/vehicles" style={st.linkBtn} className="fleetHover">Manage <FleetIcon name="arrow-right" size={11} /></Link>}
      />
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 18, borderTop: '1px solid var(--line-1)' }}>
        <UtilRing value={util} size={84} stroke={8} color="#2bbd7e" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
          <FleetStatRow label="Active" count={stats.activeVehicles} color="var(--pos)" />
          <FleetStatRow label="Idle" count={stats.idleVehicles} color="var(--text-3)" />
          <FleetStatRow label="In service" count={stats.serviceVehicles} color="var(--warn)" />
        </div>
      </div>
    </Card>
  );
}

function FleetStatRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
      <span style={{ color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />
        {label}
      </span>
      <span className="mono tnum" style={{ color: 'var(--text-1)', fontWeight: 500 }}>{count}</span>
    </div>
  );
}

/* ───────────────────────── Recent shifts ───────────────────────── */
function RecentShiftsCard({ shifts }: { shifts: RecentShift[] }) {
  return (
    <Card>
      <CardHeader
        title="Recent shifts"
        subtitle={`${shifts.length} most recent`}
        right={<Link href="/fleet/shifts" style={st.linkBtn} className="fleetHover">All shifts <FleetIcon name="arrow-right" size={11} /></Link>}
      />
      <div style={{ borderTop: '1px solid var(--line-1)' }}>
        {shifts.length === 0 ? (
          <EmptyRow text="No shifts logged yet." />
        ) : (
          shifts.map((s) => (
            <div key={s.id} style={st.row}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <Avatar name={s.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.vehicle ? `${s.vehicle} · ` : ''}in @ {s.clockIn}</div>
                </div>
              </div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{s.date}</div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Expiring docs ───────────────────────── */
function ExpiringDocsCard({ docs }: { docs: ExpiringDoc[] }) {
  const sev = (d: number): { color: string; soft: string } =>
    d < 0 ? { color: 'var(--neg)', soft: 'var(--neg-soft)' }
    : d <= 7 ? { color: 'var(--neg)', soft: 'var(--neg-soft)' }
    : d <= 30 ? { color: 'var(--warn)', soft: 'var(--warn-soft)' }
    : { color: 'var(--text-3)', soft: 'var(--bg-3)' };

  return (
    <Card>
      <CardHeader
        title="Expiring soon"
        subtitle="Documents needing renewal"
        right={<Link href="/fleet/reminders" style={st.linkBtn} className="fleetHover">All reminders <FleetIcon name="arrow-right" size={11} /></Link>}
      />
      <div style={{ borderTop: '1px solid var(--line-1)' }}>
        {docs.length === 0 ? (
          <EmptyRow text="Nothing expiring in the next 30 days. All good." />
        ) : (
          docs.map((d, i) => {
            const s = sev(d.daysLeft);
            return (
              <div key={i} style={st.row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: s.soft, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FleetIcon name={d.kind === 'vehicle' ? 'vehicle' : 'driver'} size={14} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.subject}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{d.doc} · <span className="mono">{d.expires}</span></div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: s.soft, color: s.color }}>
                    {d.daysLeft < 0 ? `${Math.abs(d.daysLeft)}d overdue` : `${d.daysLeft}d`}
                  </span>
                  <Link href={d.href} style={st.miniBtn} className="fleetHover">Renew</Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Expense breakdown ───────────────────────── */
function ExpenseBreakdownCard({ totals, data }: { totals: { income: number; expenses: number }; data: ExpenseDatum[] }) {
  return (
    <Card>
      <CardHeader title="Breakdown" subtitle="Income vs expense composition" />
      <div className="donut-grid" style={{ padding: '18px', borderTop: '1px solid var(--line-1)', display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <ProfitDonut income={totals.income} expenses={totals.expenses} size={160} />
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-3)' }}>
            <LegendDot color="#3ecf8e" label="Income" />
            <LegendDot color="#f06464" label="Expenses" />
          </div>
        </div>
        {data.length > 0 ? <ExpenseBars data={data} /> : <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No expenses recorded.</div>}
      </div>
    </Card>
  );
}

/* ───────────────────────── Quick actions ───────────────────────── */
function QuickActionsCard() {
  const actions = [
    { label: 'Add driver', href: '/fleet/drivers/new', icon: 'driver' },
    { label: 'Add vehicle', href: '/fleet/vehicles/new', icon: 'vehicle' },
    { label: 'Manage rosters', href: '/fleet/rosters', icon: 'roster' },
    { label: 'View shifts', href: '/fleet/shifts', icon: 'shift' },
  ];
  return (
    <Card>
      <CardHeader title="Quick actions" subtitle="Common tasks" />
      <div style={{ padding: 18, borderTop: '1px solid var(--line-1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {actions.map((a) => (
          <Link key={a.href} href={a.href} style={st.quickAction} className="fleetHover">
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <FleetIcon name={a.icon} size={16} />
            </span>
            {a.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ───────────────────────── Primitives ───────────────────────── */
function Card({ children }: { children: ReactNode }) {
  return <div style={st.card}>{children}</div>;
}

function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: string; right?: ReactNode }) {
  return (
    <div style={st.cardHeader}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
  const colors = ['#2bbd7e', '#3ecf8e', '#f5b54a', '#f06464', '#a78bfa', '#22d3ee'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 7,
      background: `linear-gradient(135deg, ${color}, ${color}99)`,
      color: '#0a0c11', fontSize: size * 0.4, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{initials}</div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: '20px 18px', fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center' }}>{text}</div>;
}

const st: Record<string, CSSProperties> = {
  heroWrap: { padding: '24px 0 16px' },
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  heroTile: { position: 'relative', padding: '16px 16px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' },
  linkBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, padding: '4px 6px', borderRadius: 5, textDecoration: 'none' },
  row: { padding: '11px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-1)', gap: 12 },
  miniBtn: { padding: '4px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 5, color: 'var(--text-1)', fontSize: 11.5, textDecoration: 'none' },
  quickAction: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, fontWeight: 500, textDecoration: 'none' },
};
