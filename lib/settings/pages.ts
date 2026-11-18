// =============================================================================
// PAGE ↔ SETTINGS — which Settings tab belongs to which fleet page
// =============================================================================
// One list, read by two things:
//   * the gear in the fleet top bar (FleetSettingsGear) — on a page listed
//     here it links to that page's settings tab;
//   * the Settings page's "Back to …" link — the gear passes the page it came
//     from as ?from=, and safeReturnPath() checks it before linking back.
//
// To give a page a gear: add its route here with the tab its settings live on.
// `personal` means the page also has personal preferences (Settings →
// Preferences), so people who can't open the fleet tab (staff) still get a
// gear, pointing at their own preferences.
// =============================================================================

import { SETTINGS_TABS, type SettingsTabKey } from './types';

interface PageSettings {
  /** Route prefix; also matches its sub-pages (/fleet/drivers/123). */
  prefix: string;
  tab: SettingsTabKey;
  personal?: boolean;
}

export const PAGE_SETTINGS: PageSettings[] = [
  { prefix: '/fleet/tracking', tab: 'live-map' },
  { prefix: '/fleet/trips', tab: 'live-map' },
  { prefix: '/fleet/safety', tab: 'live-map' },
  { prefix: '/fleet/shifts', tab: 'shifts', personal: true },
  { prefix: '/fleet/rosters', tab: 'shifts' },
  { prefix: '/fleet/messages', tab: 'messages' },
  { prefix: '/fleet/notifications', tab: 'notifications', personal: true },
  { prefix: '/fleet/drivers', tab: 'drivers', personal: true },
  { prefix: '/fleet/reminders', tab: 'drivers' },
  { prefix: '/fleet/vehicles', tab: 'vehicles' },
  { prefix: '/fleet/services', tab: 'vehicles' },
  { prefix: '/fleet/settlements', tab: 'settlements' },
  { prefix: '/fleet/adjustments', tab: 'settlements' },
  { prefix: '/fleet/earnings', tab: 'general', personal: true },
  { prefix: '/fleet/financials', tab: 'general', personal: true },
];

const SETTINGS_PATH = '/fleet/settings';

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** /fleet/settings?tab=…&from=… — `from` is where its "Back" link returns to. */
export function settingsHref(tab: SettingsTabKey, from?: string | null): string {
  const params = new URLSearchParams({ tab });
  if (from) params.set('from', from);
  return `${SETTINGS_PATH}?${params}`;
}

/**
 * Where the gear on `pathname` should go, or null when the page has no
 * settings this person can open (staff can't open fleet tabs; tabs of
 * switched-off modules are hidden).
 */
export function settingsLinkFor(
  pathname: string,
  who: { isAdmin: boolean; enabledModules: ReadonlySet<string> }
): string | null {
  if (matches(pathname, SETTINGS_PATH)) return null;
  const entry = PAGE_SETTINGS.filter((p) => matches(pathname, p.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!entry) return null;
  const tab = SETTINGS_TABS.find((t) => t.key === entry.tab);
  const tabModule = tab && 'module' in tab ? tab.module : undefined;
  const canOpen = who.isAdmin && (!tabModule || who.enabledModules.has(tabModule));
  if (canOpen) return settingsHref(entry.tab, pathname);
  return entry.personal ? settingsHref('preferences', pathname) : null;
}

/**
 * A `from` value that is safe to link back to: an in-app /fleet path (not
 * Settings itself). Anything else — another site, "//evil.com", "javascript:"
 * — returns null, so the Settings page shows no back link.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300) return null;
  if (!/^\/fleet(\/[A-Za-z0-9\-_/]*)?$/.test(raw) || raw.includes('//')) return null;
  return matches(raw, SETTINGS_PATH) ? null : raw;
}
