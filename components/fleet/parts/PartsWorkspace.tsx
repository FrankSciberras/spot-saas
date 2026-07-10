'use client';

// =============================================================================
// PARTS & INVENTORY WORKSPACE — stock list, low-stock alerts, usage log.
// =============================================================================
// Client half of /fleet/parts. Mirrors the ServicesWorkspace idioms: inline `st`
// style objects + global utility classes, Card/CardHeader primitives, stats row,
// filter chips + search, and a two-column split (list + side cards). All writes
// go through lib/actions/parts.ts server actions, then router.refresh().
// =============================================================================

import { type CSSProperties, type FormEvent, type ReactNode, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { fmtEUR } from '@/components/fleet/FleetCharts';
import {
  createPartAction,
  updatePartAction,
  deletePartAction,
  adjustStockAction,
  recordUsageAction,
  type PartInput,
} from '@/lib/actions/parts';

export interface PartRow {
  id: string;
  name: string;
  partNumber: string | null;
  category: string | null;
  quantity: number;
  minQuantity: number;
  unitCost: number | null;
  supplier: string | null;
  location: string | null;
  notes: string | null;
}

export interface UsageRow {
  id: string;
  partName: string;
  vehicleReg: string | null;
  quantity: number;
  unitCost: number | null;
  usedAt: string;
  notes: string | null;
}

export interface VehicleOption {
  id: string;
  reg: string;
}

interface Props {
  parts: PartRow[];
  usage: UsageRow[];
  vehicles: VehicleOption[];
  isAdmin: boolean;
}

type Modal =
  | { mode: 'add' }
  | { mode: 'edit'; part: PartRow }
  | { mode: 'use'; part: PartRow }
  | { mode: 'restock'; part: PartRow }
  | null;

const isLow = (p: PartRow) => p.quantity === 0 || (p.minQuantity > 0 && p.quantity <= p.minQuantity);

function Card({ children }: { children: ReactNode }) {
  return <div style={st.card}>{children}</div>;
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={st.cardHeader}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub: string; icon: string; accent: string }) {
  return (
    <div style={st.stat}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FleetIcon name={icon} size={15} />
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function QtyPill({ part }: { part: PartRow }) {
  const zero = part.quantity === 0;
  const low = isLow(part);
  const color = zero ? 'var(--neg)' : low ? 'var(--warn)' : 'var(--text-2)';
  const bg = zero ? 'var(--neg-soft)' : low ? 'var(--warn-soft)' : 'var(--bg-2)';
  return (
    <span className="mono tnum" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: bg, color }}>
      {part.quantity} in stock
    </span>
  );
}

export default function PartsWorkspace({ parts, usage, vehicles, isAdmin }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const lowParts = useMemo(() => parts.filter(isLow), [parts]);
  const unitsTotal = useMemo(() => parts.reduce((a, p) => a + p.quantity, 0), [parts]);
  const stockValue = useMemo(() => parts.reduce((a, p) => a + p.quantity * (p.unitCost ?? 0), 0), [parts]);

  const list = useMemo(() => {
    let l = filter === 'low' ? lowParts : parts;
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.partNumber ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.supplier ?? '').toLowerCase().includes(q)
      );
    }
    return l;
  }, [parts, lowParts, filter, search]);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError('');
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        return;
      }
      setModal(null);
      router.refresh();
    });
  };

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Maintenance / Parts</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Parts &amp; Inventory</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{parts.length}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={st.primaryBtn} className="fleetHover" onClick={() => { setError(''); setModal({ mode: 'add' }); }}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> Add part
          </button>
        </div>
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <Stat label="Parts tracked" value={parts.length} sub="distinct stock lines" icon="box" accent="var(--accent)" />
        <Stat label="Units in stock" value={unitsTotal} sub="across all parts" icon="chart" accent="var(--text-1)" />
        <Stat label="Stock value" value={fmtEUR(stockValue, { decimals: 0 })} sub="quantity × unit cost" icon="settle" accent="var(--pos)" />
        <Stat label="Low stock" value={lowParts.length} sub="at or below minimum" icon="warning" accent={lowParts.length ? 'var(--warn)' : 'var(--text-3)'} />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {([
            { k: 'all', label: 'All', n: parts.length, dot: undefined as string | undefined },
            { k: 'low', label: 'Low stock', n: lowParts.length, dot: 'var(--warn)' },
          ] as const).map((t) => (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{ ...st.tab, ...(filter === t.k ? st.tabActive : {}) }}>
              {t.dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: t.dot }} />}
              {t.label}
              <span className="mono tnum" style={{ fontSize: 11, color: filter === t.k ? 'var(--text-2)' : 'var(--text-4)' }}>{t.n}</span>
            </button>
          ))}
        </div>
        <div style={st.searchBox} className="full-mobile">
          <FleetIcon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, number, supplier…" style={st.searchInput} />
        </div>
      </div>

      <div className="split-detail" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card>
          <CardHeader title="Stock list" subtitle={`${list.length} of ${parts.length} parts`} />
          <div style={{ borderTop: '1px solid var(--line-1)' }}>
            {list.map((p, i) => (
              <div key={p.id} style={{ ...st.partRow, borderBottom: i < list.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                  <div style={st.partIcon}><FleetIcon name="box" size={15} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>{p.name}</span>
                      {p.partNumber && <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4 }}>{p.partNumber}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                      {[p.category, p.supplier, p.location].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </div>
                <div style={st.partRight}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono tnum" style={{ fontSize: 13, fontWeight: 500, color: p.unitCost != null ? 'var(--text-1)' : 'var(--text-3)' }}>
                      {p.unitCost != null ? fmtEUR(p.unitCost) : '—'}
                    </div>
                    <div style={{ marginTop: 3 }}><QtyPill part={p} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={st.rowBtn} className="fleetHover" disabled={isPending || p.quantity === 0} title={p.quantity === 0 ? 'Out of stock' : 'Log usage'} onClick={() => { setError(''); setModal({ mode: 'use', part: p }); }}>Use</button>
                    <button style={st.rowBtn} className="fleetHover" disabled={isPending} title="Add stock" onClick={() => { setError(''); setModal({ mode: 'restock', part: p }); }}>+</button>
                    <button style={st.rowBtn} className="fleetHover" disabled={isPending} title="Edit part" onClick={() => { setError(''); setModal({ mode: 'edit', part: p }); }}>Edit</button>
                  </div>
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                {parts.length === 0 ? 'No parts yet — add your first part to start tracking stock.' : 'No parts match your filters.'}
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Low stock" subtitle="At or below the minimum level" />
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 14px 12px' }}>
              {lowParts.slice(0, 8).map((p, i) => (
                <div key={p.id} style={{ ...st.sideRow, borderBottom: i < Math.min(lowParts.length, 8) - 1 ? '1px solid var(--line-1)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>min {p.minQuantity}</div>
                  </div>
                  <QtyPill part={p} />
                </div>
              ))}
              {lowParts.length === 0 && <div style={{ padding: '14px 4px', color: 'var(--text-3)', fontSize: 12.5 }}>Stock levels look healthy.</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent usage" subtitle="Latest parts taken from stock" />
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 14px 12px' }}>
              {usage.slice(0, 10).map((u, i) => (
                <div key={u.id} style={{ ...st.sideRow, borderBottom: i < Math.min(usage.length, 10) - 1 ? '1px solid var(--line-1)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.quantity}× {u.partName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {new Date(u.usedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      {u.vehicleReg && <> · {u.vehicleReg}</>}
                    </div>
                  </div>
                  <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {u.unitCost != null ? fmtEUR(u.unitCost * u.quantity) : ''}
                  </span>
                </div>
              ))}
              {usage.length === 0 && <div style={{ padding: '14px 4px', color: 'var(--text-3)', fontSize: 12.5 }}>No usage logged yet.</div>}
            </div>
          </Card>
        </div>
      </div>

      {modal && (
        <PartModal
          modal={modal}
          vehicles={vehicles}
          isAdmin={isAdmin}
          error={error}
          isPending={isPending}
          onClose={() => setModal(null)}
          onSubmitPart={(input) => run(() => (modal.mode === 'edit' ? updatePartAction(modal.part.id, input) : createPartAction(input)))}
          onDelete={modal.mode === 'edit' ? () => run(() => deletePartAction(modal.part.id)) : undefined}
          onUse={(qty, vehicleId, notes) => modal.mode === 'use' && run(() => recordUsageAction({ part_id: modal.part.id, quantity: qty, vehicle_id: vehicleId || null, notes }))}
          onRestock={(qty) => modal.mode === 'restock' && run(() => adjustStockAction(modal.part.id, qty))}
        />
      )}
    </>
  );
}

// ── Modal (add / edit / use / restock) ──────────────────────────────────────

function PartModal({
  modal, vehicles, isAdmin, error, isPending, onClose, onSubmitPart, onDelete, onUse, onRestock,
}: {
  modal: NonNullable<Modal>;
  vehicles: VehicleOption[];
  isAdmin: boolean;
  error: string;
  isPending: boolean;
  onClose: () => void;
  onSubmitPart: (input: PartInput) => void;
  onDelete?: () => void;
  onUse: (qty: number, vehicleId: string, notes: string) => void;
  onRestock: (qty: number) => void;
}) {
  const editing = modal.mode === 'edit' ? modal.part : null;
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    part_number: editing?.partNumber ?? '',
    category: editing?.category ?? '',
    quantity: String(editing?.quantity ?? 0),
    min_quantity: String(editing?.minQuantity ?? 0),
    unit_cost: editing?.unitCost != null ? String(editing.unitCost) : '',
    supplier: editing?.supplier ?? '',
    location: editing?.location ?? '',
    notes: editing?.notes ?? '',
  });
  const [useQty, setUseQty] = useState('1');
  const [useVehicle, setUseVehicle] = useState('');
  const [useNotes, setUseNotes] = useState('');
  const [restockQty, setRestockQty] = useState('1');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (modal.mode === 'use') {
      onUse(Math.floor(Number(useQty) || 0), useVehicle, useNotes);
      return;
    }
    if (modal.mode === 'restock') {
      onRestock(Math.floor(Number(restockQty) || 0));
      return;
    }
    onSubmitPart({
      name: form.name,
      part_number: form.part_number,
      category: form.category,
      quantity: Math.floor(Number(form.quantity) || 0),
      min_quantity: Math.floor(Number(form.min_quantity) || 0),
      unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
      supplier: form.supplier,
      location: form.location,
      notes: form.notes,
    });
  };

  const title =
    modal.mode === 'add' ? 'Add part'
    : modal.mode === 'edit' ? `Edit ${modal.part.name}`
    : modal.mode === 'use' ? `Use ${modal.part.name}`
    : `Restock ${modal.part.name}`;

  const field = (label: string, node: ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
      {label}
      {node}
    </label>
  );

  return (
    <div style={st.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form style={st.modal} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
          <button type="button" onClick={onClose} style={{ ...st.rowBtn, padding: '4px 8px' }} aria-label="Close">✕</button>
        </div>

        {(modal.mode === 'add' || modal.mode === 'edit') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>{field('Name *', <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={st.input} placeholder="e.g. Oil filter" />)}</div>
            {field('Part number', <input value={form.part_number} onChange={(e) => setForm({ ...form, part_number: e.target.value })} style={st.input} placeholder="OEM / SKU" />)}
            {field('Category', <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={st.input} placeholder="e.g. Filters" />)}
            {field('Quantity in stock', <input type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={st.input} />)}
            {field('Low-stock alert at', <input type="number" min={0} value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} style={st.input} />)}
            {field('Unit cost (€)', <input type="number" min={0} step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} style={st.input} placeholder="0.00" />)}
            {field('Supplier', <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} style={st.input} />)}
            <div style={{ gridColumn: '1 / -1' }}>{field('Storage location', <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={st.input} placeholder="Shelf, garage, van…" />)}</div>
            <div style={{ gridColumn: '1 / -1' }}>{field('Notes', <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...st.input, minHeight: 56, resize: 'vertical' }} />)}</div>
          </div>
        )}

        {modal.mode === 'use' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{modal.part.quantity} in stock</div>
            {field('Quantity used *', <input required type="number" min={1} max={modal.part.quantity} value={useQty} onChange={(e) => setUseQty(e.target.value)} style={st.input} />)}
            {field('Vehicle (optional)', (
              <select value={useVehicle} onChange={(e) => setUseVehicle(e.target.value)} style={st.input}>
                <option value="">— No vehicle —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg}</option>)}
              </select>
            ))}
            {field('Note (optional)', <input value={useNotes} onChange={(e) => setUseNotes(e.target.value)} style={st.input} placeholder="e.g. brake job, front left" />)}
          </div>
        )}

        {modal.mode === 'restock' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{modal.part.quantity} in stock now</div>
            {field('Units to add *', <input required type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(e.target.value)} style={st.input} />)}
          </div>
        )}

        {error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--neg)', background: 'var(--neg-soft)', padding: '8px 10px', borderRadius: 7 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div>
            {modal.mode === 'edit' && isAdmin && onDelete && (
              <button type="button" style={{ ...st.rowBtn, color: 'var(--neg)' }} className="fleetHover" disabled={isPending} onClick={() => { if (window.confirm('Delete this part and its usage history?')) onDelete(); }}>
                Delete part
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={st.secondaryBtn} className="fleetHover" disabled={isPending} onClick={onClose}>Cancel</button>
            <button type="submit" style={st.primaryBtn} className="fleetHover" disabled={isPending}>
              {isPending ? 'Saving…' : modal.mode === 'use' ? 'Log usage' : modal.mode === 'restock' ? 'Add stock' : 'Save part'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, whiteSpace: 'nowrap', cursor: 'pointer' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 240 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' },
  partRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px' },
  partIcon: { width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'var(--bg-2)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  partRight: { display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 },
  sideRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', gap: 10 },
  rowBtn: { padding: '5px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 16 },
  modal: { width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, padding: 20 },
  input: { padding: '8px 10px', background: 'var(--bg-0)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%' },
};
