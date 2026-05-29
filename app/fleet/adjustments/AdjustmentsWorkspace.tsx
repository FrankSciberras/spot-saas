'use client';

import { type CSSProperties, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverAdjustment, AdjustmentType } from '@/lib/types/database';
import FleetIcon from '@/components/fleet/FleetIcon';

interface DriverBasic {
  id: string;
  full_name: string;
  status: string;
}

interface AdjustmentWithDriver extends DriverAdjustment {
  drivers: { id: string; full_name: string } | null;
}

interface AdjustmentsWorkspaceProps {
  drivers: DriverBasic[];
  adjustments: AdjustmentWithDriver[];
  isAdmin: boolean;
}

const TYPE_META: Record<AdjustmentType, { label: string; icon: string; sign: -1 | 0 | 1 }> = {
  expense: { label: 'Expense', icon: 'damage', sign: -1 },
  deduction: { label: 'Deduction', icon: 'arrow-down', sign: -1 },
  bonus: { label: 'Bonus', icon: 'chart', sign: 1 },
  reimbursement: { label: 'Reimbursement', icon: 'arrow-up', sign: 1 },
  other: { label: 'Other', icon: 'doc', sign: 0 },
};

const TYPE_ORDER: AdjustmentType[] = ['expense', 'bonus', 'deduction', 'reimbursement', 'other'];

const PALETTE = ['#5b8dff', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function fmtEUR(n: number, decimals = 2): string {
  return `€${n.toLocaleString('en-IE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function monthKey(date: string): string {
  return (date || '').slice(0, 7);
}

function monthLabel(key: string): string {
  if (!key) return 'Undated';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function dateLabel(date: string): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function AdjustmentsWorkspace({ drivers, adjustments, isAdmin }: AdjustmentsWorkspaceProps) {
  const router = useRouter();

  const [filterDriver, setFilterDriver] = useState('all');
  const [filterType, setFilterType] = useState('all'); // all | expenses | compensation
  const [filterTypeExact, setFilterTypeExact] = useState('all');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AdjustmentWithDriver | null>(null);

  const [formDriverId, setFormDriverId] = useState('');
  const [formType, setFormType] = useState<AdjustmentType>('expense');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedAmount = (a: AdjustmentWithDriver) => TYPE_META[a.type].sign * a.amount;

  const filtered = useMemo(() => {
    return adjustments.filter((a) => {
      if (filterDriver !== 'all' && a.driver_id !== filterDriver) return false;
      if (filterTypeExact !== 'all' && a.type !== filterTypeExact) return false;
      if (filterType === 'expenses' && TYPE_META[a.type].sign >= 0) return false;
      if (filterType === 'compensation' && TYPE_META[a.type].sign <= 0) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${a.description} ${a.drivers?.full_name || ''} ${a.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [adjustments, filterDriver, filterType, filterTypeExact, search]);

  const stats = useMemo(() => {
    let expenses = 0;
    let compensation = 0;
    let net = 0;
    for (const a of adjustments) {
      const sign = TYPE_META[a.type].sign;
      if (sign < 0) expenses += a.amount;
      else if (sign > 0) compensation += a.amount;
      net += sign * a.amount;
    }
    return { expenses, compensation, net, count: adjustments.length };
  }, [adjustments]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdjustmentWithDriver[]>();
    for (const a of filtered) {
      const k = monthKey(a.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return Array.from(map.entries()).sort((x, y) => y[0].localeCompare(x[0]));
  }, [filtered]);

  const openNew = useCallback(() => {
    setEditing(null);
    setFormDriverId('');
    setFormType('expense');
    setFormAmount('');
    setFormDescription('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setError(null);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((a: AdjustmentWithDriver) => {
    setEditing(a);
    setFormDriverId(a.driver_id);
    setFormType(a.type);
    setFormAmount(a.amount.toString());
    setFormDescription(a.description);
    setFormDate(a.date);
    setFormNotes(a.notes || '');
    setError(null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditing(null);
    setError(null);
  }, []);

  const handleSave = async () => {
    if (!formDriverId || !formAmount || !formDescription || !formDate) {
      setError('Please fill in all required fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        driver_id: formDriverId,
        type: formType,
        amount: parseFloat(formAmount),
        description: formDescription,
        date: formDate,
        notes: formNotes || undefined,
      };
      const url = editing ? `/api/adjustments/${editing.id}` : '/api/adjustments';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this adjustment?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/adjustments/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
      else {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const formAmt = parseFloat(formAmount) || 0;
  const formSign = TYPE_META[formType].sign;
  const formValid = !!formDriverId && formAmt > 0 && formDescription.trim().length > 0;
  const formDriver = drivers.find((d) => d.id === formDriverId);

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Financial / Adjustments</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Driver adjustments</h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            Expenses and compensations applied to drivers. Each entry flows into their settlement balance.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={st.ghostBtn} className="fleetHover" onClick={() => router.push('/fleet/settlements')}>
            <FleetIcon name="settle" size={13} /> Settlements
          </button>
          {isAdmin && (
            <button style={st.primaryBtn} className="fleetHover" onClick={openNew}>
              <FleetIcon name="plus" size={13} stroke={2.2} /> New adjustment
            </button>
          )}
        </div>
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <AdjStat label="Total expenses" value={fmtEUR(stats.expenses, 0)} sub="deducted from drivers" color="var(--neg)" icon="damage" />
        <AdjStat label="Total compensation" value={fmtEUR(stats.compensation, 0)} sub="added to drivers" color="var(--pos)" icon="shift" />
        <AdjStat label="Entries" value={stats.count} sub="all adjustments" color="var(--text-1)" icon="adjust" />
        <AdjStat
          label="Net balance"
          value={`${stats.net >= 0 ? '+' : '−'} ${fmtEUR(Math.abs(stats.net), 0)}`}
          sub="net of all entries"
          color={stats.net === 0 ? 'var(--text-3)' : stats.net >= 0 ? 'var(--pos)' : 'var(--neg)'}
          icon="chart"
        />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={st.tabs}>
            {[
              { k: 'all', label: 'All' },
              { k: 'expenses', label: 'Expenses' },
              { k: 'compensation', label: 'Compensation' },
            ].map((o) => (
              <button key={o.k} onClick={() => setFilterType(o.k)} style={{ ...st.tab, ...(filterType === o.k ? st.tabActive : {}) }}>
                {o.label}
              </button>
            ))}
          </div>

          <div style={st.selectWrap}>
            <FleetIcon name="filter" size={13} />
            <select value={filterTypeExact} onChange={(e) => setFilterTypeExact(e.target.value)} style={st.select}>
              <option value="all">All types</option>
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
          </div>

          <div style={st.selectWrap}>
            <FleetIcon name="driver" size={13} />
            <select value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)} style={st.select}>
              <option value="all">All drivers</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
        </div>
        <div style={st.searchWrap}>
          <FleetIcon name="search" size={13} />
          <input type="text" placeholder="Search reason, driver, ID…" value={search} onChange={(e) => setSearch(e.target.value)} style={st.searchInput} />
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>
        <span style={{ color: 'var(--text-1)' }} className="mono">{filtered.length}</span> adjustments
        {filterDriver !== 'all' && <> · <span style={{ color: 'var(--text-2)' }}>{drivers.find((d) => d.id === filterDriver)?.full_name}</span></>}
      </div>

      {filtered.length === 0 ? (
        <div style={st.empty}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--bg-2)', color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <FleetIcon name="adjust" size={20} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>No adjustments match these filters</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>Try clearing filters, or create a new one.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(([key, items]) => {
            const weekTotal = items.reduce((s, a) => s + signedAmount(a), 0);
            const weekExp = items.filter((a) => TYPE_META[a.type].sign < 0).reduce((s, a) => s + a.amount, 0);
            const weekComp = items.filter((a) => TYPE_META[a.type].sign > 0).reduce((s, a) => s + a.amount, 0);
            return (
              <div key={key}>
                <div style={st.weekHead}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={st.weekChip}>{monthLabel(key)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    {weekExp > 0 && <span><span className="mono" style={{ color: 'var(--neg)' }}>− {fmtEUR(weekExp, 0)}</span> exp</span>}
                    {weekComp > 0 && <span><span className="mono" style={{ color: 'var(--pos)' }}>+ {fmtEUR(weekComp, 0)}</span> comp</span>}
                    <span style={{ borderLeft: '1px solid var(--line-2)', paddingLeft: 10, color: 'var(--text-2)' }}>
                      Net <span className="mono" style={{ color: weekTotal >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 500 }}>{weekTotal >= 0 ? '+' : '−'} {fmtEUR(Math.abs(weekTotal), 2)}</span>
                    </span>
                  </div>
                </div>
                <div style={st.card}>
                  {items.map((a, i) => {
                    const meta = TYPE_META[a.type];
                    const isPos = meta.sign > 0;
                    const isNeg = meta.sign < 0;
                    return (
                      <div key={a.id} style={{ ...st.row, borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--line-1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: isPos ? 'var(--pos-soft)' : isNeg ? 'var(--neg-soft)' : 'var(--bg-2)', color: isPos ? 'var(--pos)' : isNeg ? 'var(--neg)' : 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FleetIcon name={meta.icon} size={16} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.description}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{meta.label}</span>
                              {a.notes && (<><span style={{ color: 'var(--text-4)' }}>·</span><span style={{ fontSize: 11.5, color: 'var(--warn)' }}>{a.notes}</span></>)}
                            </div>
                          </div>
                        </div>

                        <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 99, background: colorFor(a.driver_id), color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {initialsOf(a.drivers?.full_name || '?')}
                          </div>
                          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{a.drivers?.full_name || 'Unknown'}</span>
                        </div>

                        <div className="hide-mobile mono" style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }}>{dateLabel(a.date)}</div>

                        <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: isPos ? 'var(--pos)' : isNeg ? 'var(--neg)' : 'var(--text-2)', textAlign: 'right' }}>
                          {isPos ? '+' : isNeg ? '−' : ''} {fmtEUR(a.amount, 2)}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          {isAdmin && (
                            <>
                              <button onClick={() => openEdit(a)} style={st.iconBtn} title="Edit"><FleetIcon name="adjust" size={13} /></button>
                              <button onClick={() => handleDelete(a.id)} style={st.iconBtn} title="Delete" disabled={loading}><FleetIcon name="close" size={13} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <>
          <div onClick={closeModal} style={st.modalScrim} />
          <div style={st.modal}>
            <div style={st.modalHead}>
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{editing ? 'Edit adjustment' : 'New adjustment'}</div>
                <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--text-1)', marginTop: 2 }}>{editing ? editing.id : 'Add expense or compensation'}</div>
              </div>
              <button onClick={closeModal} style={st.modalCloseBtn}>×</button>
            </div>

            <div style={st.modalBody}>
              {error && (
                <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.32)', color: 'var(--neg)', fontSize: 12.5 }}>{error}</div>
              )}

              <div style={st.formGrid} className="grid-2">
                <Field label="Driver" required>
                  <div style={st.selectField}>
                    {formDriver && (
                      <div style={{ width: 22, height: 22, borderRadius: 99, background: colorFor(formDriver.id), color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialsOf(formDriver.full_name)}</div>
                    )}
                    <select value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)} disabled={!!editing} style={st.formSelect}>
                      <option value="">Select a driver</option>
                      {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>
                </Field>

                <Field label="Type" required>
                  <div style={st.selectField}>
                    <FleetIcon name={TYPE_META[formType].icon} size={14} />
                    <select value={formType} onChange={(e) => setFormType(e.target.value as AdjustmentType)} style={st.formSelect}>
                      {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                    </select>
                  </div>
                </Field>

                <Field label="Amount" required>
                  <div style={st.amountField}>
                    <span style={{ color: 'var(--text-3)', fontSize: 14 }}>€</span>
                    <input type="number" inputMode="decimal" step="0.01" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" style={st.amountInput} autoFocus={!editing} />
                    {formSign !== 0 && (
                      <span className="mono" style={{ fontSize: 11.5, color: formSign > 0 ? 'var(--pos)' : 'var(--neg)' }}>{formSign > 0 ? '+' : '−'}</span>
                    )}
                  </div>
                </Field>

                <Field label="Date" required>
                  <div style={st.selectField}>
                    <FleetIcon name="roster" size={13} />
                    <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={st.formSelect} />
                  </div>
                </Field>
              </div>

              <Field label="Description" required>
                <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="e.g. Fuel expense, performance bonus" rows={2} style={st.textarea} />
              </Field>

              <Field label="Internal note" hint="Optional">
                <input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional" style={st.input} />
              </Field>

              <div style={st.preview}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Settlement impact</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{formDriver ? formDriver.full_name : 'Driver'} balance changes by</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: formSign > 0 ? 'var(--pos)' : formSign < 0 ? 'var(--neg)' : 'var(--text-2)' }}>
                    {formSign > 0 ? '+' : formSign < 0 ? '−' : ''} {fmtEUR(formAmt, 2)}
                  </div>
                </div>
              </div>
            </div>

            <div style={st.modalFoot}>
              <button onClick={closeModal} style={{ ...st.ghostBtn, flex: 1, justifyContent: 'center' }} disabled={loading}>Cancel</button>
              <button onClick={handleSave} disabled={!formValid || loading} style={{ ...st.primaryBtn, flex: 1, justifyContent: 'center', ...(formValid && !loading ? {} : { background: 'var(--bg-3)', color: 'var(--text-3)', cursor: 'not-allowed' }) }}>
                <FleetIcon name="check" size={13} stroke={2.4} /> {loading ? 'Saving…' : editing ? 'Save changes' : 'Add adjustment'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AdjStat({ label, value, sub, color, icon }: { label: string; value: string | number; sub: string; color: string; icon: string }) {
  return (
    <div style={st.stat}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FleetIcon name={icon} size={15} />
        </div>
      </div>
      <div className="mono" style={{ marginTop: 14, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <label style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 500 }}>
          {label} {required && <span style={{ color: 'var(--accent)' }}>*</span>}
        </label>
        {hint && <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 18px', gap: 12 },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, cursor: 'pointer' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  selectWrap: { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)' },
  select: { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, minWidth: 220, color: 'var(--text-3)' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'inherit', minWidth: 0 },
  weekHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px', gap: 12, flexWrap: 'wrap' },
  weekChip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)', borderRadius: 5, fontSize: 11.5, fontFamily: 'Geist Mono, monospace', fontWeight: 600, letterSpacing: '0.04em' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12, overflow: 'hidden' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 1fr 80px 120px auto', gap: 14, padding: '12px 18px', alignItems: 'center' },
  iconBtn: { width: 28, height: 28, background: 'var(--bg-2)', border: '1px solid var(--line-1)', color: 'var(--text-3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  empty: { padding: '48px 18px', textAlign: 'center', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 },
  modalScrim: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, backdropFilter: 'blur(2px)' },
  modal: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, width: 'min(560px, calc(100vw - 32px))', maxHeight: '90vh', overflowY: 'auto', zIndex: 51, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' },
  modalHead: { padding: 18, borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalCloseBtn: { width: 28, height: 28, background: 'var(--bg-2)', border: 'none', color: 'var(--text-2)', borderRadius: 7, fontSize: 18, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' },
  modalBody: { padding: 18, flex: 1 },
  modalFoot: { padding: 14, borderTop: '1px solid var(--line-1)', display: 'flex', gap: 8 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px', marginBottom: 4 },
  selectField: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-3)' },
  formSelect: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', minWidth: 0 },
  amountField: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7 },
  amountInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'Geist Mono, monospace', fontSize: 15, fontWeight: 500, minWidth: 0 },
  textarea: { width: '100%', padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none' },
  input: { width: '100%', padding: '9px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  preview: { marginTop: 8, padding: '14px 16px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 10 },
};
