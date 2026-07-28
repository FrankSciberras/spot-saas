'use client';

import { type CSSProperties, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { VehicleRecurringCost } from '@/lib/types/database';
import { categoriesOfKind, type FinanceCategory } from '@/lib/config/financeCategories';
import {
  describeFrequency,
  prorateCost,
  toISODate,
  type CostFrequency,
} from '@/lib/utils/bookkeepingPeriods';
import {
  createVehicleCostAction,
  updateVehicleCostAction,
  setVehicleCostActiveAction,
  deleteVehicleCostAction,
} from '@/lib/actions/vehicle-costs';
import type { VehicleOption } from './EarningsWorkspace';

interface VehicleCostsManagerProps {
  costs: VehicleRecurringCost[];
  categories: FinanceCategory[];
  vehicles: VehicleOption[];
  onClose: () => void;
}

interface Draft {
  label: string;
  vehicle_id: string;
  category_id: string;
  amount: string;
  frequency: CostFrequency;
  start_date: string;
  end_date: string;
}

const FREQUENCIES: { value: CostFrequency; label: string }[] = [
  { value: 'weekly', label: 'Per week' },
  { value: 'monthly', label: 'Per month' },
  { value: 'yearly', label: 'Per year' },
];

function vehicleLabel(v: VehicleOption): string {
  const model = [v.make, v.model].filter(Boolean).join(' ');
  return model ? `${v.registration_number} — ${model}` : v.registration_number;
}

export default function VehicleCostsManager({
  costs, categories, vehicles, onClose,
}: VehicleCostsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const expenseCategories = useMemo(() => categoriesOfKind(categories, 'expense'), [categories]);
  const categoryById = useMemo(() => {
    const map = new Map<string, FinanceCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);
  const vehicleById = useMemo(() => {
    const map = new Map<string, VehicleOption>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  const blankDraft = (): Draft => ({
    label: '',
    vehicle_id: '',
    category_id: expenseCategories[0]?.id ?? '',
    amount: '',
    frequency: 'monthly',
    start_date: toISODate(new Date()),
    end_date: '',
  });

  const [draft, setDraft] = useState<Draft>(blankDraft);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  };

  const startAdd = () => {
    setEditingId(null);
    setShowAdd(true);
    setDraft(blankDraft());
  };

  const startEdit = (cost: VehicleRecurringCost) => {
    setShowAdd(false);
    setEditingId(cost.id);
    setDraft({
      label: cost.label,
      vehicle_id: cost.vehicle_id ?? '',
      category_id: cost.category_id,
      amount: String(cost.amount),
      frequency: cost.frequency,
      start_date: cost.start_date.split('T')[0],
      end_date: cost.end_date ? cost.end_date.split('T')[0] : '',
    });
  };

  const saveDraft = () => {
    const input = {
      label: draft.label,
      vehicle_id: draft.vehicle_id || null,
      category_id: draft.category_id,
      amount: parseFloat(draft.amount) || 0,
      frequency: draft.frequency,
      start_date: draft.start_date,
      end_date: draft.end_date || null,
    };
    if (editingId) {
      run(() => updateVehicleCostAction(editingId, input), () => setEditingId(null));
    } else {
      run(() => createVehicleCostAction(input), () => setShowAdd(false));
    }
  };

  const closeForm = () => {
    setEditingId(null);
    setShowAdd(false);
    setError(null);
  };

  // What this list adds up to across a typical month, so the total is legible.
  const monthlyTotal = useMemo(() => {
    const start = toISODate(new Date());
    const end = toISODate(new Date(Date.now() + 29 * 86_400_000));
    return costs.reduce(
      (sum, c) => sum + prorateCost(
        { amount: Number(c.amount), frequency: c.frequency, start_date: c.start_date, end_date: c.end_date, is_active: c.is_active },
        start, end,
      ),
      0,
    );
  }, [costs]);

  const renderForm = (submitLabel: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <input
        autoFocus
        type="text"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder='Name, e.g. "Lease — VW Passat"'
        style={st.input}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={st.fieldLabel}>Vehicle</label>
          <select value={draft.vehicle_id} onChange={(e) => setDraft({ ...draft, vehicle_id: e.target.value })} style={st.input}>
            <option value="">Whole fleet (overhead)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={st.fieldLabel}>Books to</label>
          <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })} style={st.input}>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={st.fieldLabel}>Amount (€)</label>
          <input type="number" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="0.00" style={st.input} />
        </div>
        <div>
          <label style={st.fieldLabel}>Charged</label>
          <select value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as CostFrequency })} style={st.input}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={st.fieldLabel}>Starts</label>
          <input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} style={st.input} />
        </div>
        <div>
          <label style={st.fieldLabel}>Ends (optional)</label>
          <input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} style={st.input} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={st.savePrimary} onClick={saveDraft} disabled={pending || !draft.label.trim() || !draft.category_id}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button style={st.miniBtn} onClick={closeForm} disabled={pending}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={(e) => e.stopPropagation()}>
        <div style={st.modalHead}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>Vehicle running costs</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Lease, finance, road tax and insurance — added to every new period automatically.
            </div>
          </div>
          <button style={st.iconBtn} onClick={onClose}><FleetIcon name="close" size={14} /></button>
        </div>

        <div style={st.modalBody}>
          {error && (
            <div style={{ ...st.alert, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.25)' }}>
              {error}
            </div>
          )}

          {expenseCategories.length === 0 && (
            <div style={{ ...st.alert, color: 'var(--text-2)', background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}>
              Add an expense category first — a cost has to book somewhere.
            </div>
          )}

          <div style={st.card}>
            <div style={{ ...st.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Recurring costs</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {costs.length === 0 ? 'Nothing set up yet' : `≈ €${monthlyTotal.toFixed(2)} per month`}
                </div>
              </div>
              <button style={st.linkBtn} onClick={startAdd} disabled={pending || expenseCategories.length === 0}>+ Add</button>
            </div>

            <div style={{ borderTop: '1px solid var(--line-1)' }}>
              {costs.length === 0 && !showAdd && (
                <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                  No vehicle costs yet. Add a lease or road tax and it will be prorated into every period you create.
                </div>
              )}

              {costs.map((cost) => {
                if (editingId === cost.id) {
                  return <div key={cost.id} style={st.editRow}>{renderForm('Save changes')}</div>;
                }
                const category = categoryById.get(cost.category_id);
                const vehicle = cost.vehicle_id ? vehicleById.get(cost.vehicle_id) : null;
                return (
                  <div key={cost.id} style={{ ...st.row, opacity: cost.is_active ? 1 : 0.5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cost.label}
                        {!cost.is_active && <span style={{ color: 'var(--text-3)', fontSize: 11 }}> · paused</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="mono">{describeFrequency(Number(cost.amount), cost.frequency)}</span>
                        <span>·</span>
                        <span>{vehicle ? vehicle.registration_number : 'Whole fleet'}</span>
                        {category && (
                          <>
                            <span>·</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 2, background: category.color }} />
                              {category.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <button style={st.iconBtn} onClick={() => startEdit(cost)} disabled={pending}>Edit</button>
                    <button
                      style={st.iconBtn}
                      disabled={pending}
                      onClick={() => run(() => setVehicleCostActiveAction(cost.id, !cost.is_active))}
                    >
                      {cost.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      style={{ ...st.iconBtn, color: 'var(--neg)' }}
                      disabled={pending}
                      onClick={() => run(() => deleteVehicleCostAction(cost.id))}
                      title="Delete — periods already saved keep their figures"
                    >
                      <FleetIcon name="close" size={12} />
                    </button>
                  </div>
                );
              })}

              {showAdd && !editingId && <div style={st.editRow}>{renderForm('Add cost')}</div>}
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Costs are spread by day, so a €400/month lease adds about €92 to a week-long period and
            the full €400 to a month. You can always type over the suggested figure.
          </div>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 200, overflowY: 'auto' },
  modal: { width: '100%', maxWidth: 620, background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 24 },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 18px', gap: 12, borderBottom: '1px solid var(--line-1)' },
  modalBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { padding: '12px 14px' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line-1)' },
  editRow: { display: 'flex', padding: '12px 14px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-2)' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '7px 9px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  fieldLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 },
  iconBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  savePrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 13 },
};
