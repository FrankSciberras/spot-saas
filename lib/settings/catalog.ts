// =============================================================================
// SETTINGS CATALOG — the one list of fleet settings and personal preferences
// =============================================================================
// Works like the modules catalog (lib/modules/catalog.ts): every setting is
// described here once; the database (org_settings / user_preferences) only
// stores values someone changed. So adding a setting is:
//
//   1. Add an entry below — a stable dotted `key` (never rename it once
//      shipped), scope, tab + section, type, default and limits.
//   2. Read it where it takes effect:
//        server / cron:  (await getFleetSettings(orgId))['your.key']
//        client page:    useFleetSetting('your.key') / usePreference('your.key')
//   3. That's it — /fleet/settings draws the control from this entry, the save
//      action validates against it, and fleets that never touch it get the
//      default. No migration.
//
// Settings that predate this (shift check, live tracking, speed limit, chat
// DMs, push prompt) are still columns on `organizations` with their own panels.
// =============================================================================

import { coerceSettingValue, type SettingDef, type SettingsTabKey, type StoredValue } from './types';

export const SETTINGS = {
  // ---------------------------------------------------------------------------
  // PERSONAL PREFERENCES (scope: user) — Settings → Preferences
  // ---------------------------------------------------------------------------
  'appearance.theme': {
    scope: 'user',
    tab: 'preferences',
    section: 'Appearance',
    icon: '🌓',
    label: 'Theme',
    description: 'Dark or light dashboard. Follows you to any device you sign in on.',
    type: 'select',
    default: 'dark',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' },
    ],
  },
  'navigation.start_page': {
    scope: 'user',
    tab: 'preferences',
    section: 'Navigation',
    icon: '🏁',
    label: 'Start page',
    description: 'The page Rovora opens on after you sign in.',
    type: 'select',
    default: 'dashboard',
    options: [
      { value: 'dashboard', label: 'Dashboard' },
      { value: 'tracking', label: 'Live Map' },
      { value: 'shifts', label: 'Shifts' },
      { value: 'drivers', label: 'Drivers' },
      { value: 'vehicles', label: 'Vehicles' },
      { value: 'messages', label: 'Messages' },
    ],
  },
} as const satisfies Record<string, SettingDef>;

// -----------------------------------------------------------------------------
// Types derived from the catalog — so `getFleetSettings(org)['x.y']` is typed.
// -----------------------------------------------------------------------------

type Catalog = typeof SETTINGS;
export type SettingKey = keyof Catalog;

type ValueOf<D> = D extends { type: 'boolean' }
  ? boolean
  : D extends { type: 'number' }
    ? number
    : D extends { options: readonly { value: infer V }[] }
      ? V
      : never;

export type FleetSettingKey = { [K in SettingKey]: Catalog[K]['scope'] extends 'fleet' ? K : never }[SettingKey];
export type UserPreferenceKey = { [K in SettingKey]: Catalog[K]['scope'] extends 'user' ? K : never }[SettingKey];

export type FleetSettings = { [K in FleetSettingKey]: ValueOf<Catalog[K]> };
export type UserPreferences = { [K in UserPreferenceKey]: ValueOf<Catalog[K]> };

const ENTRIES = Object.entries(SETTINGS) as [SettingKey, SettingDef][];

export const FLEET_SETTING_KEYS = ENTRIES.filter(([, d]) => d.scope === 'fleet').map(([k]) => k);
export const USER_SETTING_KEYS = ENTRIES.filter(([, d]) => d.scope === 'user').map(([k]) => k);

const defaultsFor = <T,>(keys: SettingKey[]) => Object.fromEntries(keys.map((k) => [k, SETTINGS[k].default])) as T;
export const FLEET_DEFAULTS = defaultsFor<FleetSettings>(FLEET_SETTING_KEYS);
export const USER_DEFAULTS = defaultsFor<UserPreferences>(USER_SETTING_KEYS);

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

/** Catalog entries on one Settings tab, in catalog order. */
export function settingsForTab(tab: SettingsTabKey): { key: SettingKey; def: SettingDef }[] {
  return ENTRIES.filter(([, d]) => d.tab === tab).map(([key, def]) => ({ key, def }));
}

/**
 * Merges stored rows over the defaults. Rows for unknown keys, keys of the
 * wrong scope, or values that no longer validate are ignored (the default is
 * used), so a stale row can never break a page.
 */
export function resolveSettings<T>(keys: SettingKey[], rows: { key: string; value: unknown }[]): { values: T; overridden: string[] } {
  const values: Record<string, StoredValue> = Object.fromEntries(keys.map((k) => [k, SETTINGS[k].default]));
  const allowed = new Set<string>(keys);
  const overridden: string[] = [];
  for (const row of rows) {
    if (!allowed.has(row.key) || !isSettingKey(row.key)) continue;
    const def: SettingDef = SETTINGS[row.key];
    const v = coerceSettingValue(def, row.value);
    if (v === undefined || v === def.default) continue;
    values[row.key] = v;
    overridden.push(row.key);
  }
  return { values: values as T, overridden };
}
