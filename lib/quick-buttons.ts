// =============================================================================
// QUICK BUTTONS — shortcuts a manager pins to the top bar
// =============================================================================
// Each person picks up to MAX_QUICK_BUTTONS of these; the choice is saved as
// personal preferences (`quick_buttons.slot_1` … `slot_4` in the settings
// catalog), so it follows them to every device. Kept free of imports so both
// the settings catalog and the top bar can read it.
//
// To offer a new shortcut, add an entry here. Never rename an `id` once it has
// shipped — saved choices refer to it.
// =============================================================================

export const MAX_QUICK_BUTTONS = 4;

export interface QuickAction {
  id: string;
  /** Short text on the button, e.g. "Expense". */
  label: string;
  /** Full name in the picker and the tooltip, e.g. "Add an expense". */
  title: string;
  /** One line under the title in the picker. */
  hint: string;
  /** FleetIcon name. */
  icon: string;
  href: string;
  /** 'add' opens a create form; 'open' jumps to a page. */
  kind: 'add' | 'open';
  /** Only offered to fleet admins. */
  adminOnly?: boolean;
  /** Hidden while the fleet has this module switched off. */
  module?: string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  // ── Add something ──
  { id: 'add-expense', label: 'Expense', title: 'Add an expense', hint: 'Book a cost the day it happens', icon: 'euro', href: '/fleet/earnings?add=expense', kind: 'add', adminOnly: true, module: 'bookkeeping' },
  { id: 'add-income', label: 'Income', title: 'Add income', hint: 'Record a payout or payment received', icon: 'arrow-up', href: '/fleet/earnings?add=income', kind: 'add', adminOnly: true, module: 'bookkeeping' },
  { id: 'new-roster', label: 'Roster', title: 'New roster', hint: 'Plan a new weekly schedule', icon: 'roster', href: '/fleet/rosters/new', kind: 'add', module: 'rostering' },
  { id: 'new-driver', label: 'Driver', title: 'Add a driver', hint: 'A driver and their documents', icon: 'driver', href: '/fleet/drivers/new', kind: 'add' },
  { id: 'new-vehicle', label: 'Vehicle', title: 'Add a vehicle', hint: 'Register a car to the fleet', icon: 'vehicle', href: '/fleet/vehicles/new', kind: 'add' },
  { id: 'new-service', label: 'Service', title: 'Log a service', hint: 'A service or repair, with its cost', icon: 'wrench', href: '/fleet/services/new', kind: 'add', module: 'maintenance' },
  // ── Jump to a page ──
  { id: 'settlements', label: 'Balances', title: 'Driver balances', hint: 'This week’s settlements and what each driver is owed', icon: 'settle', href: '/fleet/settlements', kind: 'open', adminOnly: true, module: 'settlements' },
  { id: 'live-map', label: 'Live Map', title: 'Live Map', hint: 'Who is on shift, and where', icon: 'map', href: '/fleet/tracking', kind: 'open', module: 'tracking' },
  { id: 'shifts', label: 'Shifts', title: 'Shifts', hint: 'Today’s shifts, hours and kilometres', icon: 'shift', href: '/fleet/shifts', kind: 'open' },
  { id: 'rosters', label: 'Rosters', title: 'Rosters', hint: 'This week’s schedule', icon: 'calendar', href: '/fleet/rosters', kind: 'open', module: 'rostering' },
  { id: 'bookkeeping', label: 'Books', title: 'Bookkeeping', hint: 'The ledger of income and expenses', icon: 'book', href: '/fleet/earnings', kind: 'open', adminOnly: true, module: 'bookkeeping' },
  { id: 'adjustments', label: 'Adjustments', title: 'Adjustments', hint: 'Bonuses, deductions and reimbursements', icon: 'adjust', href: '/fleet/adjustments', kind: 'open', adminOnly: true, module: 'settlements' },
  { id: 'damages', label: 'Damages', title: 'Damages', hint: 'Open damage reports across the fleet', icon: 'damage', href: '/fleet/damages', kind: 'open', module: 'maintenance' },
  { id: 'reminders', label: 'Reminders', title: 'Reminders', hint: 'Renewals and to-dos coming up', icon: 'bell', href: '/fleet/reminders', kind: 'open', module: 'reminders' },
];

/** An empty slot. */
export const NO_QUICK_BUTTON = 'none';

/** Options for each `quick_buttons.slot_N` preference in the settings catalog. */
export const QUICK_BUTTON_OPTIONS: readonly { value: string; label: string }[] = [
  { value: NO_QUICK_BUTTON, label: 'None' },
  ...QUICK_ACTIONS.map((a) => ({ value: a.id, label: a.title })),
];

export const QUICK_SLOT_KEYS = [
  'quick_buttons.slot_1',
  'quick_buttons.slot_2',
  'quick_buttons.slot_3',
  'quick_buttons.slot_4',
] as const;

/** The actions this person may use, given their role and the fleet's modules. */
export function availableQuickActions(isAdmin: boolean, enabledModules: ReadonlySet<string>): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => (!a.adminOnly || isAdmin) && (!a.module || enabledModules.has(a.module)));
}

/**
 * Saved slot values → the buttons to draw: in slot order, without blanks,
 * duplicates, unknown ids or anything this person may no longer use.
 */
export function resolveQuickButtons(slots: readonly string[], available: readonly QuickAction[]): QuickAction[] {
  const byId = new Map(available.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const out: QuickAction[] = [];
  for (const id of slots) {
    const action = byId.get(id);
    if (!action || seen.has(id)) continue;
    seen.add(id);
    out.push(action);
    if (out.length === MAX_QUICK_BUTTONS) break;
  }
  return out;
}
