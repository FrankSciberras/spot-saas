'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  SettlementPreset,
  SettlementTaxType,
  OrgPlatform,
  RecurringAdjustment,
  AdjustmentType,
  RecurringAmountType,
} from '@/lib/types/database';
import {
  createPresetAction,
  updatePresetAction,
  deletePresetAction,
  setDefaultPresetAction,
  assignDriverPresetAction,
  type PresetInput,
} from '@/lib/actions/settlement-presets';
import {
  createPlatformAction,
  updatePlatformAction,
  setPlatformActiveAction,
  deletePlatformAction,
  type PlatformInput,
} from '@/lib/actions/platforms';
import {
  createRecurringAdjustmentAction,
  updateRecurringAdjustmentAction,
  setRecurringAdjustmentActiveAction,
  deleteRecurringAdjustmentAction,
  type RecurringAdjustmentInput,
} from '@/lib/actions/recurring-adjustments';
import {
  COMPONENT_META,
  DEFAULT_COMPONENTS,
  resolveComponents,
  type SettlementComponentKey,
  type SettlementComponents,
} from '@/lib/config/settlements';
import styles from './settlements-settings.module.css';

export interface DriverPresetRow {
  id: string;
  full_name: string;
  /** Assigned preset id, or null when the driver inherits the fleet default. */
  presetId: string | null;
}

interface Props {
  presets: SettlementPreset[];
  defaultPresetId: string | null;
  drivers: DriverPresetRow[];
  platforms: OrgPlatform[];
  recurring: RecurringAdjustment[];
}

interface PresetForm {
  name: string;
  driverSharePct: string;
  tipsPct: string;
  campaignsPct: string;
  feePct: string;
  taxType: SettlementTaxType;
  taxValue: string;
  rentWeekly: string;
  hourlyRate: string;
  fixedWageWeekly: string;
  /** Which settlement components (columns) this preset calculates. */
  components: SettlementComponents;
}

const EMPTY_FORM: PresetForm = {
  name: '',
  driverSharePct: '50',
  tipsPct: '100',
  campaignsPct: '100',
  feePct: '100',
  taxType: 'flat',
  taxValue: '22',
  rentWeekly: '0',
  hourlyRate: '0',
  fixedWageWeekly: '0',
  components: { ...DEFAULT_COMPONENTS },
};

/**
 * Quick templates: one click sets the component checkboxes to a common pay
 * model. Everything stays editable afterwards — the checkboxes are the truth.
 */
const PAY_TEMPLATES: { id: string; label: string; hint: string; components: SettlementComponents }[] = [
  {
    id: 'split',
    label: 'Revenue split',
    hint: 'Driver keeps a % of fares (the classic model)',
    components: { ...DEFAULT_COMPONENTS },
  },
  {
    id: 'hourly',
    label: 'Hourly wage',
    hint: 'Hours worked × hourly rate, plus tips',
    components: {
      share: false, fee: false, cash: true, tips: true, campaigns: false,
      hours: true, fixed: false, tax: true, rent: false,
    },
  },
  {
    id: 'fixed',
    label: 'Fixed wage',
    hint: 'A flat weekly amount, plus tips',
    components: {
      share: false, fee: false, cash: true, tips: true, campaigns: false,
      hours: false, fixed: true, tax: true, rent: false,
    },
  },
  {
    id: 'hybrid',
    label: 'Wage + share',
    hint: 'Base wage plus a % of fares',
    components: {
      share: true, fee: true, cash: true, tips: true, campaigns: true,
      hours: true, fixed: false, tax: true, rent: false,
    },
  },
];

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function formFromPreset(p: SettlementPreset): PresetForm {
  return {
    name: p.name,
    driverSharePct: fmtNum(p.driver_share_pct),
    tipsPct: fmtNum(p.tips_driver_pct),
    campaignsPct: fmtNum(p.campaigns_driver_pct),
    feePct: fmtNum(p.fee_driver_pct),
    taxType: p.tax_type,
    taxValue: fmtNum(p.tax_value),
    rentWeekly: fmtNum(p.rent_weekly),
    hourlyRate: fmtNum(Number(p.hourly_rate) || 0),
    fixedWageWeekly: fmtNum(Number(p.fixed_wage_weekly) || 0),
    components: resolveComponents(p.components),
  };
}

function inputFromForm(f: PresetForm): PresetInput {
  return {
    name: f.name,
    driver_share_pct: parseFloat(f.driverSharePct) || 0,
    tips_driver_pct: parseFloat(f.tipsPct) || 0,
    campaigns_driver_pct: parseFloat(f.campaignsPct) || 0,
    fee_driver_pct: parseFloat(f.feePct) || 0,
    tax_type: f.taxType,
    tax_value: parseFloat(f.taxValue) || 0,
    rent_weekly: parseFloat(f.rentWeekly) || 0,
    hourly_rate: parseFloat(f.hourlyRate) || 0,
    fixed_wage_weekly: parseFloat(f.fixedWageWeekly) || 0,
    components: f.components,
  };
}

/** Human summary chips for a preset card. */
function presetChips(p: SettlementPreset): string[] {
  const c = resolveComponents(p.components);
  const chips: string[] = [];
  if (c.share) chips.push(`Driver keeps ${fmtNum(p.driver_share_pct)}% of fares`);
  if (c.hours) chips.push(`Hourly wage €${fmtNum(Number(p.hourly_rate) || 0)}/h`);
  if (c.fixed) chips.push(`Fixed wage €${fmtNum(Number(p.fixed_wage_weekly) || 0)}/week`);
  if (!c.share && !c.hours && !c.fixed) chips.push('No pay lines enabled');
  if (c.share && c.tips && p.tips_driver_pct !== 100) chips.push(`Tips ${fmtNum(p.tips_driver_pct)}% to driver`);
  if (!c.tips) chips.push('No tips line');
  if (c.share && c.campaigns && p.campaigns_driver_pct !== 100) chips.push(`Campaigns ${fmtNum(p.campaigns_driver_pct)}% to driver`);
  if (c.share && c.fee && p.fee_driver_pct !== 100) chips.push(`Driver pays ${fmtNum(p.fee_driver_pct)}% of platform fee`);
  if (c.tax) {
    chips.push(p.tax_type === 'percent' ? `Tax ${fmtNum(p.tax_value)}% of balance` : `Tax €${fmtNum(p.tax_value)} flat`);
  } else {
    chips.push('No tax line');
  }
  if (c.rent && p.rent_weekly > 0) chips.push(`Rent €${fmtNum(p.rent_weekly)}/week`);
  return chips;
}

export default function SettlementSettingsClient({ presets, defaultPresetId, drivers, platforms, recurring }: Props) {
  const router = useRouter();

  // 'new' = creating, a preset id = editing that preset, null = closed.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PresetForm>(EMPTY_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRow] = useTransition();

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setShowAdvanced(false);
    setEditing('new');
    setError('');
  };

  const openEdit = (p: SettlementPreset) => {
    setForm(formFromPreset(p));
    setShowAdvanced(p.tips_driver_pct !== 100 || p.campaigns_driver_pct !== 100 || p.fee_driver_pct !== 100);
    setEditing(p.id);
    setError('');
  };

  const set = (field: keyof PresetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const toggleComponent = (key: SettlementComponentKey) =>
    setForm((prev) => ({
      ...prev,
      components: { ...prev.components, [key]: !prev.components[key] },
    }));

  const applyTemplate = (components: SettlementComponents) =>
    setForm((prev) => ({ ...prev, components: { ...components } }));

  const savePreset = () => {
    setError('');
    startSaving(async () => {
      const input = inputFromForm(form);
      const res = editing === 'new'
        ? await createPresetAction(input)
        : await updatePresetAction(editing!, input);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      flash(editing === 'new' ? 'Preset created.' : 'Preset saved.');
      router.refresh();
    });
  };

  const removePreset = (p: SettlementPreset) => {
    if (!window.confirm(`Delete the "${p.name}" preset? Drivers using it will fall back to the fleet default.`)) {
      return;
    }
    setError('');
    setBusyId(p.id);
    startRow(async () => {
      const res = await deletePresetAction(p.id);
      setBusyId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      flash('Preset deleted.');
      router.refresh();
    });
  };

  const makeDefault = (p: SettlementPreset) => {
    setError('');
    setBusyId(p.id);
    startRow(async () => {
      const res = await setDefaultPresetAction(p.id);
      setBusyId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      flash(`"${p.name}" is now the fleet default.`);
      router.refresh();
    });
  };

  const assignDriver = (driverId: string, presetId: string | null) => {
    setError('');
    setBusyId(driverId);
    startRow(async () => {
      const res = await assignDriverPresetAction(driverId, presetId);
      setBusyId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      flash('Driver updated.');
      router.refresh();
    });
  };

  const defaultPreset = presets.find((p) => p.id === defaultPresetId) ?? null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>Settlements / Settlement Rules</div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Settlement Rules</h1>
          <Link href="/fleet/settlements/setup" className="btn btn-secondary btn-sm">
            ✨ Guided setup
          </Link>
        </div>
        <p className={styles.subtitle}>
          Create settlement presets — how fares, tips, tax and rent are split — then assign one to
          each driver. Changes only affect settlements you create from now on; existing settlements
          keep the numbers they were saved with.
        </p>
      </div>

      {notice && <div className={`${styles.message} ${styles.success}`}>{notice}</div>}
      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

      {/* Presets -------------------------------------------------------------- */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.presetHeadRow}>
            <div>
              <div className={styles.cardLabel}>Presets</div>
              <div className={styles.cardDesc}>
                A preset bundles everything about how a driver is paid. Most fleets need only one or
                two — e.g. a standard split and a fixed-rent deal.
              </div>
            </div>
            {editing === null && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
                + New preset
              </button>
            )}
          </div>
        </div>

        {presets.length === 0 && editing === null && (
          <div className={styles.empty}>
            No presets yet. Create your first one — drivers without a preset use the classic 50/50
            split until you do. New here?{' '}
            <Link href="/fleet/settlements/setup">Let the guided setup build it for you →</Link>
          </div>
        )}

        <div className={styles.presetList}>
          {presets.map((p) => {
            const isDefault = p.id === defaultPresetId;
            const isBusy = busyId === p.id;
            if (editing === p.id) {
              return (
                <PresetEditor
                  key={p.id}
                  form={form}
                  set={set}
                  toggleComponent={toggleComponent}
                  applyTemplate={applyTemplate}
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  saving={saving}
                  onSave={savePreset}
                  onCancel={() => setEditing(null)}
                />
              );
            }
            return (
              <div key={p.id} className={styles.presetCard}>
                <div className={styles.presetInfo}>
                  <div className={styles.presetName}>
                    {p.name}
                    {isDefault && <span className={styles.defaultBadge}>Fleet default</span>}
                  </div>
                  <div className={styles.chipRow}>
                    {presetChips(p).map((chip) => (
                      <span key={chip} className={styles.chip}>{chip}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.presetActions}>
                  {!isDefault && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={isBusy}
                      onClick={() => makeDefault(p)}
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={isBusy}
                    onClick={() => openEdit(p)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={isBusy}
                    onClick={() => removePreset(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {editing === 'new' && (
            <PresetEditor
              form={form}
              set={set}
              toggleComponent={toggleComponent}
              applyTemplate={applyTemplate}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              saving={saving}
              onSave={savePreset}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      </div>

      {/* Platforms ------------------------------------------------------------- */}
      <PlatformsCard
        platforms={platforms}
        onError={setError}
        onDone={(msg) => {
          flash(msg);
          router.refresh();
        }}
      />

      {/* Recurring deductions & bonuses --------------------------------------- */}
      <RecurringCard
        recurring={recurring}
        drivers={drivers}
        onError={setError}
        onDone={(msg) => {
          flash(msg);
          router.refresh();
        }}
      />

      {/* Driver assignment ----------------------------------------------------- */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardLabel}>Driver assignment</div>
          <div className={styles.cardDesc}>
            Each driver follows the fleet default
            {defaultPreset ? <> (<strong>{defaultPreset.name}</strong>)</> : null} unless you pick a
            different preset for them here.
          </div>
        </div>

        {drivers.length === 0 ? (
          <div className={styles.empty}>No active drivers yet.</div>
        ) : (
          <div className={styles.driverList}>
            {drivers.map((d) => {
              const assigned = d.presetId ? presets.find((p) => p.id === d.presetId) : null;
              const isBusy = busyId === d.id;
              return (
                <div key={d.id} className={styles.assignRow}>
                  <div className={styles.driverName}>{d.full_name}</div>
                  <select
                    className={styles.presetSelect}
                    value={d.presetId ?? ''}
                    disabled={isBusy || presets.length === 0}
                    onChange={(e) => assignDriver(d.id, e.target.value || null)}
                    aria-label={`${d.full_name} settlement preset`}
                  >
                    <option value="">
                      Fleet default{defaultPreset ? ` (${defaultPreset.name})` : ''}
                    </option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className={styles.effective}>
                    {assigned ? (
                      <>on <strong>{assigned.name}</strong></>
                    ) : (
                      <span className={styles.inheritTag}>default</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Preset editor (create + edit share the same form) ─── */

interface EditorProps {
  form: PresetForm;
  set: (field: keyof PresetForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  toggleComponent: (key: SettlementComponentKey) => void;
  applyTemplate: (components: SettlementComponents) => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** Does the current component set match a template exactly? (highlights the chip) */
function matchesTemplate(components: SettlementComponents, tpl: SettlementComponents): boolean {
  return (Object.keys(tpl) as SettlementComponentKey[]).every((k) => components[k] === tpl[k]);
}

function PresetEditor({
  form,
  set,
  toggleComponent,
  applyTemplate,
  showAdvanced,
  setShowAdvanced,
  saving,
  onSave,
  onCancel,
}: EditorProps) {
  const c = form.components;
  const hasAdvanced = c.share && (c.tips || c.campaigns || c.fee);

  return (
    <div className={styles.editorCard}>
      <div className={styles.editorGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Preset name</span>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Standard 50/50, Hourly crew, Fixed rent…"
            className={styles.textInput}
            maxLength={60}
          />
        </label>
      </div>

      {/* Pay-model templates: one click sets the checkboxes below */}
      <div className={styles.templateRow}>
        <span className={styles.templateLabel}>Start from:</span>
        {PAY_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={`${styles.templateBtn} ${matchesTemplate(c, tpl.components) ? styles.templateActive : ''}`}
            title={tpl.hint}
            onClick={() => applyTemplate(tpl.components)}
          >
            {tpl.label}
          </button>
        ))}
      </div>

      {/* Component toggles — which columns this preset calculates */}
      <div className={styles.compSection}>
        <div className={styles.compSectionTitle}>What counts in this settlement</div>
        <div className={styles.compSectionHint}>
          Tick the lines that apply to how these drivers are paid. Anything unticked disappears
          from the settlement form and is left out of the maths.
        </div>
        <div className={styles.compGroups}>
          {(['earnings', 'deductions'] as const).map((group) => (
            <div key={group} className={styles.compGroup}>
              <div className={styles.compGroupTitle}>
                {group === 'earnings' ? 'Driver earns' : 'Deducted from pay'}
              </div>
              {COMPONENT_META.filter((m) => m.group === group).map((m) => (
                <label key={m.key} className={styles.compItem}>
                  <input
                    type="checkbox"
                    checked={c[m.key]}
                    onChange={() => toggleComponent(m.key)}
                  />
                  <span className={styles.compText}>
                    <span className={styles.compLabel}>{m.label}</span>
                    <span className={styles.compHint}>{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Amounts for the enabled components */}
      <div className={styles.editorGrid}>
        {c.share && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Driver share of fares</span>
            <span className={styles.fieldControl}>
              <input
                type="number" min={0} max={100} step="0.5"
                value={form.driverSharePct}
                onChange={set('driverSharePct')}
                className={styles.pctInput}
              />
              <span className={styles.pctSuffix}>% to driver</span>
            </span>
            <span className={styles.fieldHint}>100% + a weekly rent below = rent-a-car model.</span>
          </label>
        )}

        {c.hours && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Hourly rate</span>
            <span className={styles.fieldControl}>
              <input
                type="number" min={0} step="0.5"
                value={form.hourlyRate}
                onChange={set('hourlyRate')}
                className={styles.pctInput}
              />
              <span className={styles.pctSuffix}>€ / hour</span>
            </span>
            <span className={styles.fieldHint}>
              Hours prefill automatically from the driver&apos;s clocked shifts — editable on each
              settlement before saving.
            </span>
          </label>
        )}

        {c.fixed && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Fixed weekly wage</span>
            <span className={styles.fieldControl}>
              <input
                type="number" min={0} step="1"
                value={form.fixedWageWeekly}
                onChange={set('fixedWageWeekly')}
                className={styles.pctInput}
              />
              <span className={styles.pctSuffix}>€ / week</span>
            </span>
            <span className={styles.fieldHint}>Added to every settlement under this preset.</span>
          </label>
        )}

        {c.tax && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>FSS / Tax</span>
            <span className={styles.fieldControl}>
              <select value={form.taxType} onChange={set('taxType')} className={styles.typeSelect}>
                <option value="flat">Flat €</option>
                <option value="percent">% of balance</option>
              </select>
              <input
                type="number" min={0} step="0.5"
                max={form.taxType === 'percent' ? 100 : undefined}
                value={form.taxValue}
                onChange={set('taxValue')}
                className={styles.pctInput}
              />
              <span className={styles.pctSuffix}>{form.taxType === 'percent' ? '%' : '€ / week'}</span>
            </span>
            <span className={styles.fieldHint}>
              Prefills the tax field on new settlements (flat tax applies to full-time drivers only).
              Still editable per settlement.
            </span>
          </label>
        )}

        {c.rent && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Weekly vehicle rent</span>
            <span className={styles.fieldControl}>
              <input
                type="number" min={0} step="1"
                value={form.rentWeekly}
                onChange={set('rentWeekly')}
                className={styles.pctInput}
              />
              <span className={styles.pctSuffix}>€ / week (0 = none)</span>
            </span>
            <span className={styles.fieldHint}>Deducted from every settlement under this preset.</span>
          </label>
        )}
      </div>

      {hasAdvanced && (
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▾' : '▸'} Advanced: tips, campaigns &amp; platform fee splits
        </button>
      )}

      {hasAdvanced && showAdvanced && (
        <div className={styles.editorGrid}>
          {c.tips && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Tips to driver</span>
              <span className={styles.fieldControl}>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={form.tipsPct}
                  onChange={set('tipsPct')}
                  className={styles.pctInput}
                />
                <span className={styles.pctSuffix}>% (100 = driver keeps all tips)</span>
              </span>
            </label>
          )}
          {c.campaigns && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Campaigns to driver</span>
              <span className={styles.fieldControl}>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={form.campaignsPct}
                  onChange={set('campaignsPct')}
                  className={styles.pctInput}
                />
                <span className={styles.pctSuffix}>% (100 = driver keeps all bonuses)</span>
              </span>
            </label>
          )}
          {c.fee && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Platform fee borne by driver</span>
              <span className={styles.fieldControl}>
                <input
                  type="number" min={0} max={100} step="0.5"
                  value={form.feePct}
                  onChange={set('feePct')}
                  className={styles.pctInput}
                />
                <span className={styles.pctSuffix}>% (100 = driver absorbs the full fee)</span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className={styles.editorActions}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save preset'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Platforms card ─── */

interface PlatformForm {
  name: string;
  feePct: string;
  icon: string;
  color: string;
}

const EMPTY_PLATFORM: PlatformForm = { name: '', feePct: '10', icon: '🚗', color: '#2bbd7e' };

function platformInput(f: PlatformForm): PlatformInput {
  return {
    name: f.name,
    default_fee_pct: parseFloat(f.feePct) || 0,
    icon: f.icon,
    color: f.color,
  };
}

interface PlatformsCardProps {
  platforms: OrgPlatform[];
  onError: (msg: string) => void;
  onDone: (msg: string) => void;
}

function PlatformsCard({ platforms, onError, onDone }: PlatformsCardProps) {
  // 'new' = adding, a platform id = editing, null = closed.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PlatformForm>(EMPTY_PLATFORM);
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRow] = useTransition();

  const set = (field: keyof PlatformForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const openNew = () => {
    setForm(EMPTY_PLATFORM);
    setEditing('new');
    onError('');
  };

  const openEdit = (p: OrgPlatform) => {
    setForm({ name: p.name, feePct: fmtNum(p.default_fee_pct), icon: p.icon, color: p.color });
    setEditing(p.id);
    onError('');
  };

  const save = () => {
    onError('');
    startSaving(async () => {
      const res = editing === 'new'
        ? await createPlatformAction(platformInput(form))
        : await updatePlatformAction(editing!, platformInput(form));
      if (res.error) {
        onError(res.error);
        return;
      }
      setEditing(null);
      onDone(editing === 'new' ? 'Platform added.' : 'Platform saved.');
    });
  };

  const toggleActive = (p: OrgPlatform) => {
    onError('');
    setBusyId(p.id);
    startRow(async () => {
      const res = await setPlatformActiveAction(p.id, !p.is_active);
      setBusyId(null);
      if (res.error) {
        onError(res.error);
        return;
      }
      onDone(p.is_active ? `${p.name} hidden from new settlements.` : `${p.name} re-enabled.`);
    });
  };

  const remove = (p: OrgPlatform) => {
    if (!window.confirm(`Delete ${p.name}? Saved settlements keep their figures; the platform just stops appearing on new ones.`)) {
      return;
    }
    onError('');
    setBusyId(p.id);
    startRow(async () => {
      const res = await deletePlatformAction(p.id);
      setBusyId(null);
      if (res.error) {
        onError(res.error);
        return;
      }
      onDone('Platform deleted.');
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.presetHeadRow}>
          <div>
            <div className={styles.cardLabel}>Platforms</div>
            <div className={styles.cardDesc}>
              The ride platforms your drivers work on. Each row on the settlement entry form comes
              from this list; the fee % is the default commission (editable per settlement).
            </div>
          </div>
          {editing === null && (
            <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
              + Add platform
            </button>
          )}
        </div>
      </div>

      <div className={styles.presetList}>
        {platforms.map((p) => {
          const isBusy = busyId === p.id;
          if (editing === p.id) {
            return (
              <PlatformEditor key={p.id} form={form} set={set} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
            );
          }
          return (
            <div key={p.id} className={`${styles.presetCard} ${!p.is_active ? styles.platformInactive : ''}`}>
              <div className={styles.presetInfo}>
                <div className={styles.presetName}>
                  <span>{p.icon}</span>
                  {p.name}
                  {!p.is_active && <span className={styles.inactiveBadge}>Hidden</span>}
                </div>
                <div className={styles.chipRow}>
                  <span className={styles.chip}>Default fee {fmtNum(p.default_fee_pct)}%</span>
                </div>
              </div>
              <div className={styles.presetActions}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => toggleActive(p)}>
                  {p.is_active ? 'Hide' : 'Show'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => openEdit(p)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {editing === 'new' && (
          <PlatformEditor form={form} set={set} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
        )}

        {platforms.length === 0 && editing === null && (
          <div className={styles.empty}>
            No platforms yet — the classic Bolt / Uber / Ecabs defaults are used until you add one
            (or apply the org platforms migration to seed them).
          </div>
        )}
      </div>
    </div>
  );
}

interface PlatformEditorProps {
  form: PlatformForm;
  set: (field: keyof PlatformForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function PlatformEditor({ form, set, saving, onSave, onCancel }: PlatformEditorProps) {
  return (
    <div className={styles.editorCard}>
      <div className={styles.editorGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Platform name</span>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Bolt, Uber, eCabs…"
            className={styles.textInput}
            maxLength={40}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Default fee</span>
          <span className={styles.fieldControl}>
            <input
              type="number" min={0} max={100} step="0.5"
              value={form.feePct}
              onChange={set('feePct')}
              className={styles.pctInput}
            />
            <span className={styles.pctSuffix}>% commission</span>
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Icon (emoji)</span>
          <input
            type="text"
            value={form.icon}
            onChange={set('icon')}
            className={styles.iconInput}
            maxLength={4}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Color</span>
          <input
            type="color"
            value={form.color}
            onChange={set('color')}
            className={styles.colorInput}
          />
        </label>
      </div>
      <div className={styles.editorActions}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save platform'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Recurring deductions & bonuses card ─── */

const RECURRING_TYPES: AdjustmentType[] = ['deduction', 'expense', 'bonus', 'reimbursement'];
const ADJ_TYPE_LABELS: Record<AdjustmentType, string> = {
  expense: 'Expense',
  deduction: 'Deduction',
  bonus: 'Bonus',
  reimbursement: 'Reimbursement',
  other: 'Other',
};
const DEDUCTION_TYPES: AdjustmentType[] = ['deduction', 'expense'];

interface RecurringForm {
  description: string;
  type: AdjustmentType;
  amountType: RecurringAmountType;
  amount: string;
  driverId: string; // '' = all drivers
  startDate: string;
  endDate: string;
}

function emptyRecurringForm(): RecurringForm {
  // Local date (YYYY-MM-DD) without pulling in a date lib.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    description: '',
    type: 'deduction',
    amountType: 'fixed',
    amount: '0',
    driverId: '',
    startDate: today,
    endDate: '',
  };
}

function recurringInput(f: RecurringForm): RecurringAdjustmentInput {
  return {
    driver_id: f.driverId || null,
    type: f.type,
    amount_type: f.amountType,
    amount: parseFloat(f.amount) || 0,
    description: f.description,
    start_date: f.startDate,
    end_date: f.endDate || null,
    active: true,
  };
}

interface RecurringCardProps {
  recurring: RecurringAdjustment[];
  drivers: DriverPresetRow[];
  onError: (msg: string) => void;
  onDone: (msg: string) => void;
}

function RecurringCard({ recurring, drivers, onError, onDone }: RecurringCardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<RecurringForm>(emptyRecurringForm);
  const [saving, startSaving] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startRow] = useTransition();

  const driverName = (id: string | null) =>
    id ? (drivers.find((d) => d.id === id)?.full_name ?? 'Unknown driver') : 'All drivers';

  const set = <K extends keyof RecurringForm>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value as RecurringForm[K] }));

  const openNew = () => {
    setForm(emptyRecurringForm());
    setEditing('new');
    onError('');
  };

  const openEdit = (r: RecurringAdjustment) => {
    setForm({
      description: r.description,
      type: r.type,
      amountType: r.amount_type,
      amount: fmtNum(r.amount),
      driverId: r.driver_id ?? '',
      startDate: r.start_date,
      endDate: r.end_date ?? '',
    });
    setEditing(r.id);
    onError('');
  };

  const save = () => {
    onError('');
    startSaving(async () => {
      const res = editing === 'new'
        ? await createRecurringAdjustmentAction(recurringInput(form))
        : await updateRecurringAdjustmentAction(editing!, recurringInput(form));
      if (res.error) {
        onError(res.error);
        return;
      }
      setEditing(null);
      onDone(editing === 'new' ? 'Rule created.' : 'Rule saved.');
    });
  };

  const toggleActive = (r: RecurringAdjustment) => {
    onError('');
    setBusyId(r.id);
    startRow(async () => {
      const res = await setRecurringAdjustmentActiveAction(r.id, !r.active);
      setBusyId(null);
      if (res.error) {
        onError(res.error);
        return;
      }
      onDone(r.active ? 'Rule paused.' : 'Rule resumed.');
    });
  };

  const remove = (r: RecurringAdjustment) => {
    if (!window.confirm(`Delete "${r.description}"? Settlements already created keep the amounts it generated; only future ones stop getting it.`)) {
      return;
    }
    onError('');
    setBusyId(r.id);
    startRow(async () => {
      const res = await deleteRecurringAdjustmentAction(r.id);
      setBusyId(null);
      if (res.error) {
        onError(res.error);
        return;
      }
      onDone('Rule deleted.');
    });
  };

  const amountChip = (r: RecurringAdjustment) =>
    r.amount_type === 'percent_of_gross' ? `${fmtNum(r.amount)}% of gross` : `€${fmtNum(r.amount)}`;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.presetHeadRow}>
          <div>
            <div className={styles.cardLabel}>Recurring deductions &amp; bonuses</div>
            <div className={styles.cardDesc}>
              Define a charge or bonus once and it&apos;s added to every settlement automatically —
              e.g. a weekly insurance contribution or a standing bonus. Editing a rule only affects
              settlements created from now on.
            </div>
          </div>
          {editing === null && (
            <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>
              + New rule
            </button>
          )}
        </div>
      </div>

      <div className={styles.presetList}>
        {recurring.map((r) => {
          const isBusy = busyId === r.id;
          if (editing === r.id) {
            return (
              <RecurringEditor key={r.id} form={form} set={set} drivers={drivers} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
            );
          }
          const isCharge = DEDUCTION_TYPES.includes(r.type);
          return (
            <div key={r.id} className={`${styles.presetCard} ${!r.active ? styles.platformInactive : ''}`}>
              <div className={styles.presetInfo}>
                <div className={styles.presetName}>
                  {r.description}
                  {!r.active && <span className={styles.inactiveBadge}>Paused</span>}
                </div>
                <div className={styles.chipRow}>
                  <span className={styles.chip}>{isCharge ? '−' : '+'} {amountChip(r)}</span>
                  <span className={styles.chip}>{ADJ_TYPE_LABELS[r.type]}</span>
                  <span className={styles.chip}>{driverName(r.driver_id)}</span>
                  {r.end_date && <span className={styles.chip}>until {r.end_date}</span>}
                </div>
              </div>
              <div className={styles.presetActions}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => toggleActive(r)}>
                  {r.active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => openEdit(r)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}

        {editing === 'new' && (
          <RecurringEditor form={form} set={set} drivers={drivers} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
        )}

        {recurring.length === 0 && editing === null && (
          <div className={styles.empty}>
            No recurring rules yet. Add one to stop re-typing the same weekly deduction or bonus for
            every driver.
          </div>
        )}
      </div>
    </div>
  );
}

interface RecurringEditorProps {
  form: RecurringForm;
  set: <K extends keyof RecurringForm>(field: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  drivers: DriverPresetRow[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function RecurringEditor({ form, set, drivers, saving, onSave, onCancel }: RecurringEditorProps) {
  return (
    <div className={styles.editorCard}>
      <div className={styles.editorGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            placeholder="e.g. Weekly insurance, Vehicle rent…"
            className={styles.textInput}
            maxLength={120}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select value={form.type} onChange={set('type')} className={styles.presetSelect}>
            {RECURRING_TYPES.map((t) => (
              <option key={t} value={t}>{ADJ_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <span className={styles.fieldHint}>Deduction/Expense reduces pay; Bonus/Reimbursement increases it.</span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Amount</span>
          <span className={styles.fieldControl}>
            <select value={form.amountType} onChange={set('amountType')} className={styles.typeSelect}>
              <option value="fixed">Fixed €</option>
              <option value="percent_of_gross">% of gross</option>
            </select>
            <input
              type="number" min={0} step="0.5"
              max={form.amountType === 'percent_of_gross' ? 100 : undefined}
              value={form.amount}
              onChange={set('amount')}
              className={styles.pctInput}
            />
            <span className={styles.pctSuffix}>{form.amountType === 'percent_of_gross' ? '% of gross' : '€ / settlement'}</span>
          </span>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Applies to</span>
          <select value={form.driverId} onChange={set('driverId')} className={styles.presetSelect}>
            <option value="">All drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Start date</span>
          <input type="date" value={form.startDate} onChange={set('startDate')} className={styles.presetSelect} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>End date (optional)</span>
          <input type="date" value={form.endDate} onChange={set('endDate')} className={styles.presetSelect} />
          <span className={styles.fieldHint}>Leave blank to run indefinitely.</span>
        </label>
      </div>

      <div className={styles.editorActions}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save rule'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
