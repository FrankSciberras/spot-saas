'use client';

import { type CSSProperties, useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BookkeepingPeriodWithEntries,
  VehicleRecurringCost,
} from '@/lib/types/database';
import type { FinanceCategory } from '@/lib/config/financeCategories';
import { categoriesOfKind } from '@/lib/config/financeCategories';
import {
  derivePeriodBounds,
  formatPeriodLabel,
  formatPeriodRange,
  periodsOverlap,
  prorateCost,
  daysInclusive,
  toISODate,
  type PeriodType,
} from '@/lib/utils/bookkeepingPeriods';
import FleetIcon from '@/components/fleet/FleetIcon';
import CategoryManager from './CategoryManager';
import VehicleCostsManager from './VehicleCostsManager';

interface SettlementPeriod {
  week_start: string;
  week_end: string;
  week_label: string;
  period_name: string | null;
}

export interface VehicleOption {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
}

interface EarningsWorkspaceProps {
  categories: FinanceCategory[];
  periods: BookkeepingPeriodWithEntries[];
  settlementPeriods: SettlementPeriod[];
  vehicleCosts: VehicleRecurringCost[];
  vehicles: VehicleOption[];
}

const PERIOD_TYPE_OPTIONS: { value: PeriodType; label: string; hint: string }[] = [
  { value: 'week', label: 'Weekly', hint: 'Mon – Sun' },
  { value: 'month', label: 'Monthly', hint: 'Full calendar month' },
  { value: 'custom', label: 'Custom', hint: 'Any date range' },
];

function fmtEUR(value: number): string {
  return `€${value.toFixed(2)}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function FinField({
  label, value, onChange, icon, accent, neg, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  icon?: string; accent?: string; neg?: boolean; hint?: string;
}) {
  const has = Number(value) > 0;
  const borderColor = has ? (neg ? 'rgba(240,100,100,0.3)' : 'var(--accent-line)') : 'var(--line-2)';
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
        {icon && <FleetIcon name={icon} size={12} />}
        {accent && <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', border: `1px solid ${borderColor}`, borderRadius: 7, padding: '8px 10px', gap: 6, transition: 'border-color 120ms' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>€</span>
        <input
          type="number" step="0.01" value={value} placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: has ? 'var(--text-1)' : 'var(--text-3)', fontFamily: 'Geist Mono, monospace', fontSize: 14, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}
        />
      </div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--accent)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function BkStat({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        <FleetIcon name={icon} size={11} /> {label}
      </div>
      <div className="mono tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color }}>{value}</div>
    </div>
  );
}

/** Stacked share bar + legend, used for both income and expenses. */
function ShareBar({ parts, total }: { parts: { key: string; label: string; color: string; value: number }[]; total: number }) {
  const filled = parts.filter((p) => p.value > 0);
  if (total <= 0 || filled.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', background: 'var(--bg-2)' }}>
        {filled.map((p) => (
          <div key={p.key} title={`${p.label}: ${fmtEUR(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
        {filled.map((p) => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.label} <span className="mono tnum" style={{ color: 'var(--text-1)' }}>{Math.round((p.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function EarningsWorkspace({
  categories, periods, settlementPeriods, vehicleCosts, vehicles,
}: EarningsWorkspaceProps) {
  const router = useRouter();

  const incomeCategories = useMemo(() => categoriesOfKind(categories, 'income'), [categories]);
  const expenseCategories = useMemo(() => categoriesOfKind(categories, 'expense'), [categories]);

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(periods[0]?.id ?? null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New-period draft
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [anchorDate, setAnchorDate] = useState(todayISO());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [draftName, setDraftName] = useState('');

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [prefilled, setPrefilled] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showVehicleCosts, setShowVehicleCosts] = useState(false);

  const periodsMap = useMemo(() => {
    const map = new Map<string, BookkeepingPeriodWithEntries>();
    periods.forEach((p) => map.set(p.id, p));
    return map;
  }, [periods]);

  const currentPeriod = useMemo(
    () => (selectedPeriodId ? periodsMap.get(selectedPeriodId) ?? null : null),
    [periodsMap, selectedPeriodId],
  );

  const availableSettlementPeriods = useMemo(() => {
    const taken = new Set(periods.map((p) => `${p.start_date}_${p.end_date}`));
    return settlementPeriods.filter((sp) => !taken.has(`${sp.week_start}_${sp.week_end}`));
  }, [settlementPeriods, periods]);

  // ---- Draft period bounds ------------------------------------------------
  const draftBounds = useMemo(() => {
    if (periodType === 'custom') {
      return customStart && customEnd ? { start: customStart, end: customEnd } : null;
    }
    if (!anchorDate) return null;
    return derivePeriodBounds(periodType, anchorDate);
  }, [periodType, anchorDate, customStart, customEnd]);

  // Auto-label unless the operator typed their own.
  useEffect(() => {
    if (!isCreatingNew || labelTouched || !draftBounds) return;
    setDraftLabel(formatPeriodLabel(periodType, draftBounds.start, draftBounds.end));
  }, [isCreatingNew, labelTouched, draftBounds, periodType]);

  // ---- Recurring vehicle costs prefill ------------------------------------
  const suggestedCosts = useMemo(() => {
    if (!isCreatingNew || !draftBounds) return {};
    const byCategory: Record<string, number> = {};
    for (const cost of vehicleCosts) {
      const amount = prorateCost(
        { amount: Number(cost.amount), frequency: cost.frequency, start_date: cost.start_date, end_date: cost.end_date, is_active: cost.is_active },
        draftBounds.start,
        draftBounds.end,
      );
      if (amount > 0) {
        byCategory[cost.category_id] = Math.round(((byCategory[cost.category_id] || 0) + amount) * 100) / 100;
      }
    }
    return byCategory;
  }, [isCreatingNew, draftBounds, vehicleCosts]);

  // ---- Load the selected period into the form -----------------------------
  useEffect(() => {
    setError(null);
    setSuccess(null);
    setShowDeleteConfirm(false);

    if (currentPeriod) {
      const next: Record<string, string> = {};
      for (const entry of currentPeriod.entries || []) {
        next[entry.category_id] = String(entry.amount);
      }
      setAmounts(next);
      setNotes(currentPeriod.notes || '');
      setPrefilled({});
    } else if (!isCreatingNew && !selectedPeriodId) {
      // Only clear on a genuinely empty selection. Right after saving a new
      // period the id is set but `periods` has not refreshed yet, and clearing
      // here would blank every field the operator just filled in.
      setAmounts({});
      setNotes('');
      setPrefilled({});
    }
  }, [currentPeriod, isCreatingNew, selectedPeriodId]);

  // Apply the recurring-cost suggestion whenever the draft dates change, but
  // never overwrite a figure the operator has already typed over.
  useEffect(() => {
    if (!isCreatingNew) return;
    setAmounts((prev) => {
      const next = { ...prev };
      for (const [categoryId, amount] of Object.entries(suggestedCosts)) {
        const untouched = !prev[categoryId] || Number(prev[categoryId]) === prefilled[categoryId];
        if (untouched) next[categoryId] = amount.toFixed(2);
      }
      return next;
    });
    setPrefilled(suggestedCosts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedCosts, isCreatingNew]);

  // ---- Live totals --------------------------------------------------------
  const calc = useMemo(() => {
    const num = (id: string) => parseFloat(amounts[id] || '') || 0;
    const totalIncome = incomeCategories.reduce((s, c) => s + num(c.id), 0);
    const totalExpenses = expenseCategories.reduce((s, c) => s + num(c.id), 0);
    const netProfit = totalIncome - totalExpenses;
    return {
      totalIncome,
      totalExpenses,
      netProfit,
      margin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
    };
  }, [amounts, incomeCategories, expenseCategories]);

  const setAmount = useCallback((categoryId: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [categoryId]: value }));
  }, []);

  // ---- Which period is being edited --------------------------------------
  const activeInfo = useMemo(() => {
    if (isCreatingNew) {
      if (!draftBounds) return null;
      return {
        period_type: periodType,
        start_date: draftBounds.start,
        end_date: draftBounds.end,
        label: draftLabel || formatPeriodLabel(periodType, draftBounds.start, draftBounds.end),
        name: draftName || null,
      };
    }
    if (currentPeriod) {
      return {
        period_type: currentPeriod.period_type,
        start_date: currentPeriod.start_date,
        end_date: currentPeriod.end_date,
        label: currentPeriod.label,
        name: currentPeriod.name,
      };
    }
    return null;
  }, [isCreatingNew, draftBounds, periodType, draftLabel, draftName, currentPeriod]);

  // Overlapping periods double-count in every report, so say so up front.
  const overlapWarning = useMemo(() => {
    if (!isCreatingNew || !draftBounds) return null;
    const clash = periods.find((p) =>
      periodsOverlap(draftBounds.start, draftBounds.end, p.start_date, p.end_date),
    );
    if (!clash) return null;
    if (clash.start_date === draftBounds.start && clash.end_date === draftBounds.end) {
      return `"${clash.name || clash.label}" already covers exactly these dates.`;
    }
    return `Overlaps "${clash.name || clash.label}" (${formatPeriodRange(clash.start_date, clash.end_date)}). Both would be counted in reports.`;
  }, [isCreatingNew, draftBounds, periods]);

  // ---- Actions ------------------------------------------------------------
  const startNewPeriod = (type: PeriodType = 'week') => {
    setIsCreatingNew(true);
    setSelectedPeriodId(null);
    setPeriodType(type);
    setAnchorDate(todayISO());
    setCustomStart('');
    setCustomEnd('');
    setDraftLabel('');
    setLabelTouched(false);
    setDraftName('');
    setAmounts({});
    setPrefilled({});
    setNotes('');
  };

  const selectSettlementPeriod = (period: SettlementPeriod) => {
    startNewPeriod('custom');
    setPeriodType('custom');
    setCustomStart(period.week_start.split('T')[0]);
    setCustomEnd(period.week_end.split('T')[0]);
    setDraftLabel(period.week_label);
    setLabelTouched(true);
    setDraftName(period.period_name || '');
  };

  const cancelNewPeriod = () => {
    setIsCreatingNew(false);
    setSelectedPeriodId(periods[0]?.id ?? null);
  };

  const handleSave = async () => {
    if (!activeInfo) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payloadAmounts: Record<string, number> = {};
      for (const category of [...incomeCategories, ...expenseCategories]) {
        payloadAmounts[category.id] = parseFloat(amounts[category.id] || '') || 0;
      }
      // Categories hidden since this period was saved still hold figures —
      // send them back untouched rather than silently zeroing history.
      for (const [categoryId, raw] of Object.entries(amounts)) {
        if (!(categoryId in payloadAmounts)) {
          payloadAmounts[categoryId] = parseFloat(raw || '') || 0;
        }
      }

      const payload = {
        period_type: activeInfo.period_type,
        start_date: activeInfo.start_date,
        end_date: activeInfo.end_date,
        label: activeInfo.label,
        name: activeInfo.name || null,
        notes: notes || null,
        amounts: payloadAmounts,
      };

      const url = currentPeriod ? `/api/bookkeeping/${currentPeriod.id}` : '/api/bookkeeping';
      const res = await fetch(url, {
        method: currentPeriod ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      setSuccess(`Period ${currentPeriod ? 'updated' : 'saved'} successfully!`);
      if (isCreatingNew) {
        setIsCreatingNew(false);
        setSelectedPeriodId(data?.data?.id ?? null);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPeriod) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookkeeping/${currentPeriod.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccess('Period deleted');
      setShowDeleteConfirm(false);
      setSelectedPeriodId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const showEditor = !!activeInfo || isCreatingNew;

  const incomeParts = incomeCategories.map((c) => ({
    key: c.id, label: c.name, color: c.color, value: parseFloat(amounts[c.id] || '') || 0,
  }));
  const expenseParts = expenseCategories.map((c) => ({
    key: c.id, label: c.name, color: c.color, value: parseFloat(amounts[c.id] || '') || 0,
  }));

  const draftDays = draftBounds ? daysInclusive(draftBounds.start, draftBounds.end) : 0;

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Financial / Bookkeeping</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Bookkeeping</h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Income &amp; expense tracking by week, month or custom period</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={st.ghostBtn} className="fleetHover" onClick={() => setShowVehicleCosts(true)}>
            <FleetIcon name="vehicle" size={14} /> Vehicle costs
          </button>
          <button style={st.ghostBtn} className="fleetHover" onClick={() => setShowCategories(true)}>
            <FleetIcon name="filter" size={14} /> Categories
          </button>
          {availableSettlementPeriods.length > 0 && (
            <div style={st.selectWrap}>
              <FleetIcon name="settle" size={14} />
              <select
                value=""
                onChange={(e) => {
                  const p = availableSettlementPeriods.find((x) => `${x.week_start}_${x.week_end}` === e.target.value);
                  if (p) selectSettlementPeriod(p);
                }}
                style={st.select}
              >
                <option value="">Use a settlement period…</option>
                {availableSettlementPeriods.map((p) => (
                  <option key={`${p.week_start}_${p.week_end}`} value={`${p.week_start}_${p.week_end}`}>
                    {p.week_label} ({formatPeriodRange(p.week_start, p.week_end)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button style={st.primaryBtn} className="fleetHover" onClick={() => startNewPeriod('week')}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> New period
          </button>
        </div>
      </div>

      <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT: period list */}
        <div style={st.card}>
          <div style={st.cardHeader}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Recent periods</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{periods.length} total</div>
          </div>
          <div style={{ borderTop: '1px solid var(--line-1)', maxHeight: 720, overflowY: 'auto' }}>
            {periods.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>No periods yet</div>
            )}
            {periods.slice(0, 50).map((p) => {
              const isActive = selectedPeriodId === p.id && !isCreatingNew;
              return (
                <button
                  key={p.id}
                  onClick={() => { setIsCreatingNew(false); setSelectedPeriodId(p.id); }}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: isActive ? 'var(--bg-2)' : 'transparent', border: 'none', borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`, borderBottom: '1px solid var(--line-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.label}</span>
                      {p.period_type === 'month' && <span style={st.typeChip}>M</span>}
                      {p.period_type === 'custom' && <span style={st.typeChip}>C</span>}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{formatPeriodRange(p.start_date, p.end_date)}</div>
                  </div>
                  <span className="mono tnum" style={{ fontSize: 13, fontWeight: 500, color: Number(p.net_profit) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                    {Number(p.net_profit) >= 0 ? '€' : '€-'}{Math.abs(Number(p.net_profit)).toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: editor */}
        {!showEditor ? (
          <div style={{ ...st.card, padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Select a period from the list or create a new one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div style={{ ...st.alert, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.25)' }}>{error}</div>}
            {success && <div style={{ ...st.alert, color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid rgba(62,207,142,0.25)' }}>{success}</div>}

            <div style={st.card}>
              <div style={st.periodHead}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-1)' }}>
                    {isCreatingNew ? 'New period' : (activeInfo?.name || activeInfo?.label)}
                  </div>
                  {activeInfo && (
                    <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      {formatPeriodRange(activeInfo.start_date, activeInfo.end_date)}
                      {isCreatingNew && draftDays > 0 && ` · ${draftDays} days`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isCreatingNew && <button style={st.miniBtn} onClick={cancelNewPeriod}>Cancel</button>}
                  {currentPeriod && (
                    <button style={{ ...st.miniBtn, color: 'var(--neg)', borderColor: 'rgba(240,100,100,0.25)' }} onClick={() => setShowDeleteConfirm(true)} disabled={loading}>Delete</button>
                  )}
                  <button style={st.savePrimary} className="fleetHover" onClick={handleSave} disabled={loading || !activeInfo}>
                    {loading ? 'Saving…' : currentPeriod ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>

              {showDeleteConfirm && (
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', background: 'var(--neg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)' }}>Delete this period and everything recorded in it?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ ...st.miniBtn, color: 'var(--neg)', borderColor: 'rgba(240,100,100,0.4)' }} onClick={handleDelete} disabled={loading}>Yes, delete</button>
                    <button style={st.miniBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, background: 'var(--line-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }} className="stats-row-mobile">
                <BkStat label="Total income" value={fmtEUR(calc.totalIncome)} color="var(--pos)" icon="arrow-up" />
                <BkStat label="Total expenses" value={fmtEUR(calc.totalExpenses)} color="var(--neg)" icon="arrow-down" />
                <BkStat label="Net profit" value={fmtEUR(calc.netProfit)} color={calc.netProfit >= 0 ? 'var(--pos)' : 'var(--neg)'} icon="settle" />
                <BkStat label="Margin" value={`${calc.margin.toFixed(1)}%`} color="var(--accent)" icon="chart" />
              </div>
            </div>

            {/* Period setup */}
            {isCreatingNew && (
              <div style={st.card}>
                <div style={st.cardHeader}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Period</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>How long does this set of books cover?</div>
                </div>

                <div style={{ padding: '14px 16px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PERIOD_TYPE_OPTIONS.map((opt) => {
                    const on = periodType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => { setPeriodType(opt.value); setLabelTouched(false); }}
                        style={{
                          flex: '1 1 140px', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                          background: on ? 'var(--accent-soft)' : 'var(--bg-2)',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 500, color: on ? 'var(--accent)' : 'var(--text-1)' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="grid-4">
                  {periodType === 'week' && (
                    <div>
                      <label style={st.fieldLabel}>Any date in the week</label>
                      <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} style={st.textInput} />
                    </div>
                  )}
                  {periodType === 'month' && (
                    <div>
                      <label style={st.fieldLabel}>Month</label>
                      <input
                        type="month"
                        value={anchorDate.slice(0, 7)}
                        onChange={(e) => setAnchorDate(e.target.value ? `${e.target.value}-01` : todayISO())}
                        style={st.textInput}
                      />
                    </div>
                  )}
                  {periodType === 'custom' && (
                    <>
                      <div>
                        <label style={st.fieldLabel}>Start date</label>
                        <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setLabelTouched(false); }} style={st.textInput} />
                      </div>
                      <div>
                        <label style={st.fieldLabel}>End date</label>
                        <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setLabelTouched(false); }} style={st.textInput} />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={st.fieldLabel}>Label</label>
                    <input type="text" value={draftLabel} onChange={(e) => { setDraftLabel(e.target.value); setLabelTouched(true); }} placeholder="Auto" style={st.textInput} />
                  </div>
                  <div>
                    <label style={st.fieldLabel}>Name (optional)</label>
                    <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. July accounts" style={st.textInput} />
                  </div>
                </div>

                {draftBounds && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line-1)', fontSize: 12, color: 'var(--text-3)' }}>
                    Covers <span className="mono" style={{ color: 'var(--text-1)' }}>{formatPeriodRange(draftBounds.start, draftBounds.end)}</span> — {draftDays} days
                  </div>
                )}

                {overlapWarning && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line-1)', background: 'var(--neg-soft)', color: 'var(--neg)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FleetIcon name="warning" size={13} /> {overlapWarning}
                  </div>
                )}
              </div>
            )}

            {/* Income */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Income</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{fmtEUR(calc.totalIncome)} total</div>
                  </div>
                  <button style={st.linkBtn} onClick={() => setShowCategories(true)}>+ Add category</button>
                </div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                {incomeCategories.length === 0 ? (
                  <div style={{ color: 'var(--text-3)', fontSize: 12.5 }}>No income categories. Add one to start recording.</div>
                ) : (
                  <div style={st.fieldGrid} className="grid-4">
                    {incomeCategories.map((c) => (
                      <FinField
                        key={c.id}
                        label={c.name}
                        accent={c.color}
                        value={amounts[c.id] || ''}
                        onChange={(v) => setAmount(c.id, v)}
                      />
                    ))}
                  </div>
                )}
                <ShareBar parts={incomeParts} total={calc.totalIncome} />
              </div>
            </div>

            {/* Expenses */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Expenses</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{fmtEUR(calc.totalExpenses)} total</div>
                  </div>
                  <button style={st.linkBtn} onClick={() => setShowCategories(true)}>+ Add category</button>
                </div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                {expenseCategories.length === 0 ? (
                  <div style={{ color: 'var(--text-3)', fontSize: 12.5 }}>No expense categories. Add one to start recording.</div>
                ) : (
                  <div style={st.fieldGrid} className="grid-4">
                    {expenseCategories.map((c) => (
                      <FinField
                        key={c.id}
                        label={c.name}
                        icon={c.icon}
                        neg
                        value={amounts[c.id] || ''}
                        onChange={(v) => setAmount(c.id, v)}
                        hint={prefilled[c.id] ? `Auto: ${fmtEUR(prefilled[c.id])} vehicle costs` : undefined}
                      />
                    ))}
                  </div>
                )}
                <ShareBar parts={expenseParts} total={calc.totalExpenses} />
              </div>
            </div>

            {/* Notes */}
            <div style={st.card}>
              <div style={st.cardHeader}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Notes</div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Quarterly insurance renewal, vehicle repair details, etc…"
                  style={{ width: '100%', minHeight: 80, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {currentPeriod && (
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'right' }}>
                Last updated: {new Date(currentPeriod.updated_at).toLocaleDateString('en-GB')}
              </div>
            )}
          </div>
        )}
      </div>

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
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  savePrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 },
  selectWrap: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-3)' },
  select: { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { padding: '14px 18px' },
  periodHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', gap: 12, flexWrap: 'wrap' },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  fieldLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  textInput: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 13 },
  typeChip: { fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-3)', border: '1px solid var(--line-2)', borderRadius: 3, padding: '0 3px', lineHeight: '13px' },
};
