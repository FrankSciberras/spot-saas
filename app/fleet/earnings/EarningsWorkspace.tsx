'use client';

import { type CSSProperties, useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WeeklyBookkeeping } from '@/lib/types/database';
import FleetIcon from '@/components/fleet/FleetIcon';

interface SettlementPeriod {
  week_start: string;
  week_end: string;
  week_label: string;
  period_name: string | null;
}

interface EarningsWorkspaceProps {
  entries: WeeklyBookkeeping[];
  settlementPeriods: SettlementPeriod[];
}

type IncomeKey = 'uber_earnings' | 'bolt_earnings' | 'ecabs_earnings' | 'other_earnings';
type ExpenseKey = 'employees' | 'repairs' | 'insurance' | 'investments' | 'vat' | 'rent' | 'employee_tax' | 'other_expenses';

const INCOME_FIELDS: { key: IncomeKey; label: string; color: string }[] = [
  { key: 'uber_earnings', label: 'Uber', color: '#a78bfa' },
  { key: 'bolt_earnings', label: 'Bolt', color: '#34d399' },
  { key: 'ecabs_earnings', label: 'eCabs', color: '#f5b54a' },
  { key: 'other_earnings', label: 'Other', color: '#2bbd7e' },
];

const EXPENSE_FIELDS: { key: ExpenseKey; label: string; icon: string }[] = [
  { key: 'employees', label: 'Employees', icon: 'staff' },
  { key: 'repairs', label: 'Repairs', icon: 'wrench' },
  { key: 'insurance', label: 'Insurance', icon: 'doc' },
  { key: 'investments', label: 'Investments', icon: 'chart' },
  { key: 'vat', label: 'VAT', icon: 'book' },
  { key: 'rent', label: 'Rent', icon: 'vehicle' },
  { key: 'employee_tax', label: 'Employee tax', icon: 'settle' },
  { key: 'other_expenses', label: 'Other', icon: 'dots' },
];

function fmtEUR(value: number): string {
  return `€${value.toFixed(2)}`;
}

function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatDateInput(dateStr: string): string {
  return dateStr.split('T')[0];
}

function FinField({ label, value, onChange, icon, accent, neg }: { label: string; value: string; onChange: (v: string) => void; icon?: string; accent?: string; neg?: boolean }) {
  const has = Number(value) > 0;
  const borderColor = has ? (neg ? 'rgba(240,100,100,0.3)' : 'var(--accent-line)') : 'var(--line-2)';
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
        {icon && <FleetIcon name={icon} size={12} />}
        {accent && <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} />}
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)', border: `1px solid ${borderColor}`, borderRadius: 7, padding: '8px 10px', gap: 6, transition: 'border-color 120ms' }}>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>€</span>
        <input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: has ? 'var(--text-1)' : 'var(--text-3)', fontFamily: 'Geist Mono, monospace', fontSize: 14, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }} />
      </div>
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

export default function EarningsWorkspace({ entries, settlementPeriods }: EarningsWorkspaceProps) {
  const router = useRouter();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    entries.length > 0 ? `${entries[0].week_start}_${entries[0].week_end}` : null
  );
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newWeekStart, setNewWeekStart] = useState('');
  const [newWeekEnd, setNewWeekEnd] = useState('');
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newPeriodName, setNewPeriodName] = useState('');
  const [formData, setFormData] = useState({
    uber_earnings: '', bolt_earnings: '', ecabs_earnings: '', other_earnings: '',
    employees: '', repairs: '', insurance: '', investments: '', vat: '', rent: '', employee_tax: '', other_expenses: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const entriesMap = useMemo(() => {
    const map = new Map<string, WeeklyBookkeeping>();
    entries.forEach((e) => map.set(`${e.week_start}_${e.week_end}`, e));
    return map;
  }, [entries]);

  const currentEntry = useMemo(() => (selectedPeriodId ? entriesMap.get(selectedPeriodId) || null : null), [entriesMap, selectedPeriodId]);

  const availableSettlementPeriods = useMemo(() =>
    settlementPeriods.filter((sp) => !entriesMap.has(`${sp.week_start}_${sp.week_end}`)),
  [settlementPeriods, entriesMap]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setShowDeleteConfirm(false);
    if (currentEntry) {
      setFormData({
        uber_earnings: currentEntry.uber_earnings.toString(),
        bolt_earnings: currentEntry.bolt_earnings.toString(),
        ecabs_earnings: currentEntry.ecabs_earnings.toString(),
        other_earnings: currentEntry.other_earnings.toString(),
        employees: currentEntry.employees.toString(),
        repairs: currentEntry.repairs.toString(),
        insurance: currentEntry.insurance.toString(),
        investments: currentEntry.investments.toString(),
        vat: currentEntry.vat.toString(),
        rent: currentEntry.rent.toString(),
        employee_tax: currentEntry.employee_tax.toString(),
        other_expenses: currentEntry.other_expenses.toString(),
        notes: currentEntry.notes || '',
      });
    } else {
      setFormData({ uber_earnings: '', bolt_earnings: '', ecabs_earnings: '', other_earnings: '', employees: '', repairs: '', insurance: '', investments: '', vat: '', rent: '', employee_tax: '', other_expenses: '', notes: '' });
    }
  }, [currentEntry, selectedPeriodId]);

  const calc = useMemo(() => {
    const num = (v: string) => parseFloat(v) || 0;
    const totalIncome = INCOME_FIELDS.reduce((s, f) => s + num(formData[f.key]), 0);
    const totalExpenses = EXPENSE_FIELDS.reduce((s, f) => s + num(formData[f.key]), 0);
    const netProfit = totalIncome - totalExpenses;
    const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
    return { totalIncome, totalExpenses, netProfit, margin };
  }, [formData]);

  const handleChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const currentPeriodInfo = useMemo(() => {
    if (isCreatingNew && newWeekStart && newWeekEnd) {
      return { week_start: newWeekStart, week_end: newWeekEnd, week_label: newWeekLabel || `${formatDateDisplay(newWeekStart)} - ${formatDateDisplay(newWeekEnd)}`, period_name: newPeriodName || null };
    }
    if (currentEntry) {
      return { week_start: currentEntry.week_start, week_end: currentEntry.week_end, week_label: currentEntry.week_label, period_name: currentEntry.period_name };
    }
    return null;
  }, [isCreatingNew, newWeekStart, newWeekEnd, newWeekLabel, newPeriodName, currentEntry]);

  const selectSettlementPeriod = (period: SettlementPeriod) => {
    setIsCreatingNew(true);
    setNewWeekStart(formatDateInput(period.week_start));
    setNewWeekEnd(formatDateInput(period.week_end));
    setNewWeekLabel(period.week_label);
    setNewPeriodName(period.period_name || '');
    setSelectedPeriodId(null);
  };

  const startNewPeriod = () => {
    setIsCreatingNew(true);
    setNewWeekStart(''); setNewWeekEnd(''); setNewWeekLabel(''); setNewPeriodName('');
    setSelectedPeriodId(null);
  };

  const cancelNewPeriod = () => {
    setIsCreatingNew(false);
    setNewWeekStart(''); setNewWeekEnd(''); setNewWeekLabel(''); setNewPeriodName('');
    if (entries.length > 0) setSelectedPeriodId(`${entries[0].week_start}_${entries[0].week_end}`);
  };

  const handleSave = async () => {
    if (!currentPeriodInfo) return;
    setLoading(true); setError(null); setSuccess(null);
    try {
      const weekLabel = currentPeriodInfo.week_label || `${formatDateDisplay(currentPeriodInfo.week_start)} - ${formatDateDisplay(currentPeriodInfo.week_end)}`;
      const num = (v: string) => parseFloat(v) || 0;
      const payload = {
        week_start: currentPeriodInfo.week_start,
        week_end: currentPeriodInfo.week_end,
        week_label: weekLabel,
        period_name: currentPeriodInfo.period_name || null,
        uber_earnings: num(formData.uber_earnings),
        bolt_earnings: num(formData.bolt_earnings),
        ecabs_earnings: num(formData.ecabs_earnings),
        other_earnings: num(formData.other_earnings),
        employees: num(formData.employees),
        repairs: num(formData.repairs),
        insurance: num(formData.insurance),
        investments: num(formData.investments),
        vat: num(formData.vat),
        rent: num(formData.rent),
        employee_tax: num(formData.employee_tax),
        other_expenses: num(formData.other_expenses),
        notes: formData.notes || null,
      };
      const url = currentEntry ? `/api/bookkeeping/${currentEntry.id}` : '/api/bookkeeping';
      const method = currentEntry ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setSuccess(`Entry ${currentEntry ? 'updated' : 'saved'} successfully!`);
      if (isCreatingNew) {
        setIsCreatingNew(false);
        setSelectedPeriodId(`${currentPeriodInfo.week_start}_${currentPeriodInfo.week_end}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!currentEntry) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/bookkeeping/${currentEntry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccess('Entry deleted');
      setShowDeleteConfirm(false);
      setSelectedPeriodId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const showEditor = !!currentPeriodInfo || isCreatingNew;
  const income = calc.totalIncome;

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Financial / Bookkeeping</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Weekly bookkeeping</h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Manual income &amp; expense tracking by period</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {availableSettlementPeriods.length > 0 && (
            <div style={st.selectWrap}>
              <FleetIcon name="settle" size={14} />
              <select value="" onChange={(e) => { const p = availableSettlementPeriods.find((x) => `${x.week_start}_${x.week_end}` === e.target.value); if (p) selectSettlementPeriod(p); }} style={st.select}>
                <option value="">Import settlements…</option>
                {availableSettlementPeriods.map((p) => (
                  <option key={`${p.week_start}_${p.week_end}`} value={`${p.week_start}_${p.week_end}`}>
                    {p.week_label} ({formatDateDisplay(p.week_start)} - {formatDateDisplay(p.week_end)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button style={st.primaryBtn} className="fleetHover" onClick={startNewPeriod}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> New period
          </button>
        </div>
      </div>

      <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT: period list */}
        <div style={st.card}>
          <div style={st.cardHeader}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Recent entries</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{entries.length} periods</div>
          </div>
          <div style={{ borderTop: '1px solid var(--line-1)', maxHeight: 720, overflowY: 'auto' }}>
            {entries.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>No entries yet</div>}
            {entries.slice(0, 30).map((p) => {
              const isActive = selectedPeriodId === `${p.week_start}_${p.week_end}` && !isCreatingNew;
              return (
                <button key={p.id} onClick={() => { setIsCreatingNew(false); setSelectedPeriodId(`${p.week_start}_${p.week_end}`); }}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: isActive ? 'var(--bg-2)' : 'transparent', border: 'none', borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`, borderBottom: '1px solid var(--line-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{p.period_name || p.week_label}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{formatDateDisplay(p.week_start)} - {formatDateDisplay(p.week_end)}</div>
                  </div>
                  <span className="mono tnum" style={{ fontSize: 13, fontWeight: 500, color: p.net_profit >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{p.net_profit >= 0 ? '€' : '€-'}{Math.abs(p.net_profit).toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: editor */}
        {!showEditor ? (
          <div style={{ ...st.card, padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Select an entry from the list or create a new period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <div style={{ ...st.alert, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.25)' }}>{error}</div>}
            {success && <div style={{ ...st.alert, color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid rgba(62,207,142,0.25)' }}>{success}</div>}

            <div style={st.card}>
              <div style={st.periodHead}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-1)' }}>{isCreatingNew ? 'New entry' : (currentPeriodInfo?.period_name || currentPeriodInfo?.week_label)}</div>
                  {currentPeriodInfo && <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{formatDateDisplay(currentPeriodInfo.week_start)} - {formatDateDisplay(currentPeriodInfo.week_end)}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isCreatingNew && <button style={st.miniBtn} onClick={cancelNewPeriod}>Cancel</button>}
                  {currentEntry && <button style={{ ...st.miniBtn, color: 'var(--neg)', borderColor: 'rgba(240,100,100,0.25)' }} onClick={() => setShowDeleteConfirm(true)} disabled={loading}>Delete</button>}
                  <button style={st.savePrimary} className="fleetHover" onClick={handleSave} disabled={loading || (isCreatingNew && (!newWeekStart || !newWeekEnd))}>{loading ? 'Saving…' : currentEntry ? 'Update' : 'Save'}</button>
                </div>
              </div>

              {showDeleteConfirm && (
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', background: 'var(--neg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-1)' }}>Delete this entry?</span>
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

            {isCreatingNew && (
              <div style={st.card}>
                <div style={st.cardHeader}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Period dates</div>
                </div>
                <div style={{ padding: 16, borderTop: '1px solid var(--line-1)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="grid-4">
                  <div><label style={st.fieldLabel}>Start date</label><input type="date" value={newWeekStart} onChange={(e) => setNewWeekStart(e.target.value)} style={st.textInput} /></div>
                  <div><label style={st.fieldLabel}>End date</label><input type="date" value={newWeekEnd} onChange={(e) => setNewWeekEnd(e.target.value)} style={st.textInput} /></div>
                  <div><label style={st.fieldLabel}>Label</label><input type="text" value={newWeekLabel} onChange={(e) => setNewWeekLabel(e.target.value)} placeholder="Week 1" style={st.textInput} /></div>
                  <div><label style={st.fieldLabel}>Period name</label><input type="text" value={newPeriodName} onChange={(e) => setNewPeriodName(e.target.value)} placeholder="January Week 1" style={st.textInput} /></div>
                </div>
              </div>
            )}

            <div style={st.card}>
              <div style={st.cardHeader}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Income — platform earnings</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{fmtEUR(calc.totalIncome)} total</div>
                </div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                <div style={st.fieldGrid} className="grid-4">
                  {INCOME_FIELDS.map((f) => (
                    <FinField key={f.key} label={f.label} value={formData[f.key]} onChange={(v) => handleChange(f.key, v)} accent={f.color} />
                  ))}
                </div>
                {income > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden', background: 'var(--bg-2)' }}>
                      {INCOME_FIELDS.map((f) => {
                        const v = parseFloat(formData[f.key]) || 0;
                        if (!v) return null;
                        return <div key={f.key} title={`${f.label}: ${fmtEUR(v)}`} style={{ width: `${(v / income) * 100}%`, background: f.color }} />;
                      })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                      {INCOME_FIELDS.filter((f) => (parseFloat(formData[f.key]) || 0) > 0).map((f) => (
                        <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color }} />
                          {f.label} <span className="mono tnum" style={{ color: 'var(--text-1)' }}>{Math.round(((parseFloat(formData[f.key]) || 0) / income) * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Expenses</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{fmtEUR(calc.totalExpenses)} total</div>
                </div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                <div style={st.fieldGrid} className="grid-4">
                  {EXPENSE_FIELDS.map((f) => (
                    <FinField key={f.key} label={f.label} icon={f.icon} value={formData[f.key]} onChange={(v) => handleChange(f.key, v)} neg />
                  ))}
                </div>
              </div>
            </div>

            <div style={st.card}>
              <div style={st.cardHeader}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Notes</div>
              </div>
              <div style={{ padding: 16, borderTop: '1px solid var(--line-1)' }}>
                <textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="e.g. Quarterly insurance renewal, vehicle repair details, etc…"
                  style={{ width: '100%', minHeight: 80, padding: 12, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {currentEntry && <div style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'right' }}>Last updated: {new Date(currentEntry.updated_at).toLocaleDateString('en-GB')}</div>}
          </div>
        )}
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px', gap: 12 },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  savePrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  selectWrap: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-3)' },
  select: { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { padding: '14px 18px' },
  periodHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', gap: 12, flexWrap: 'wrap' },
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
  fieldLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  textInput: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 13 },
};
