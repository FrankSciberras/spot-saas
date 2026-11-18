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
  // GENERAL — money (scope: fleet). Formatting lives in lib/money.ts.
  // ---------------------------------------------------------------------------
  'finance.currency': {
    scope: 'fleet',
    tab: 'general',
    section: 'Money',
    icon: '💱',
    label: 'Currency',
    description:
      'The currency your fleet is paid and pays in. Settlements, payslip PDFs, bookkeeping, adjustments and the dashboard show amounts in it. Changing it only changes the symbol — amounts already recorded are not converted.',
    usedOn: 'settlements and their PDFs, bookkeeping, financials, adjustments, services, parts and the driver app',
    type: 'select',
    default: 'EUR',
    // Only currencies whose symbols the PDF font (Geist) can print.
    options: [
      { value: 'EUR', label: 'Euro (€)' },
      { value: 'GBP', label: 'British pound (£)' },
      { value: 'USD', label: 'US dollar ($)' },
      { value: 'CHF', label: 'Swiss franc (CHF)' },
      { value: 'SEK', label: 'Swedish krona (kr)' },
      { value: 'NOK', label: 'Norwegian krone (kr)' },
      { value: 'DKK', label: 'Danish krone (kr)' },
      { value: 'PLN', label: 'Polish złoty (zł)' },
      { value: 'CZK', label: 'Czech koruna (Kč)' },
      { value: 'HUF', label: 'Hungarian forint (Ft)' },
      { value: 'RON', label: 'Romanian leu (lei)' },
      { value: 'AUD', label: 'Australian dollar ($)' },
      { value: 'CAD', label: 'Canadian dollar ($)' },
      { value: 'NZD', label: 'New Zealand dollar ($)' },
      { value: 'ZAR', label: 'South African rand (R)' },
      { value: 'AED', label: 'UAE dirham (AED)' },
      { value: 'SAR', label: 'Saudi riyal (SAR)' },
      { value: 'INR', label: 'Indian rupee (₹)' },
      { value: 'SGD', label: 'Singapore dollar ($)' },
      { value: 'BRL', label: 'Brazilian real (R$)' },
      { value: 'MXN', label: 'Mexican peso ($)' },
    ],
  },
  'finance.number_format': {
    scope: 'fleet',
    tab: 'general',
    section: 'Money',
    icon: '🔢',
    label: 'Number style',
    description: 'How amounts are written: which mark separates thousands and decimals, and where the currency symbol goes.',
    usedOn: 'everywhere amounts are shown, including PDFs',
    type: 'select',
    default: 'en-IE',
    options: [
      { value: 'en-IE', label: '€1,234.56 — UK, Ireland, Malta' },
      { value: 'en-US', label: '$1,234.56 — US' },
      { value: 'de-DE', label: '1.234,56 € — Germany, Italy, Spain…' },
      { value: 'fr-FR', label: '1 234,56 € — France, Nordics…' },
      { value: 'de-CH', label: 'CHF 1’234.56 — Switzerland' },
    ],
  },

  // ---------------------------------------------------------------------------
  // DRIVERS & DOCUMENTS (scope: fleet)
  // ---------------------------------------------------------------------------
  'documents.expiry_warning_days': {
    scope: 'fleet',
    tab: 'drivers',
    section: 'Document expiry',
    icon: '📄',
    label: 'Warn before a document expires',
    description:
      'ID cards, licences, police conduct, insurance and road licences turn amber this many days before they expire, and show in “Expiring soon” on the dashboard. Alert rules that don’t set their own number of days use it too.',
    usedOn: 'the dashboard, driver and vehicle profiles, the Drivers list, the driver app and document alerts',
    type: 'number',
    default: 30,
    min: 7,
    max: 180,
    step: 1,
    unit: 'days',
  },
  'documents.urgent_days': {
    scope: 'fleet',
    tab: 'drivers',
    section: 'Document expiry',
    icon: '🚨',
    label: 'Urgent when this close',
    description: 'Documents expiring within this many days are shown in red instead of amber.',
    usedOn: 'the dashboard',
    type: 'number',
    default: 7,
    min: 1,
    max: 60,
    step: 1,
    unit: 'days',
  },
  'documents.expired_alert_days': {
    scope: 'fleet',
    tab: 'drivers',
    section: 'Document expiry',
    icon: '⌛',
    label: 'Keep alerting about expired documents for',
    description:
      'A document that has already expired still raises one “Expired” alert if it lapsed within this many days. Older ones are treated as no longer in use.',
    usedOn: 'document alerts (Notifications → rules)',
    type: 'number',
    default: 90,
    min: 7,
    max: 365,
    step: 1,
    unit: 'days',
  },

  // ---------------------------------------------------------------------------
  // VEHICLES & MAINTENANCE (scope: fleet)
  // ---------------------------------------------------------------------------
  'maintenance.service_due_km': {
    scope: 'fleet',
    tab: 'vehicles',
    section: 'Servicing',
    icon: '🔧',
    label: 'Service due soon within',
    description:
      'A vehicle counts as “service due soon” when it is this close to its next service mileage: it turns amber on the Services page and its profile, and the start-of-shift check warns you. Service alert rules without their own distance use it too.',
    usedOn: 'Services, vehicle profiles, the start-of-shift service check and service alerts',
    module: 'maintenance',
    type: 'number',
    default: 2000,
    min: 100,
    max: 20000,
    step: 100,
    unit: 'km',
  },

  // ---------------------------------------------------------------------------
  // SHIFTS (scope: fleet) — what drivers do to start and end a shift
  // ---------------------------------------------------------------------------
  'shifts.check_dashcam': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Starting a shift',
    icon: '📹',
    label: 'Dashcam check',
    description: 'Drivers must tick “Dashcam working & positioned” before going online. Turn off if your vehicles don’t have dashcams.',
    usedOn: 'Go online (driver app)',
    type: 'boolean',
    default: true,
    onLabel: 'Asked',
    offLabel: 'Not asked',
  },
  'shifts.check_interior': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Starting a shift',
    icon: '🧽',
    label: 'Interior check',
    description: 'Drivers must tick “Interior clean & no damage” before going online.',
    usedOn: 'Go online (driver app)',
    type: 'boolean',
    default: true,
    onLabel: 'Asked',
    offLabel: 'Not asked',
  },
  'shifts.start_photos': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Starting a shift',
    icon: '📷',
    label: 'Vehicle photos at the start',
    description: 'Front, left, right and back photos when going online. Required: the shift can’t start without all four. Off: the photo section is hidden.',
    usedOn: 'Go online (driver app)',
    type: 'select',
    default: 'optional',
    options: [
      { value: 'optional', label: 'Optional' },
      { value: 'required', label: 'Required' },
      { value: 'off', label: 'Off' },
    ],
  },
  'shifts.end_photos': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Ending a shift',
    icon: '🖼️',
    label: 'Vehicle photos at the end',
    description: 'Photos of the vehicle when ending a shift. Required: at least one photo before the shift can end. Off: the photo section is hidden.',
    usedOn: 'End shift (driver app)',
    type: 'select',
    default: 'optional',
    options: [
      { value: 'optional', label: 'Optional' },
      { value: 'required', label: 'Required' },
      { value: 'off', label: 'Off' },
    ],
  },
  'shifts.end_mileage': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Ending a shift',
    icon: '🧮',
    label: 'Odometer reading at the end',
    description: 'Whether drivers must enter the vehicle’s mileage when they end a shift. Kilometres driven and service-due checks need it.',
    usedOn: 'End shift (driver app)',
    type: 'select',
    default: 'required',
    options: [
      { value: 'required', label: 'Required' },
      { value: 'optional', label: 'Optional' },
    ],
  },
  'shifts.auto_close_hours': {
    scope: 'fleet',
    tab: 'shifts',
    section: 'Forgotten shifts',
    icon: '🛑',
    label: 'End any shift still open after',
    description:
      'Safety net while the “Still on shift?” check is off: a shift still open this long after it started is ended automatically, and you and the driver are told.',
    type: 'number',
    default: 24,
    min: 12,
    max: 72,
    step: 1,
    unit: 'hours',
  },

  // ---------------------------------------------------------------------------
  // LIVE MAP & SAFETY (scope: fleet; Live Tracking module)
  // ---------------------------------------------------------------------------
  'safety.good_score': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Safety scores',
    icon: '🟢',
    label: '“Good” from',
    description: 'Driver safety scores (0–100) at or above this are Good, shown in green.',
    usedOn: 'Safety and each driver’s safety page',
    module: 'tracking',
    type: 'number',
    default: 90,
    min: 50,
    max: 100,
    step: 1,
    unit: 'points',
  },
  'safety.fair_score': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Safety scores',
    icon: '🟡',
    label: '“Fair” from',
    description: 'Scores at or above this (and below Good) are Fair, in amber. Anything lower is “Needs attention”, in red.',
    usedOn: 'Safety and each driver’s safety page',
    module: 'tracking',
    type: 'number',
    default: 70,
    min: 0,
    max: 99,
    step: 1,
    unit: 'points',
  },
  'safety.weekly_report': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Safety scores',
    icon: '🗓️',
    label: 'Weekly safety report',
    description: 'Every Monday morning, admins get a notification with last week’s average safety score, the lowest-scoring driver and the number of harsh-driving and speeding events.',
    module: 'tracking',
    type: 'boolean',
    default: true,
    onLabel: 'Sent',
    offLabel: 'Off',
  },
  'tracking.map_center_lat': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Map',
    icon: '🧭',
    label: 'Map starts at latitude',
    description: 'Where the Live Map opens before any driver is sharing their location. Tip: right-click your depot in Google Maps to copy its latitude and longitude.',
    usedOn: 'Live Map and safety event maps',
    module: 'tracking',
    type: 'number',
    default: 35.9,
    min: -85,
    max: 85,
    step: 0.0001,
    unit: '°',
    // Set by moving a map (MapStartPicker on the Live Map tab), not typed in.
    ownPanel: true,
  },
  'tracking.map_center_lng': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Map',
    icon: '🧭',
    label: 'Map starts at longitude',
    description: 'East–west position of the starting view (negative = west of Greenwich).',
    usedOn: 'Live Map and safety event maps',
    module: 'tracking',
    type: 'number',
    default: 14.42,
    min: -180,
    max: 180,
    step: 0.0001,
    unit: '°',
    // Set by moving a map (MapStartPicker on the Live Map tab), not typed in.
    ownPanel: true,
  },
  'tracking.map_zoom': {
    scope: 'fleet',
    tab: 'live-map',
    section: 'Map',
    icon: '🔍',
    label: 'Starting zoom',
    description: 'How close the starting view is: about 6 shows a country, 11 a city, 14 a neighbourhood.',
    usedOn: 'Live Map and safety event maps',
    module: 'tracking',
    type: 'number',
    default: 11,
    min: 3,
    max: 18,
    step: 1,
    unit: '',
    // Set by moving a map (MapStartPicker on the Live Map tab), not typed in.
    ownPanel: true,
  },

  // ---------------------------------------------------------------------------
  // PERSONAL PREFERENCES (scope: user) — Settings → Preferences
  // ---------------------------------------------------------------------------
  'appearance.theme': {
    scope: 'user',
    tab: 'preferences',
    section: 'Appearance',
    icon: '🌓',
    label: 'Theme',
    description: 'Dark or light dashboard, or follow your device. Saved to your account, so it follows you to any device you sign in on.',
    type: 'select',
    default: 'dark',
    options: [
      { value: 'dark', label: 'Dark' },
      { value: 'light', label: 'Light' },
      { value: 'system', label: 'System' },
    ],
    // FleetThemeRoot applies it instantly and keeps a local copy.
    ownPanel: true,
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
  'notifications.alert_emails': {
    scope: 'user',
    tab: 'preferences',
    section: 'Notifications',
    icon: '✉️',
    label: 'Email me fleet alerts',
    description: 'Emails for alert rules sent to managers — expiring documents, vehicles due a service. You still see every alert in Rovora’s notifications.',
    type: 'boolean',
    default: true,
    onLabel: 'On',
    offLabel: 'Off',
  },
  'notifications.alert_push': {
    scope: 'user',
    tab: 'preferences',
    section: 'Notifications',
    icon: '📲',
    label: 'Push fleet alerts to my devices',
    description: 'Phone and browser push notifications for the same alerts.',
    type: 'boolean',
    default: true,
    onLabel: 'On',
    offLabel: 'Off',
  },
  'lists.shifts_period': {
    scope: 'user',
    tab: 'preferences',
    section: 'Lists',
    icon: '🕒',
    label: 'Shifts opens on',
    description: 'Which shifts the Shifts page shows when you open it. You can still switch on the page.',
    module: 'rostering',
    type: 'select',
    default: '14d',
    options: [
      { value: 'today', label: 'Today' },
      { value: '7d', label: 'This week' },
      { value: '14d', label: 'Last 14 days' },
    ],
  },
  'lists.drivers_sort': {
    scope: 'user',
    tab: 'preferences',
    section: 'Lists',
    icon: '👥',
    label: 'Sort drivers by',
    description: 'How the Drivers list is ordered when you open it.',
    type: 'select',
    default: 'name',
    options: [
      { value: 'name', label: 'Name' },
      { value: 'earnings', label: 'Earnings' },
      { value: 'status', label: 'On shift' },
    ],
  },
  'lists.ledger_period': {
    scope: 'user',
    tab: 'preferences',
    section: 'Lists',
    icon: '📒',
    label: 'Bookkeeping opens on',
    description: 'The period the bookkeeping ledger shows when you open it.',
    module: 'bookkeeping',
    type: 'select',
    default: 'month',
    options: [
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'last4w', label: 'Last 4 weeks' },
      { value: 'month', label: 'This month' },
      { value: 'last_month', label: 'Last month' },
      { value: 'quarter', label: 'This quarter' },
      { value: 'year', label: 'This year' },
      { value: 'all', label: 'All time' },
    ],
  },
  'lists.financials_grouping': {
    scope: 'user',
    tab: 'preferences',
    section: 'Lists',
    icon: '📊',
    label: 'Financials grouped by',
    description: 'How the financial dashboard groups income and expenses when you open it.',
    module: 'bookkeeping',
    type: 'select',
    default: 'monthly',
    options: [
      { value: 'weekly', label: 'Week' },
      { value: 'monthly', label: 'Month' },
      { value: 'quarterly', label: 'Quarter' },
      { value: 'yearly', label: 'Year' },
      { value: 'all_time', label: 'All time' },
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
