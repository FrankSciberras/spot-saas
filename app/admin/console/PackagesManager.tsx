'use client';

// =============================================================================
// PACKAGES MANAGER (platform-admin) — live editor for the plan catalogue.
// =============================================================================
// Fetches the full catalogue (incl. drafts) from /api/admin/plans and lets the
// platform admin create, edit, publish and delete packages. Every save calls a
// server action in lib/actions/plans.ts; those revalidate the marketing page,
// onboarding, the billing screen and this console so edits show up everywhere.
// =============================================================================

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  createPlanAction,
  updatePlanAction,
  setPlanPublishedAction,
  deletePlanAction,
  reorderPlansAction,
  type PlanInput,
} from '@/lib/actions/plans';
import type { PlanRow } from '@/lib/types/database';

const Icon = FleetIcon;

type Row = PlanRow & { operatorCount: number };

const inp: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const lbl: CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' };
const field = (flex: number, min: number): CSSProperties => ({ flex, minWidth: min });
const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghost: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--bg-1)',
  border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
};
const card: CSSProperties = {
  background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', padding: 16,
};

/** Parse an integer input; blank → null (unlimited). */
function intOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

/** Editable form state shared by the create row and each edit card. */
interface Draft {
  name: string;
  blurb: string;
  priceLabel: string;
  priceUnit: string;
  priceAmount: string;
  billingNote: string;
  capLabel: string;
  maxDrivers: string;
  maxVehicles: string;
  includedVehicles: string;
  perVehiclePrice: string;
  features: string; // newline-separated
  color: string;
  ctaLabel: string;
  ctaHref: string;
  isCustom: boolean;
  isPopular: boolean;
  stripePriceId: string;
  stripeProductId: string;
}

const EMPTY_DRAFT: Draft = {
  name: '', blurb: '', priceLabel: '', priceUnit: '/ mo', priceAmount: '', billingNote: '', capLabel: '',
  maxDrivers: '', maxVehicles: '', includedVehicles: '', perVehiclePrice: '', features: '', color: '', ctaLabel: '', ctaHref: '', isCustom: false, isPopular: false,
  stripePriceId: '', stripeProductId: '',
};

function rowToDraft(r: PlanRow): Draft {
  return {
    name: r.name,
    blurb: r.blurb ?? '',
    priceLabel: r.price_label,
    priceUnit: r.price_unit ?? '',
    priceAmount: String(r.price_amount ?? 0),
    billingNote: r.billing_note ?? '',
    capLabel: r.cap_label ?? '',
    maxDrivers: r.max_drivers === null ? '' : String(r.max_drivers),
    maxVehicles: r.max_vehicles === null ? '' : String(r.max_vehicles),
    includedVehicles: r.included_vehicles === null || r.included_vehicles === undefined ? '' : String(r.included_vehicles),
    perVehiclePrice: r.per_vehicle_price === null || r.per_vehicle_price === undefined ? '' : String(r.per_vehicle_price),
    features: (r.features ?? []).join('\n'),
    color: r.color ?? '',
    ctaLabel: r.cta_label ?? '',
    ctaHref: r.cta_href ?? '',
    isCustom: r.is_custom,
    isPopular: r.is_popular,
    stripePriceId: r.stripe_price_id ?? '',
    stripeProductId: r.stripe_product_id ?? '',
  };
}

function draftToInput(d: Draft): PlanInput {
  return {
    name: d.name,
    blurb: d.blurb,
    priceLabel: d.priceLabel,
    priceUnit: d.priceUnit,
    priceAmount: Number(d.priceAmount) || 0,
    billingNote: d.billingNote,
    capLabel: d.capLabel,
    maxDrivers: intOrNull(d.maxDrivers),
    maxVehicles: intOrNull(d.maxVehicles),
    includedVehicles: intOrNull(d.includedVehicles),
    perVehiclePrice: d.perVehiclePrice.trim() === '' ? null : Number(d.perVehiclePrice),
    features: d.features.split('\n').map((f) => f.trim()).filter(Boolean),
    color: d.color,
    ctaLabel: d.ctaLabel,
    ctaHref: d.ctaHref,
    isCustom: d.isCustom,
    isPopular: d.isPopular,
    stripePriceId: d.stripePriceId,
    stripeProductId: d.stripeProductId,
  };
}

/** The set of editable fields, rendered for both create + edit. */
const DraftFields = ({ d, set, disabled }: { d: Draft; set: (patch: Partial<Draft>) => void; disabled: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(2, 160)}>
        <label style={lbl}>Name *</label>
        <input style={inp} value={d.name} placeholder="e.g. Starter" disabled={disabled} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div style={field(3, 200)}>
        <label style={lbl}>Tagline</label>
        <input style={inp} value={d.blurb} placeholder="One-line description" disabled={disabled} onChange={(e) => set({ blurb: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(1, 110)}>
        <label style={lbl}>Price label</label>
        <input style={inp} value={d.priceLabel} placeholder="€49 / Custom" disabled={disabled} onChange={(e) => set({ priceLabel: e.target.value })} />
      </div>
      <div style={field(1, 110)}>
        <label style={lbl}>Price suffix</label>
        <input style={inp} value={d.priceUnit} placeholder="/ mo" disabled={disabled} onChange={(e) => set({ priceUnit: e.target.value })} />
      </div>
      <div style={field(1, 110)}>
        <label style={lbl}>Amount (€/mo, for MRR)</label>
        <input style={inp} type="number" value={d.priceAmount} placeholder="49" disabled={disabled} onChange={(e) => set({ priceAmount: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(1, 110)}>
        <label style={lbl}>Max drivers (blank = ∞)</label>
        <input style={inp} type="number" value={d.maxDrivers} placeholder="∞" disabled={disabled} onChange={(e) => set({ maxDrivers: e.target.value })} />
      </div>
      <div style={field(1, 110)}>
        <label style={lbl}>Max vehicles (blank = ∞)</label>
        <input style={inp} type="number" value={d.maxVehicles} placeholder="∞" disabled={disabled} onChange={(e) => set({ maxVehicles: e.target.value })} />
      </div>
      <div style={field(2, 160)}>
        <label style={lbl}>Cap label</label>
        <input style={inp} value={d.capLabel} placeholder="Up to 10 drivers & vehicles" disabled={disabled} onChange={(e) => set({ capLabel: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(1, 110)}>
        <label style={lbl}>Vehicles included (blank = ∞)</label>
        <input style={inp} type="number" value={d.includedVehicles} placeholder="∞" disabled={disabled} onChange={(e) => set({ includedVehicles: e.target.value })} />
      </div>
      <div style={field(1, 110)}>
        <label style={lbl}>€ per extra vehicle (blank = none)</label>
        <input style={inp} type="number" value={d.perVehiclePrice} placeholder="—" disabled={disabled} onChange={(e) => set({ perVehiclePrice: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(2, 200)}>
        <label style={lbl}>Billing note (marketing)</label>
        <input style={inp} value={d.billingNote} placeholder="Up to 10 vehicles · billed monthly" disabled={disabled} onChange={(e) => set({ billingNote: e.target.value })} />
      </div>
      <div style={field(1, 110)}>
        <label style={lbl}>Accent colour</label>
        <input style={inp} value={d.color} placeholder="var(--accent) / #a78bfa" disabled={disabled} onChange={(e) => set({ color: e.target.value })} />
      </div>
    </div>
    <div>
      <label style={lbl}>Features (one per line)</label>
      <textarea style={{ ...inp, minHeight: 84, resize: 'vertical' }} value={d.features} placeholder={'Rosters & shift tracking\nEmail support'} disabled={disabled} onChange={(e) => set({ features: e.target.value })} />
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(1, 140)}>
        <label style={lbl}>CTA label</label>
        <input style={inp} value={d.ctaLabel} placeholder="Start free trial" disabled={disabled} onChange={(e) => set({ ctaLabel: e.target.value })} />
      </div>
      <div style={field(2, 200)}>
        <label style={lbl}>CTA link (blank = trial signup)</label>
        <input style={inp} value={d.ctaHref} placeholder="mailto:hello@…" disabled={disabled} onChange={(e) => set({ ctaHref: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={field(2, 200)}>
        <label style={lbl}>Stripe product ID (blank = no self-serve checkout)</label>
        <input style={inp} value={d.stripeProductId} placeholder="prod_…" disabled={disabled} onChange={(e) => set({ stripeProductId: e.target.value })} />
      </div>
      <div style={field(2, 200)}>
        <label style={lbl}>Stripe price ID (optional — overrides product&apos;s default price)</label>
        <input style={inp} value={d.stripePriceId} placeholder="price_…" disabled={disabled} onChange={(e) => set({ stripePriceId: e.target.value })} />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={d.isPopular} disabled={disabled} onChange={(e) => set({ isPopular: e.target.checked })} />
        Most popular badge
      </label>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
        <input type="checkbox" checked={d.isCustom} disabled={disabled} onChange={(e) => set({ isCustom: e.target.checked })} />
        Custom pricing (contact sales — no self-serve)
      </label>
    </div>
  </div>
);

const PlanEditCard = ({ row, onChanged }: { row: Row; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(() => rowToDraft(row));
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  // Re-sync when the underlying row changes (after a refetch) and not editing.
  useEffect(() => { if (!open) setD(rowToDraft(row)); }, [row, open]);

  const save = () => {
    if (!d.name.trim()) { setErr('Name is required.'); return; }
    setErr('');
    startTransition(async () => {
      const r = await updatePlanAction(row.id, draftToInput(d));
      if (r.error) setErr(r.error);
      else { setOpen(false); onChanged(); }
    });
  };
  const togglePublish = () => {
    setErr('');
    startTransition(async () => {
      const r = await setPlanPublishedAction(row.id, !row.is_published);
      if (r.error) setErr(r.error); else onChanged();
    });
  };
  const remove = () => {
    if (!window.confirm(`Delete the "${row.name}" package?`)) return;
    setErr('');
    startTransition(async () => {
      const r = await deletePlanAction(row.id);
      if (r.error) setErr(r.error); else onChanged();
    });
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{row.name}</span>
            {row.is_popular && <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 7px', borderRadius: 100 }}>Popular</span>}
            <span style={{ fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 100, color: row.is_published ? 'var(--pos)' : 'var(--text-3)', background: row.is_published ? 'var(--pos-soft)' : 'var(--bg-3)' }}>
              {row.is_published ? 'Published' : 'Draft'}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            {row.key} · {row.price_label}{row.price_unit ? ` ${row.price_unit}` : ''} ·{' '}
            {row.max_drivers === null ? '∞' : row.max_drivers}d / {row.max_vehicles === null ? '∞' : row.max_vehicles}v ·{' '}
            {row.operatorCount} operator{row.operatorCount === 1 ? '' : 's'}
          </div>
        </div>
        <button style={ghost} disabled={isPending} onClick={() => setOpen((v) => !v)}>
          <Icon name="adjust" size={13} />{open ? 'Close' : 'Edit'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line-1)' }}>
          <DraftFields d={d} set={set} disabled={isPending} />
          {err && <div style={{ fontSize: 12, color: 'var(--neg)', marginTop: 12 }}>{err}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn} disabled={isPending} onClick={save}>{isPending ? 'Saving…' : 'Save changes'}</button>
              <button style={ghost} disabled={isPending} onClick={togglePublish}>{row.is_published ? 'Unpublish' : 'Publish'}</button>
            </div>
            <button style={{ ...ghost, color: 'var(--neg)', borderColor: 'var(--neg-soft)' }} disabled={isPending} onClick={remove}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function PackagesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const loadedOnce = useRef(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/plans');
      const json = await res.json();
      setRows(json.data || []);
    } catch { /* leave as-is */ } finally { setLoading(false); }
  };
  useEffect(() => { if (!loadedOnce.current) { loadedOnce.current = true; load(); } }, []);

  const create = async () => {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    setErr(''); setCreating(true);
    const r = await createPlanAction(draftToInput(draft));
    setCreating(false);
    if (r.error) { setErr(r.error); return; }
    setDraft(EMPTY_DRAFT); setShowCreate(false); load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...rows];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setRows(next); // optimistic
    await reorderPlansAction(next.map((r) => r.id));
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {loading ? 'Loading…' : `${rows.length} package${rows.length === 1 ? '' : 's'} · drives the website, onboarding & billing`}
        </span>
        <button style={btn} onClick={() => setShowCreate((v) => !v)}>
          <Icon name="plus" size={14} stroke={2} />New package
        </button>
      </div>

      {showCreate && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', marginBottom: 14 }}>New package</div>
          <DraftFields d={draft} set={(patch) => setDraft((p) => ({ ...p, ...patch }))} disabled={creating} />
          {err && <div style={{ fontSize: 12, color: 'var(--neg)', marginTop: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ ...btn, opacity: creating || !draft.name.trim() ? 0.5 : 1 }} disabled={creating || !draft.name.trim()} onClick={create}>
              {creating ? 'Creating…' : 'Create package'}
            </button>
            <button style={ghost} disabled={creating} onClick={() => { setShowCreate(false); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && !showCreate && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No packages yet. Create one to get started.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row, i) => (
          <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
              <button style={{ ...ghost, padding: 5 }} disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><Icon name="arrow-up" size={13} /></button>
              <button style={{ ...ghost, padding: 5 }} disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Move down"><Icon name="arrow-down" size={13} /></button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlanEditCard row={row} onChanged={load} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
