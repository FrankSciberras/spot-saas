// =============================================================================
// FLEET MODULES CATALOG — the "apps" / plugins system
// =============================================================================
// Single source of truth for the product features a fleet operator can switch on
// or off for their workspace. All start switched on for a new fleet; managed from Integrations and
// managed from /fleet/integrations ("Your modules"). Enabled/disabled state is
// stored per fleet in the org_modules table as OVERRIDES only — so adding a NEW
// module here needs NO database migration: build its pages, add one entry below,
// and every fleet inherits its `defaultEnabled` value until they change it.
//
// To add a module later:
//   1. Add an entry to FLEET_MODULES (pick a stable, never-changing `key`).
//   2. List the sidebar nav ids it owns (navIds) and route prefixes (routePrefixes).
//   3. Build the routes and add `await requireModule(orgId, '<key>')` at the top
//      of each page (see lib/modules/guard.ts).
//
// `icon` is a FleetIcon name (components/fleet/FleetIcon.tsx) — NOT an emoji — so
// the tiles match the rest of the fleet UI.
// =============================================================================

export type ModuleStatus = 'available' | 'coming-soon';

export interface FleetModule {
  /** Stable slug stored in org_modules.module_key. NEVER change once shipped. */
  key: string;
  /** Display name, e.g. "Settlements". */
  name: string;
  /** One-line summary for cards. */
  tagline: string;
  /** Longer description (module card body + onboarding). */
  description: string;
  /** FleetIcon name shown on the module tile (see components/fleet/FleetIcon). */
  icon: string;
  /** Grouping label, e.g. "Financial". */
  category: string;
  /** 'available' = usable now; 'coming-soon' = shown but not yet enableable. */
  status: ModuleStatus;
  /** Default on/off for a fleet with no override row in org_modules. */
  defaultEnabled: boolean;
  /** FleetSidebar NavItem ids this module owns (hidden when the module is off). */
  navIds: string[];
  /** /fleet route prefixes this module owns (guarded when the module is off). */
  routePrefixes: string[];
}

/**
 * The toggleable modules. Core product areas (Dashboard, Drivers, Vehicles,
 * Staff, Settings, Billing, Permissions, Integrations, Audit) are intentionally
 * NOT here — they are always on and have no `module` gate. See CORE_FEATURES for
 * the "always included" display list.
 */
export const FLEET_MODULES: FleetModule[] = [
  {
    key: 'settlements',
    name: 'Settlements',
    tagline: 'Pay your drivers',
    description:
      'Weekly driver payouts with pay presets, revenue splits, tax, rent and one-off or recurring adjustments.',
    icon: 'settle',
    category: 'Financial',
    status: 'available',
    defaultEnabled: true,
    navIds: ['settlements', 'adjustments'],
    routePrefixes: ['/fleet/settlements', '/fleet/adjustments'],
  },
  {
    key: 'bookkeeping',
    name: 'Bookkeeping',
    tagline: 'Track income & expenses',
    description:
      'A running ledger of every expense and payout, recorded the day it happens — with your own income & expense categories, receipt photos, recurring costs that post themselves, and the financial dashboard for any week, month or pay cycle.',
    icon: 'book',
    category: 'Financial',
    status: 'available',
    defaultEnabled: true,
    navIds: ['bookkeeping', 'financials'],
    routePrefixes: ['/fleet/earnings', '/fleet/financials'],
  },
  {
    key: 'rostering',
    name: 'Rostering',
    tagline: 'Plan schedules & shifts',
    description:
      'Build weekly rosters, assign drivers and vehicles, and track every logged shift.',
    icon: 'roster',
    category: 'Operations',
    status: 'available',
    defaultEnabled: true,
    navIds: ['rosters', 'shifts'],
    routePrefixes: ['/fleet/rosters', '/fleet/shifts'],
  },
  {
    key: 'messaging',
    name: 'Messages',
    tagline: 'Chat with your drivers',
    description:
      'Direct chats and group chats between managers and drivers — photos, files, read receipts and announcement groups. Drivers join and leave automatically with the fleet, so you can retire the WhatsApp group.',
    icon: 'chat',
    category: 'Operations',
    status: 'available',
    defaultEnabled: true,
    navIds: ['messages'],
    routePrefixes: ['/fleet/messages'],
  },
  {
    key: 'tracking',
    name: 'Live Tracking',
    tagline: 'See drivers on a map',
    description:
      'Live GPS map with trip & stop history, driver safety scores and device health alerts.',
    icon: 'map',
    category: 'Operations',
    status: 'available',
    defaultEnabled: true,
    navIds: ['tracking', 'trips', 'safety'],
    routePrefixes: ['/fleet/tracking', '/fleet/trips', '/fleet/safety'],
  },
  {
    key: 'maintenance',
    name: 'Maintenance',
    tagline: 'Services & damages',
    description:
      'Log vehicle services and repairs, and track damage reports across the fleet.',
    icon: 'wrench',
    category: 'Operations',
    status: 'available',
    defaultEnabled: true,
    navIds: ['services', 'damages'],
    routePrefixes: ['/fleet/services', '/fleet/damages'],
  },
  {
    key: 'parts',
    name: 'Parts & Inventory',
    tagline: 'Track stock & usage',
    description:
      'Keep a stock list of spare parts with low-stock alerts, and log usage against vehicles and services.',
    icon: 'box',
    category: 'Operations',
    status: 'available',
    defaultEnabled: true,
    navIds: ['parts'],
    routePrefixes: ['/fleet/parts'],
  },
  {
    key: 'reminders',
    name: 'Reminders',
    tagline: 'Renewals & notifications',
    description:
      'Document-expiry reminders and driver notification rules so nothing slips through.',
    icon: 'bell',
    category: 'Admin',
    status: 'available',
    defaultEnabled: true,
    navIds: ['reminders', 'notify'],
    routePrefixes: ['/fleet/reminders', '/fleet/notifications'],
  },
  {
    // Off until a fleet connects its Bolt account — connecting at /fleet/bolt
    // switches this on (and disconnecting switches it off), which is what puts
    // "Bolt" in the sidebar. The page itself is NOT module-guarded: it has to
    // stay reachable so a fleet can connect in the first place.
    key: 'bolt',
    name: 'Bolt',
    tagline: 'Rides & earnings from Bolt',
    description:
      'Connect your Bolt fleet account to see rides, fares, tips, acceptance rates and who is online — per driver, updated every hour.',
    icon: 'bolt',
    category: 'Integrations',
    status: 'available',
    defaultEnabled: false,
    navIds: ['bolt'],
    routePrefixes: [],
  },
  {
    // Same pattern as Bolt: off until a fleet connects a GPS platform at
    // /fleet/gps (which switches it on → "GPS trackers" in the sidebar, and
    // vehicles on the Live Map). The page itself stays reachable to connect.
    key: 'gps',
    name: 'GPS trackers',
    tagline: 'Vehicles on the Live Map',
    description:
      'Connect the GPS trackers already in your cars (Traccar, flespi, Wialon, Navixy, Samsara, Geotab, Mapon) and see every vehicle live on the map — next to, or instead of, driver phones.',
    icon: 'map',
    category: 'Integrations',
    status: 'available',
    defaultEnabled: false,
    navIds: ['gps'],
    routePrefixes: [],
  },
  {
    key: 'invoices',
    name: 'Invoices',
    tagline: 'Bill customers & partners',
    description:
      'Create, send and track invoices for corporate accounts and partners. Coming soon.',
    icon: 'doc',
    category: 'Financial',
    status: 'coming-soon',
    defaultEnabled: false,
    navIds: [],
    routePrefixes: [],
  },
];

/**
 * Always-on product areas, shown in the modules panel as "Always included" so an
 * operator can see what they get regardless of which modules they toggle. Display
 * only — these have no on/off state. `icon` is a FleetIcon name.
 */
export const CORE_FEATURES: { name: string; icon: string }[] = [
  { name: 'Dashboard', icon: 'dashboard' },
  { name: 'Drivers', icon: 'driver' },
  { name: 'Vehicles', icon: 'vehicle' },
  { name: 'Staff', icon: 'staff' },
  { name: 'Settings', icon: 'adjust' },
  { name: 'Billing', icon: 'settle' },
];

// --- Derived lookup tables (built once at module load) ------------------------

const NAV_TO_MODULE: Record<string, string> = {};
for (const m of FLEET_MODULES) {
  for (const id of m.navIds) NAV_TO_MODULE[id] = m.key;
}

/** The module key that owns a sidebar nav id, or undefined if it's a core item. */
export function moduleForNav(navId: string): string | undefined {
  return NAV_TO_MODULE[navId];
}

/** The module key that owns a /fleet pathname, or undefined if none (core). */
export function moduleForRoute(pathname: string): string | undefined {
  for (const m of FLEET_MODULES) {
    if (m.routePrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return m.key;
    }
  }
  return undefined;
}

/**
 * Merge a fleet's override rows with the catalog defaults into the set of module
 * keys that are ON for that fleet. Coming-soon modules can never be enabled (they
 * have no routes yet), even if a stale override says otherwise.
 */
export function resolveEnabledModules(
  overrides: { module_key: string; is_enabled: boolean }[],
): Set<string> {
  const overrideMap = new Map(overrides.map((o) => [o.module_key, o.is_enabled]));
  const enabled = new Set<string>();
  for (const m of FLEET_MODULES) {
    if (m.status !== 'available') continue;
    const on = overrideMap.has(m.key) ? overrideMap.get(m.key)! : m.defaultEnabled;
    if (on) enabled.add(m.key);
  }
  return enabled;
}
