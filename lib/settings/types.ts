// =============================================================================
// SETTINGS ENGINE — types and value checking (no server imports; safe anywhere)
// =============================================================================
// A setting is described once, in lib/settings/catalog.ts. From that one entry
// the app gets: its default, how to validate a new value, where it shows on
// /fleet/settings (tab + section) and which control draws it. Values people
// change are stored as overrides (org_settings / user_preferences); everything
// else falls back to the default here.
// =============================================================================

/** fleet = one value for the whole fleet (admins set it); user = personal. */
export type SettingScope = 'fleet' | 'user';

/** Tabs on /fleet/settings. Order here is the order of the tab bar. */
export const SETTINGS_TABS = [
  { key: 'general', label: 'General' },
  { key: 'branding', label: 'Branding' },
  { key: 'drivers', label: 'Drivers & documents' },
  { key: 'vehicles', label: 'Vehicles & maintenance', module: 'maintenance' },
  { key: 'live-map', label: 'Live Map', module: 'tracking' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'messages', label: 'Messages', module: 'messaging' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'settlements', label: 'Settlements', module: 'settlements' },
  { key: 'preferences', label: 'Preferences', everyone: true },
] as const satisfies readonly { key: string; label: string; module?: string; everyone?: boolean }[];

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]['key'];

interface BaseDef {
  scope: SettingScope;
  tab: SettingsTabKey;
  /** Section heading inside the tab; settings sharing one are grouped. */
  section: string;
  label: string;
  description: string;
  /** Emoji shown on the card, like the hand-written setting cards. */
  icon: string;
  /** Only show while this fleet module is on (lib/modules/catalog.ts). */
  module?: string;
  /** Where the setting takes effect, shown under the card ("Used on …"). */
  usedOn?: string;
}

export interface BooleanSettingDef extends BaseDef {
  type: 'boolean';
  default: boolean;
  onLabel?: string;
  offLabel?: string;
}

export interface NumberSettingDef extends BaseDef {
  type: 'number';
  default: number;
  min: number;
  max: number;
  /** Values are rounded to this step (1 = whole numbers). */
  step: number;
  /** Shown after the input, e.g. "days". */
  unit: string;
}

export interface SelectSettingDef extends BaseDef {
  type: 'select';
  default: string;
  options: readonly { value: string; label: string }[];
}

export type SettingDef = BooleanSettingDef | NumberSettingDef | SelectSettingDef;

/** Plain JSON value as stored in the jsonb column. */
export type StoredValue = boolean | number | string;

/**
 * Returns the value if it is valid for this setting, otherwise undefined.
 * Numbers are rounded to the setting's step; anything out of range, of the
 * wrong type, or not one of a select's options is rejected.
 */
export function coerceSettingValue(def: SettingDef, raw: unknown): StoredValue | undefined {
  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined;
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return undefined;
      const stepped = Math.round(n / def.step) * def.step;
      // Undo float noise from the division (0.1 steps etc.).
      const rounded = Number(stepped.toFixed(6));
      return rounded >= def.min && rounded <= def.max ? rounded : undefined;
    }
    case 'select':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw) ? raw : undefined;
  }
}

/** Why a value was rejected, in words an admin understands. */
export function settingValueError(def: SettingDef): string {
  switch (def.type) {
    case 'boolean':
      return `${def.label} must be on or off.`;
    case 'number':
      return `${def.label} must be between ${def.min} and ${def.max}${def.unit ? ` ${def.unit}` : ''}.`;
    case 'select':
      return `${def.label} must be one of: ${def.options.map((o) => o.label).join(', ')}.`;
  }
}

/** Human-readable version of a value ("30 days", "On", "Monday"). */
export function formatSettingValue(def: SettingDef, value: StoredValue): string {
  switch (def.type) {
    case 'boolean':
      return value ? def.onLabel ?? 'On' : def.offLabel ?? 'Off';
    case 'number':
      return `${value}${def.unit ? ` ${def.unit}` : ''}`;
    case 'select':
      return def.options.find((o) => o.value === value)?.label ?? String(value);
  }
}
