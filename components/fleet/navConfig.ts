/**
 * Shared navigation definitions for the fleet + driver shells.
 *
 * Lives outside FleetSidebar so the sidebar, the mobile tab bar and the ⌘K
 * command palette all read the same list — previously the tab bar had its own
 * hardcoded copy and drifted out of sync with the module gating.
 */

import { moduleForNav } from '@/lib/modules/catalog';

export interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  roles?: ('admin' | 'staff' | 'driver')[];
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { id: 'dashboard', name: 'Dashboard', href: '/fleet', icon: 'dashboard' },
      { id: 'messages', name: 'Messages', href: '/fleet/messages', icon: 'chat' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'staff', name: 'Staff', href: '/fleet/staff', icon: 'staff', roles: ['admin'] },
      { id: 'drivers', name: 'Drivers', href: '/fleet/drivers', icon: 'driver' },
      { id: 'vehicles', name: 'Vehicles', href: '/fleet/vehicles', icon: 'vehicle' },
      { id: 'rosters', name: 'Rosters', href: '/fleet/rosters', icon: 'roster' },
      { id: 'shifts', name: 'Shifts', href: '/fleet/shifts', icon: 'shift' },
    ],
  },
  {
    // Everything that comes from drivers' phones / trackers on the road (the
    // Live Tracking module). Split out of Operations to keep that list short.
    label: 'Tracking',
    items: [
      { id: 'tracking', name: 'Live Map', href: '/fleet/tracking', icon: 'map' },
      { id: 'trips', name: 'Trips', href: '/fleet/trips', icon: 'pin' },
      { id: 'safety', name: 'Safety', href: '/fleet/safety', icon: 'warning' },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { id: 'services', name: 'Services', href: '/fleet/services', icon: 'wrench' },
      { id: 'damages', name: 'Damages', href: '/fleet/damages', icon: 'damage' },
      { id: 'parts', name: 'Parts', href: '/fleet/parts', icon: 'box' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { id: 'bookkeeping', name: 'Bookkeeping', href: '/fleet/earnings', icon: 'book', roles: ['admin'] },
      { id: 'financials', name: 'Financials', href: '/fleet/financials', icon: 'chart', roles: ['admin'] },
      { id: 'settlements', name: 'Settlements', href: '/fleet/settlements', icon: 'settle', roles: ['admin'] },
      { id: 'adjustments', name: 'Adjustments', href: '/fleet/adjustments', icon: 'adjust', roles: ['admin'] },
      // Rides and earnings from the fleet's Bolt account (the 'bolt' module).
      { id: 'bolt', name: 'Bolt', href: '/fleet/bolt', icon: 'bolt', roles: ['admin'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'reminders', name: 'Reminders', href: '/fleet/reminders', icon: 'bell' },
      { id: 'audit', name: 'Audit Log', href: '/fleet/audit-log', icon: 'audit', roles: ['admin'] },
      { id: 'notify', name: 'Notify', href: '/fleet/notifications', icon: 'bell', roles: ['admin'] },
      { id: 'permissions', name: 'Permissions', href: '/fleet/permissions', icon: 'doc', roles: ['admin'] },
      { id: 'integrations', name: 'Integrations', href: '/fleet/integrations', icon: 'plug', roles: ['admin'] },
      { id: 'api', name: 'API', href: '/fleet/api', icon: 'doc', roles: ['admin'] },
      { id: 'settings', name: 'Settings', href: '/fleet/settings', icon: 'adjust', roles: ['admin'] },
    ],
  },
];

export const DRIVER_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { id: 'dashboard', name: 'Dashboard', href: '/driver', icon: 'dashboard' },
      // Hidden by FleetSidebar when the fleet has Messages switched off.
      { id: 'messages', name: 'Messages', href: '/driver/messages', icon: 'chat' },
    ],
  },
  {
    label: 'Work',
    items: [
      { id: 'go-online', name: 'Start Shift', href: '/driver/go-online', icon: 'shift' },
      { id: 'shifts', name: 'My Shifts', href: '/driver/shifts', icon: 'audit' },
      { id: 'vehicles', name: 'Vehicles', href: '/driver/vehicles', icon: 'vehicle' },
      { id: 'roster', name: 'My Roster', href: '/driver/roster', icon: 'roster' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { id: 'earnings', name: 'My Earnings', href: '/driver/earnings', icon: 'chart' },
      { id: 'settlements', name: 'Settlements', href: '/driver/settlements', icon: 'settle' },
    ],
  },
  {
    label: 'Alerts',
    items: [
      { id: 'notifications', name: 'Notifications', href: '/driver/notifications', icon: 'bell' },
    ],
  },
];

/**
 * Mobile tab bar. `id` matters — it is what feeds the module/role gate, so a
 * fleet with Rostering switched off no longer sees a dead "Shifts" tab.
 */
export const BOTTOM_TABS: NavItem[] = [
  { id: 'dashboard', name: 'Home', href: '/fleet', icon: 'dashboard' },
  { id: 'drivers', name: 'Drivers', href: '/fleet/drivers', icon: 'driver' },
  { id: 'vehicles', name: 'Vehicles', href: '/fleet/vehicles', icon: 'vehicle' },
  { id: 'shifts', name: 'Shifts', href: '/fleet/shifts', icon: 'shift' },
];

/** Fallbacks pulled in (in order) when a fleet has a default tab's module off. */
export const BOTTOM_TAB_FALLBACKS: NavItem[] = [
  { id: 'services', name: 'Services', href: '/fleet/services', icon: 'wrench' },
  { id: 'settlements', name: 'Settlements', href: '/fleet/settlements', icon: 'settle', roles: ['admin'] },
  { id: 'reminders', name: 'Reminders', href: '/fleet/reminders', icon: 'bell' },
];

// Two tabs each side of the centre Go-online button (+ "More"), so it sits
// exactly in the middle. Earnings and My Shifts stay reachable via More and
// the dashboard. Messages takes the second slot — it's what drivers open most
// — and falls back to Shifts when the fleet has chat switched off.
export const DRIVER_BOTTOM_TABS: NavItem[] = [
  { id: 'dashboard', name: 'Home', href: '/driver', icon: 'dashboard' },
  { id: 'messages', name: 'Messages', href: '/driver/messages', icon: 'chat' },
  { id: 'roster', name: 'Roster', href: '/driver/roster', icon: 'roster' },
];

export const DRIVER_MESSAGES_FALLBACK_TAB: NavItem = { id: 'shifts', name: 'Shifts', href: '/driver/shifts', icon: 'shift' };

export interface NavGateOptions {
  role?: 'admin' | 'staff' | 'driver';
  alsoStaff?: boolean;
  enabledModules: ReadonlySet<string>;
  isDriver: boolean;
}

/**
 * Whether a nav item is visible to this user in this fleet.
 *
 * Two gates: the fleet's enabled modules (fleet nav only — a driver's own
 * pages stay put) and the item's role list.
 */
export function canSeeNavItem(item: NavItem, opts: NavGateOptions): boolean {
  if (!opts.isDriver) {
    const moduleKey = moduleForNav(item.id);
    if (moduleKey && !opts.enabledModules.has(moduleKey)) return false;
  }
  if (!item.roles) return true;
  if (!opts.role) return false;
  if (opts.role === 'driver' && opts.alsoStaff && item.roles.includes('staff')) return true;
  return item.roles.includes(opts.role);
}

/**
 * The sidebar name of the fleet page a path belongs to ("Live Map" for
 * /fleet/tracking/…), for links like Settings' "Back to Live Map".
 */
export function fleetPageName(path: string): string | null {
  let best: NavItem | null = null;
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
    const hit = item.href === '/fleet' ? path === '/fleet' : path === item.href || path.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.name ?? null;
}
