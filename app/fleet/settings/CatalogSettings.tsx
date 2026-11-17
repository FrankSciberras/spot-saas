'use client';

import { useState } from 'react';
import { useEnabledModules } from '@/components/fleet/FleetModulesProvider';
import { useSettingsAdmin } from '@/components/fleet/FleetSettingsProvider';
import { settingsForTab } from '@/lib/settings/catalog';
import {
  formatSettingValue,
  type NumberSettingDef,
  type SelectSettingDef,
  type SettingDef,
  type SettingsTabKey,
  type StoredValue,
} from '@/lib/settings/types';
import { SettingsSection, ToggleCard, type Notify } from './SettingsParts';
import styles from './settings.module.css';

// =============================================================================
// Draws every setting the catalog (lib/settings/catalog.ts) puts on a tab —
// grouped by section, with the right control for its type. Adding a setting to
// the catalog is enough for it to show up here; nothing in this file changes.
// =============================================================================

type Entry = { key: string; def: SettingDef };

/** True when a tab has at least one catalog setting this person can see. */
export function useHasCatalogSettings(tab: SettingsTabKey, isAdmin: boolean): boolean {
  const modules = useEnabledModules();
  return visible(settingsForTab(tab), modules, isAdmin).length > 0;
}

function visible(entries: Entry[], modules: ReadonlySet<string>, isAdmin: boolean) {
  return entries.filter(
    ({ def }) => !def.ownPanel && (def.scope === 'user' || isAdmin) && (!def.module || modules.has(def.module))
  );
}

export default function CatalogSettings({
  tab,
  isAdmin,
  notify,
  /** Section titles a hand-written panel on this tab already uses: catalog cards join them. */
  skipSections = [],
}: {
  tab: SettingsTabKey;
  isAdmin: boolean;
  notify: Notify;
  skipSections?: string[];
}) {
  const modules = useEnabledModules();
  const entries = visible(settingsForTab(tab), modules, isAdmin).filter((e) => !skipSections.includes(e.def.section));
  const sections = Array.from(new Set(entries.map((e) => e.def.section)));
  if (!entries.length) return null;
  return (
    <>
      {sections.map((section) => (
        <SettingsSection key={section} title={section}>
          {entries.filter((e) => e.def.section === section).map((e) => (
            <CatalogCard key={e.key} entry={e} notify={notify} />
          ))}
        </SettingsSection>
      ))}
    </>
  );
}

/** Catalog cards for one section, for a hand-written panel to place under its own cards. */
export function CatalogSection({ tab, section, isAdmin, notify }: { tab: SettingsTabKey; section: string; isAdmin: boolean; notify: Notify }) {
  const modules = useEnabledModules();
  const entries = visible(settingsForTab(tab), modules, isAdmin).filter((e) => e.def.section === section);
  return (
    <>
      {entries.map((e) => (
        <CatalogCard key={e.key} entry={e} notify={notify} />
      ))}
    </>
  );
}

function CatalogCard({ entry: { key, def }, notify }: { entry: Entry; notify: Notify }) {
  const { fleet, prefs, saveFleet, savePrefs } = useSettingsAdmin();
  const state = def.scope === 'fleet' ? fleet : prefs;
  const save = def.scope === 'fleet' ? saveFleet : savePrefs;
  const value = (state.values as unknown as Record<string, StoredValue>)[key];
  const changed = state.overridden.includes(key);
  const [saving, setSaving] = useState(false);

  const commit = async (next: StoredValue | null) => {
    setSaving(true);
    const error = await save({ [key]: next });
    setSaving(false);
    if (error) notify('error', error);
    else notify('success', next === null ? `${def.label}: back to the default (${formatSettingValue(def, def.default)})` : `${def.label}: ${formatSettingValue(def, next)}`);
  };

  const footer = (
    <CardFooter
      def={def}
      changed={changed}
      saving={saving}
      onReset={() => commit(null)}
    />
  );

  if (def.type === 'boolean') {
    return (
      <ToggleCard
        icon={def.icon}
        label={def.label}
        description={def.description}
        checked={value === true}
        onToggle={() => commit(!value)}
        saving={saving}
        onLabel={def.onLabel}
        offLabel={def.offLabel}
      >
        {footer}
      </ToggleCard>
    );
  }

  return (
    <div className={styles.settingCard}>
      <div className={styles.settingIcon} aria-hidden>{def.icon}</div>
      <div className={styles.settingContent}>
        <div className={styles.settingLabel}>{def.label}</div>
        <div className={styles.settingDescription}>{def.description}</div>
        {def.type === 'number' && (
          <NumberField key={String(value)} def={def} value={value as number} saving={saving} onSave={commit} />
        )}
        {def.type === 'select' && def.options.length > 3 && (
          <div className={styles.inlineFields}>
            <select
              className={styles.selectInput}
              value={String(value)}
              disabled={saving}
              aria-label={def.label}
              onChange={(e) => commit(e.target.value)}
            >
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
        {footer}
      </div>
      {/* A dropdown already shows its value, so it gets nothing on the right. */}
      {!(def.type === 'select' && def.options.length > 3) && (
        <div className={styles.settingAction}>
          {def.type === 'select' ? (
            <Segmented def={def} value={String(value)} saving={saving} onPick={commit} />
          ) : (
            <span className={styles.statusLabel}>{formatSettingValue(def, value)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function CardFooter({ def, changed, saving, onReset }: { def: SettingDef; changed: boolean; saving: boolean; onReset: () => void }) {
  if (!changed && !def.usedOn) return null;
  return (
    <div className={styles.settingMeta}>
      {def.usedOn && <span>Used on {def.usedOn}</span>}
      {def.usedOn && changed && <span aria-hidden> · </span>}
      {changed && (
        <>
          Default is {formatSettingValue(def, def.default)}
          <span aria-hidden> · </span>
          <button type="button" className={styles.linkButton} onClick={onReset} disabled={saving}>
            Reset to default
          </button>
        </>
      )}
    </div>
  );
}

function NumberField({ def, value, saving, onSave }: { def: NumberSettingDef; value: number; saving: boolean; onSave: (v: StoredValue) => void }) {
  const [draft, setDraft] = useState(String(value));
  const dirty = draft.trim() !== String(value);
  return (
    <form
      className={styles.inlineFields}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && draft.trim() !== '') onSave(Number(draft));
      }}
    >
      <label className={styles.inlineField}>
        <input
          className={styles.numInput}
          // Room for coordinates like -33.8688.
          style={def.step < 1 ? { width: 112 } : undefined}
          type="number"
          inputMode="decimal"
          min={def.min}
          max={def.max}
          step={def.step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`${def.label} (${def.unit})`}
          required
        />
        {def.unit}
      </label>
      <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

function Segmented({ def, value, saving, onPick }: { def: SelectSettingDef; value: string; saving: boolean; onPick: (v: StoredValue) => void }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={def.label}>
      {def.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-active={value === o.value ? 'true' : undefined}
          className={styles.segment}
          disabled={saving}
          onClick={() => { if (value !== o.value) onPick(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
