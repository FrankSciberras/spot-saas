'use client';

// =============================================================================
// LEDGER WORKSPACE — the Bookkeeping page
// =============================================================================
// Replaces the period sheet (open a week → type twelve totals → save). The
// books are now a running list of dated transactions, the way Xero, Wave and
// QuickBooks show them: pick a range (today, this week, last 4 weeks, this
// month…), see income / expenses / net for it with a comparison to the range
// before, and scroll the lines grouped by day. Adding a line is one tap and
// goes straight in on today's date — nothing has to wait for the week to end.
// =============================================================================

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { FinanceTransaction, VehicleRecurringCost } from '@/lib/types/database';
import { categoriesOfKind, type CategoryKind, type FinanceCategory } from '@/lib/config/financeCategories';
import {
  RANGE_PRESETS,
  type RangePreset,
  type DateRange,
  resolvePreset,
  previousRange,
  inRange,
  todayISO,
  formatDayHeading,
  formatRange,
  formatDateLong,
  fmtEUR,
} from '@/lib/utils/financeRanges';
import { nextDueDate } from '@/lib/bookkeeping/recurring';
import { describeFrequency } from '@/lib/utils/bookkeepingPeriods';
import FleetIcon from '@/components/fleet/FleetIcon';
import CategoryManager from './CategoryManager';
import VehicleCostsManager from './VehicleCostsManager';
import TransactionModal, { type VehicleOption, type DriverOption } from './TransactionModal';

interface LedgerWorkspaceProps {
  categories: FinanceCategory[];
  /** Newest first. */
  transactions: FinanceTransaction[];
  vehicleCosts: VehicleRecurringCost[];
  vehicles: VehicleOption[];
  drivers: DriverOption[];
  /** Open the add form straight away (from the topbar "New" menu / dashboard). */
  initialAdd?: CategoryKind | null;
}

type KindFilter = 'all' | CategoryKind;

interface ModalState {
  kind: CategoryKind;
  txn?: FinanceTransaction;
  date?: string;
}

const PAGE_SIZE = 120;

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', bank: 'Bank', other: 'Other' };

function Stat({ label, value, color, icon, delta }: { label: string; value: string; color: string; icon: string; delta?: { text: string; dir: 'up' | 'down' | 'flat' } | null }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-1)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        <FleetIcon name={icon} size={11} /> {label}
      </div>
      <div className="mono tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {delta && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {delta.dir !== 'flat' && <FleetIcon name={delta.dir === 'up' ? 'arrow-up' : 'arrow-down'} size={10} />}
          {delta.text}
        </div>
      )}
    </div>
  );
}

/** Stacked share bar + legend. */
function ShareBar({ parts, total }: { parts: { key: string; label: string; color: string; value: number }[]; total: number }) {
  const filled = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  if (total <= 0 || filled.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Nothing yet in this range.</div>;
  return (
    <div>
      <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', background: 'var(--bg-2)' }}>
        {filled.map((p) => (
          <div key={p.key} title={`${p.label}: ${fmtEUR(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {filled.slice(0, 7).map((p) => (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
            <span className="mono tnum" style={{ color: 'var(--text-1)' }}>{fmtEUR(p.value)}</span>
            <span className="mono tnum" style={{ color: 'var(--text-3)', width: 34, textAlign: 'right' }}>{Math.round((p.value / total) * 100)}%</span>
          </div>
        ))}
        {filled.length > 7 && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>+{filled.length - 7} more</div>}
      </div>
    </div>
  );
}

function deltaFor(current: number, previous: number, hasPrevious: boolean): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (!hasPrevious) return null;
  if (previous === 0 && current === 0) return { text: 'no change vs previous', dir: 'flat' };
  if (previous === 0) return { text: 'new vs previous', dir: 'up' };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { text: 'level with previous', dir: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs previous`, dir: pct > 0 ? 'up' : 'down' };
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function LedgerWorkspace({
  categories, transactions, vehicleCosts, vehicles, drivers, initialAdd = null,
}: LedgerWorkspaceProps) {
  const today = todayISO();

  const [preset, setPreset] = useState<RangePreset>('month');
  const [customStart, setCustomStart] = useState(today.slice(0, 8) + '01');
  const [customEnd, setCustomEnd] = useState(today);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  // "Show more" count, tied to the filters it was clicked under: change any
  // filter and the list starts from the first page again.
  const filterKey = [preset, customStart, customEnd, kindFilter, categoryFilter, search].join('|');
  const [visibleState, setVisibleState] = useState({ key: filterKey, count: PAGE_SIZE });
  const visible = visibleState.key === filterKey ? visibleState.count : PAGE_SIZE;

  const [modal, setModal] = useState<ModalState | null>(initialAdd ? { kind: initialAdd } : null);
  const [showCategories, setShowCategories] = useState(false);
  const [showVehicleCosts, setShowVehicleCosts] = useState(false);

  // Opened from ?add=expense — drop the param so a refresh doesn't reopen it.
  // history.replaceState is integrated with the Next router and, unlike
  // router.replace, does not refetch the page.
  useEffect(() => {
    if (initialAdd) window.history.replaceState(null, '', '/fleet/earnings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryById = useMemo(() => {
    const m = new Map<string, FinanceCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  const incomeCategories = useMemo(() => categoriesOfKind(categories, 'income', { includeInactive: true }), [categories]);
  const expenseCategories = useMemo(() => categoriesOfKind(categories, 'expense', { includeInactive: true }), [categories]);

  // ---- Range -----------------------------------------------------------------
  const range: DateRange | null = useMemo(() => {
    if (preset === 'custom') {
      return customStart && customEnd && customStart <= customEnd ? { start: customStart, end: customEnd } : null;
    }
    return resolvePreset(preset, today);
  }, [preset, customStart, customEnd, today]);

  const kindOf = (t: FinanceTransaction): CategoryKind => categoryById.get(t.category_id)?.kind ?? 'expense';

  const inRangeTxns = useMemo(() => transactions.filter((t) => inRange(t.txn_date, range)), [transactions, range]);

  const sum = (list: FinanceTransaction[]) => {
    let income = 0;
    let expenses = 0;
    for (const t of list) {
      const a = Number(t.amount) || 0;
      if (kindOf(t) === 'income') income += a; else expenses += a;
    }
    return { income, expenses, net: income - expenses, count: list.length };
  };

  const totals = useMemo(() => sum(inRangeTxns), [inRangeTxns]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevTotals = useMemo(() => {
    if (!range) return null;
    const prev = previousRange(range);
    return sum(transactions.filter((t) => inRange(t.txn_date, prev)));
  }, [range, transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const breakdown = useMemo(() => {
    const income = new Map<string, number>();
    const expenses = new Map<string, number>();
    for (const t of inRangeTxns) {
      const target = kindOf(t) === 'income' ? income : expenses;
      target.set(t.category_id, (target.get(t.category_id) || 0) + (Number(t.amount) || 0));
    }
    const toParts = (map: Map<string, number>) => Array.from(map.entries()).map(([id, value]) => {
      const c = categoryById.get(id);
      return { key: id, label: c?.name ?? 'Unknown', color: c?.color ?? '#94a3b8', value };
    });
    return { income: toParts(income), expenses: toParts(expenses) };
  }, [inRangeTxns, categoryById]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- List filters ------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inRangeTxns.filter((t) => {
      if (kindFilter !== 'all' && kindOf(t) !== kindFilter) return false;
      if (categoryFilter && t.category_id !== categoryFilter) return false;
      if (q) {
        const c = categoryById.get(t.category_id);
        const v = t.vehicle_id ? vehicleById.get(t.vehicle_id) : null;
        const d = t.driver_id ? driverById.get(t.driver_id) : null;
        const hay = [t.description, t.counterparty, c?.name, v?.registration_number, v?.make, v?.model, d?.full_name, String(t.amount)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inRangeTxns, kindFilter, categoryFilter, search, categoryById, vehicleById, driverById]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const out: { date: string; items: FinanceTransaction[]; net: number }[] = [];
    let current: { date: string; items: FinanceTransaction[]; net: number } | null = null;
    for (const t of filtered.slice(0, visible)) {
      const day = t.txn_date.split('T')[0];
      if (!current || current.date !== day) {
        current = { date: day, items: [], net: 0 };
        out.push(current);
      }
      current.items.push(t);
      current.net += kindOf(t) === 'income' ? Number(t.amount) : -Number(t.amount);
    }
    return out;
  }, [filtered, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Upcoming recurring costs -----------------------------------------------
  const upcoming = useMemo(() => {
    return vehicleCosts
      .map((c) => ({ cost: c, due: nextDueDate(c) }))
      .filter((x): x is { cost: VehicleRecurringCost; due: string } => !!x.due)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);
  }, [vehicleCosts]);

  // ---- Export -------------------------------------------------------------------
  const exportCsv = () => {
    const header = ['Date', 'Type', 'Category', 'Description', 'Paid to / from', 'Vehicle', 'Driver', 'Method', 'Amount'];
    const rows = filtered.map((t) => {
      const c = categoryById.get(t.category_id);
      const v = t.vehicle_id ? vehicleById.get(t.vehicle_id) : null;
      const d = t.driver_id ? driverById.get(t.driver_id) : null;
      const signed = (c?.kind === 'income' ? 1 : -1) * Number(t.amount);
      return [t.txn_date, c?.kind === 'income' ? 'Income' : 'Expense', c?.name ?? '', t.description ?? '', t.counterparty ?? '', v?.registration_number ?? '', d?.full_name ?? '', METHOD_LABEL[t.payment_method] ?? t.payment_method, signed.toFixed(2)];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${range ? `${range.start}_to_${range.end}` : 'all'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const rangeLabel = range ? formatRange(range) : 'All time';
  const presetMeta = RANGE_PRESETS.find((p) => p.value === preset);
  const noBooksYet = transactions.length === 0;
  const margin = totals.income > 0 ? (totals.net / totals.income) * 100 : 0;

  return (
    <>
      {/* Header */}
      <div style={st.header} className="header-mobile-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Financial / Bookkeeping</div>
          <div style={st.titleRow}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Bookkeeping</h1>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={st.ghostBtn} className="fleetHover" onClick={() => setShowVehicleCosts(true)}>
                <FleetIcon name="vehicle" size={14} /> Recurring costs
              </button>
              <button style={st.ghostBtn} className="fleetHover" onClick={() => setShowCategories(true)}>
                <FleetIcon name="filter" size={14} /> Categories
              </button>
              <button style={st.ghostBtn} className="fleetHover" onClick={exportCsv} disabled={filtered.length === 0} title="Download what's listed as a CSV for your accountant">
                <FleetIcon name="download" size={14} /> CSV
              </button>
              <button style={{ ...st.ghostBtn, color: 'var(--pos)', border: '1px solid rgba(62,207,142,0.35)' }} className="fleetHover" onClick={() => setModal({ kind: 'income' })}>
                <FleetIcon name="plus" size={14} stroke={2.2} /> Income
              </button>
              <button style={st.primaryBtn} className="fleetHover" onClick={() => setModal({ kind: 'expense' })}>
                <FleetIcon name="plus" size={14} stroke={2.2} /> Add expense
              </button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            Record each expense or payout on the day it happens — weekly, monthly and 4-week totals are worked out for you.
          </div>
        </div>
      </div>

      {/* Range */}
      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} className="chips-scroll">
            {RANGE_PRESETS.map((p) => {
              const on = preset === p.value;
              return (
                <button key={p.value} onClick={() => setPreset(p.value)} title={p.hint} style={{ ...st.chip, ...(on ? st.chipOn : {}), flexShrink: 0 }}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <FleetIcon name="calendar" size={13} />
            <span className="mono" style={{ color: 'var(--text-1)' }}>{rangeLabel}</span>
            <span>· {totals.count} {totals.count === 1 ? 'line' : 'lines'}</span>
          </div>
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0 16px 14px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)' }}>From</label>
            <input type="date" value={customStart} max={customEnd || undefined} onChange={(e) => setCustomStart(e.target.value)} style={{ ...st.textInput, width: 'auto' }} />
            <label style={{ fontSize: 12, color: 'var(--text-3)' }}>to</label>
            <input type="date" value={customEnd} min={customStart || undefined} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...st.textInput, width: 'auto' }} />
            {customStart && customEnd && customStart > customEnd && <span style={{ fontSize: 12, color: 'var(--neg)' }}>End date is before the start date.</span>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ ...st.card, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, background: 'var(--line-1)' }} className="stats-row-mobile">
          <Stat label="Income" value={fmtEUR(totals.income)} color="var(--pos)" icon="arrow-up" delta={deltaFor(totals.income, prevTotals?.income ?? 0, !!prevTotals)} />
          <Stat label="Expenses" value={fmtEUR(totals.expenses)} color="var(--neg)" icon="arrow-down" delta={deltaFor(totals.expenses, prevTotals?.expenses ?? 0, !!prevTotals)} />
          <Stat label="Net" value={fmtEUR(totals.net)} color={totals.net >= 0 ? 'var(--pos)' : 'var(--neg)'} icon="settle" delta={prevTotals ? { text: `${fmtEUR(prevTotals.net)} previous`, dir: 'flat' } : null} />
          <Stat label="Margin" value={totals.income > 0 ? `${margin.toFixed(1)}%` : '—'} color="var(--accent)" icon="chart" delta={presetMeta && preset !== 'all' && preset !== 'custom' ? { text: presetMeta.hint, dir: 'flat' } : null} />
        </div>
      </div>

      <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
        {/* MAIN: the ledger */}
        <div style={st.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: 2 }}>
              {([['all', 'All'], ['income', 'Income'], ['expense', 'Expenses']] as [KindFilter, string][]).map(([v, label]) => {
                const on = kindFilter === v;
                return (
                  <button key={v} onClick={() => setKindFilter(v)} style={{ padding: '5px 11px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, background: on ? 'var(--bg-0)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>
                    {label}
                  </button>
                );
              })}
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ ...st.textInput, width: 'auto', padding: '6px 8px', fontSize: 12.5 }}>
              <option value="">All categories</option>
              {(kindFilter !== 'expense') && incomeCategories.length > 0 && (
                <optgroup label="Income">
                  {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )}
              {(kindFilter !== 'income') && expenseCategories.length > 0 && (
                <optgroup label="Expenses">
                  {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              )}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 160px', minWidth: 140, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '6px 9px' }}>
              <FleetIcon name="search" size={13} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, car, driver…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12.5 }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, display: 'inline-flex' }} aria-label="Clear search"><FleetIcon name="close" size={12} /></button>}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--line-1)' }}>
            {noBooksYet ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <FleetIcon name="book" size={22} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>Your books, one line at a time</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.5 }}>
                  Spent €20 on a car wash today? Add it now and it lands on today&apos;s date. Uber paid out on Monday? Add it as income. Totals for any week, month or pay cycle are worked out from the lines.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button style={st.primaryBtn} className="fleetHover" onClick={() => setModal({ kind: 'expense' })}><FleetIcon name="plus" size={14} stroke={2.2} /> Add an expense</button>
                  <button style={{ ...st.ghostBtn, color: 'var(--pos)' }} className="fleetHover" onClick={() => setModal({ kind: 'income' })}><FleetIcon name="plus" size={14} stroke={2.2} /> Add income</button>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                {search || categoryFilter || kindFilter !== 'all'
                  ? 'Nothing matches those filters in this range.'
                  : <>Nothing recorded {range ? `between ${formatRange(range)}` : 'yet'}.</>}
                <div style={{ marginTop: 12 }}>
                  <button style={st.ghostBtn} className="fleetHover" onClick={() => setModal({ kind: 'expense', date: range && range.end < today ? range.end : today })}>
                    <FleetIcon name="plus" size={13} stroke={2.2} /> Add an expense{range && range.end < today ? ` on ${formatDateLong(range.end)}` : ''}
                  </button>
                </div>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.date}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)', fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    <span>{formatDayHeading(g.date, today)}{(g.date === today || formatDayHeading(g.date, today) === 'Yesterday') && <span style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>· {formatDateLong(g.date)}</span>}</span>
                    <span className="mono tnum" style={{ color: g.net >= 0 ? 'var(--pos)' : 'var(--neg)', textTransform: 'none', letterSpacing: 0 }}>{g.net >= 0 ? '+' : ''}{fmtEUR(g.net)}</span>
                  </div>
                  {g.items.map((t) => {
                    const c = categoryById.get(t.category_id);
                    const isIncome = c?.kind === 'income';
                    const v = t.vehicle_id ? vehicleById.get(t.vehicle_id) : null;
                    const d = t.driver_id ? driverById.get(t.driver_id) : null;
                    const meta: string[] = [];
                    if (t.description && c) meta.push(c.name);
                    // "Uber · Uber" reads as a bug — skip the payee when it just repeats the category.
                    if (t.counterparty && t.counterparty.trim().toLowerCase() !== (c?.name ?? '').toLowerCase()) meta.push(t.counterparty);
                    if (v) meta.push(v.registration_number);
                    if (d) meta.push(d.full_name);
                    meta.push(METHOD_LABEL[t.payment_method] ?? t.payment_method);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setModal({ kind: isIncome ? 'income' : 'expense', txn: t })}
                        className="fleetLedgerRow"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                      >
                        <span style={{ width: 32, height: 32, borderRadius: 8, background: `${c?.color ?? '#94a3b8'}22`, color: c?.color ?? '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FleetIcon name={c?.icon ?? 'dots'} size={15} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || c?.name || 'Transaction'}</span>
                            {t.source === 'recurring' && <span style={st.badge} title="Posted automatically from a recurring cost">Auto</span>}
                            {t.source === 'period_import' && <span style={st.badge} title="Imported from the old period-based books">Imported</span>}
                            {t.receipt_path && <FleetIcon name="doc" size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                          </span>
                          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.join(' · ')}</span>
                        </span>
                        <span className="mono tnum" style={{ fontSize: 14, fontWeight: 500, color: isIncome ? 'var(--pos)' : 'var(--text-1)', flexShrink: 0 }}>
                          {isIncome ? '+' : '−'}{fmtEUR(Number(t.amount))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
            {filtered.length > visible && (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <button style={st.ghostBtn} className="fleetHover" onClick={() => setVisibleState({ key: filterKey, count: visible + PAGE_SIZE })}>
                  Show more ({filtered.length - visible} left)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SIDE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={st.card}>
            <div style={st.cardHeader}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Where the money went</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Expenses · {rangeLabel}</div>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <ShareBar parts={breakdown.expenses} total={totals.expenses} />
            </div>
          </div>

          <div style={st.card}>
            <div style={st.cardHeader}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Where it came from</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Income · {rangeLabel}</div>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <ShareBar parts={breakdown.income} total={totals.income} />
            </div>
          </div>

          <div style={st.card}>
            <div style={{ ...st.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Coming up</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Recurring costs post themselves on the due date</div>
              </div>
              <button style={st.linkBtn} onClick={() => setShowVehicleCosts(true)}>Manage</button>
            </div>
            <div style={{ borderTop: '1px solid var(--line-1)' }}>
              {upcoming.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-3)' }}>
                  No recurring costs set up. Add a lease, insurance or road-tax payment once and it books itself every time it falls due.
                </div>
              ) : upcoming.map(({ cost, due }) => {
                const v = cost.vehicle_id ? vehicleById.get(cost.vehicle_id) : null;
                const c = categoryById.get(cost.category_id);
                return (
                  <div key={cost.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--line-1)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c?.color ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cost.label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{v ? `${v.registration_number} · ` : ''}{describeFrequency(Number(cost.amount), cost.frequency)}</span>
                    </span>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', flexShrink: 0 }}>{formatDayHeading(due, today)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile floating add button */}
      <button
        className="show-mobile-only fleetHover"
        onClick={() => setModal({ kind: 'expense' })}
        aria-label="Add expense"
        style={{ position: 'fixed', right: 18, bottom: 22, width: 54, height: 54, borderRadius: 27, background: 'var(--accent)', color: '#fff', border: 'none', boxShadow: '0 6px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 50 }}
      >
        <FleetIcon name="plus" size={24} stroke={2.2} />
      </button>

      {modal && (
        <TransactionModal
          categories={categories}
          vehicles={vehicles}
          drivers={drivers}
          initialKind={modal.kind}
          initialDate={modal.date}
          transaction={modal.txn ?? null}
          onClose={() => setModal(null)}
          onManageCategories={() => setShowCategories(true)}
        />
      )}
      {showCategories && (
        <CategoryManager categories={categories} onClose={() => setShowCategories(false)} />
      )}
      {showVehicleCosts && (
        <VehicleCostsManager
          costs={vehicleCosts}
          categories={categories}
          vehicles={vehicles}
          onClose={() => setShowVehicleCosts(false)}
        />
      )}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px', gap: 12 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 14, rowGap: 10, flexWrap: 'wrap', justifyContent: 'space-between' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { padding: '14px 16px' },
  textInput: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  chip: { padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' },
  chipOn: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text-1)' },
  badge: { fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', border: '1px solid var(--line-2)', borderRadius: 3, padding: '0 4px', lineHeight: '14px', flexShrink: 0 },
};
