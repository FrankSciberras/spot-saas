// =============================================================================
// Finance Category Configuration
// =============================================================================
// Bookkeeping categories are per-fleet data now (org_finance_categories table,
// editable on the Bookkeeping page). The constants below are the FALLBACK for
// fleets with zero category rows and the seed list the page self-heals with —
// they match seed_default_finance_categories() exactly.
//
// Same shape as lib/config/settlements.ts, which did this for platforms.
// =============================================================================

export type CategoryKind = 'income' | 'expense';

export interface FinanceCategory {
  id: string;
  key: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  /** The two "Other" catch-alls: renameable, but never removable. */
  isSystem: boolean;
}

/** Loose shape of an org_finance_categories row (structural, for partial selects). */
export interface OrgFinanceCategoryLike {
  id: string;
  key: string;
  name: string;
  kind: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

/**
 * Resolve the category list for a fleet: its org_finance_categories rows when
 * any exist, otherwise the hardcoded defaults.
 *
 * NOTE the fallback ids are keys, not UUIDs — it renders, but cannot be saved
 * against. The bookkeeping page seeds the real rows on first load rather than
 * relying on it; this exists so a missing migration degrades to a readable
 * page instead of a crash.
 */
export function resolveFinanceCategories(
  rows: OrgFinanceCategoryLike[] | null | undefined,
): FinanceCategory[] {
  if (!rows || rows.length === 0) return DEFAULT_FINANCE_CATEGORIES;
  return rows
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      kind: (r.kind === 'income' ? 'income' : 'expense') as CategoryKind,
      icon: r.icon || 'dots',
      color: r.color || '#2bbd7e',
      sortOrder: r.sort_order ?? 0,
      isActive: r.is_active !== false,
      isSystem: r.is_system === true,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Active categories of one kind, in display order. */
export function categoriesOfKind(
  categories: FinanceCategory[],
  kind: CategoryKind,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): FinanceCategory[] {
  return categories.filter(
    (c) => c.kind === kind && (includeInactive || c.isActive),
  );
}

/**
 * The twelve categories every fleet starts with — identical to what the app
 * hardcoded before categories became editable, so an existing fleet sees no
 * change. Keys match the old weekly_bookkeeping column names.
 */
export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'uber_earnings',  key: 'uber_earnings',  name: 'Uber',         kind: 'income',  icon: 'vehicle', color: '#a78bfa', sortOrder: 0, isActive: true, isSystem: false },
  { id: 'bolt_earnings',  key: 'bolt_earnings',  name: 'Bolt',         kind: 'income',  icon: 'vehicle', color: '#34d399', sortOrder: 1, isActive: true, isSystem: false },
  { id: 'ecabs_earnings', key: 'ecabs_earnings', name: 'eCabs',        kind: 'income',  icon: 'vehicle', color: '#f5b54a', sortOrder: 2, isActive: true, isSystem: false },
  { id: 'other_earnings', key: 'other_earnings', name: 'Other',        kind: 'income',  icon: 'dots',    color: '#2bbd7e', sortOrder: 3, isActive: true, isSystem: true  },
  { id: 'employees',      key: 'employees',      name: 'Employees',    kind: 'expense', icon: 'staff',   color: '#38bdf8', sortOrder: 0, isActive: true, isSystem: false },
  { id: 'repairs',        key: 'repairs',        name: 'Repairs',      kind: 'expense', icon: 'wrench',  color: '#fb923c', sortOrder: 1, isActive: true, isSystem: false },
  { id: 'insurance',      key: 'insurance',      name: 'Insurance',    kind: 'expense', icon: 'doc',     color: '#a78bfa', sortOrder: 2, isActive: true, isSystem: false },
  { id: 'investments',    key: 'investments',    name: 'Investments',  kind: 'expense', icon: 'chart',   color: '#34d399', sortOrder: 3, isActive: true, isSystem: false },
  { id: 'vat',            key: 'vat',            name: 'VAT',          kind: 'expense', icon: 'book',    color: '#f472b6', sortOrder: 4, isActive: true, isSystem: false },
  { id: 'rent',           key: 'rent',           name: 'Rent',         kind: 'expense', icon: 'vehicle', color: '#facc15', sortOrder: 5, isActive: true, isSystem: false },
  { id: 'employee_tax',   key: 'employee_tax',   name: 'Employee tax', kind: 'expense', icon: 'settle',  color: '#22d3ee', sortOrder: 6, isActive: true, isSystem: false },
  { id: 'other_expenses', key: 'other_expenses', name: 'Other',        kind: 'expense', icon: 'dots',    color: '#64748b', sortOrder: 7, isActive: true, isSystem: true  },
];

/**
 * One-click additions offered when an operator adds a category. These are the
 * lines a taxi / private-hire fleet most often keeps that the original twelve
 * had no home for — everything here previously had to go into "Other".
 */
export interface CategoryPreset {
  key: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  hint: string;
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  // --- Expenses -------------------------------------------------------------
  { key: 'fuel',            name: 'Fuel',              kind: 'expense', icon: 'fuel',    color: '#f97316', hint: 'Petrol, diesel and EV charging' },
  { key: 'vehicle_lease',   name: 'Vehicle lease',     kind: 'expense', icon: 'vehicle', color: '#8b5cf6', hint: 'Lease or finance payments on your cars' },
  { key: 'road_tax',        name: 'Road tax & licence', kind: 'expense', icon: 'doc',     color: '#0ea5e9', hint: 'Road licence, VRT and annual vehicle duties' },
  { key: 'cleaning',        name: 'Cleaning',          kind: 'expense', icon: 'box',     color: '#14b8a6', hint: 'Valeting and car washes' },
  { key: 'tolls',           name: 'Tolls & parking',   kind: 'expense', icon: 'pin',     color: '#eab308', hint: 'Toll charges and paid parking' },
  { key: 'fines',           name: 'Fines & penalties', kind: 'expense', icon: 'warning', color: '#ef4444', hint: 'Traffic fines and penalty notices' },
  { key: 'tyres',           name: 'Tyres',             kind: 'expense', icon: 'wrench',  color: '#78716c', hint: 'Replacements, rotation and seasonal swaps' },
  { key: 'utilities',       name: 'Utilities',         kind: 'expense', icon: 'plug',    color: '#06b6d4', hint: 'Electricity, water and internet at the depot' },
  { key: 'phone_data',      name: 'Phone & data',      kind: 'expense', icon: 'phone',   color: '#3b82f6', hint: 'Driver SIMs and dispatch connectivity' },
  { key: 'software',        name: 'Software & subs',   kind: 'expense', icon: 'plug',    color: '#6366f1', hint: 'Dispatch, tracking and back-office tools' },
  { key: 'accounting',      name: 'Accounting & legal', kind: 'expense', icon: 'book',    color: '#a855f7', hint: 'Bookkeeper, auditor and legal fees' },
  { key: 'marketing',       name: 'Marketing',         kind: 'expense', icon: 'chart',   color: '#ec4899', hint: 'Advertising, livery and promotions' },
  { key: 'bank_charges',    name: 'Bank & card fees',  kind: 'expense', icon: 'settle',  color: '#64748b', hint: 'Transaction, transfer and merchant fees' },
  { key: 'training',        name: 'Training & badges', kind: 'expense', icon: 'driver',  color: '#f59e0b', hint: 'Driver licensing, badges and courses' },
  { key: 'depreciation',    name: 'Depreciation',      kind: 'expense', icon: 'chart',   color: '#94a3b8', hint: 'Non-cash write-down of vehicle value' },

  // --- Income ---------------------------------------------------------------
  { key: 'corporate',       name: 'Corporate accounts', kind: 'income',  icon: 'staff',   color: '#0ea5e9', hint: 'Invoiced business and contract work' },
  { key: 'airport',         name: 'Airport transfers', kind: 'income',  icon: 'pin',     color: '#22d3ee', hint: 'Fixed-price transfer work' },
  { key: 'vehicle_rental',  name: 'Vehicle rental',    kind: 'income',  icon: 'vehicle', color: '#84cc16', hint: 'Rent you charge drivers for a car' },
  { key: 'advertising',     name: 'Ad revenue',        kind: 'income',  icon: 'chart',   color: '#f472b6', hint: 'Livery, screens and in-car advertising' },
];

/** Turn a free-text category name into a stable, unique-ish key. */
export function slugifyCategoryKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'category';
}

/** Palette offered when creating a custom category. */
export const CATEGORY_COLORS: string[] = [
  '#2bbd7e', '#34d399', '#0ea5e9', '#38bdf8', '#6366f1', '#8b5cf6',
  '#a78bfa', '#ec4899', '#f472b6', '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#14b8a6', '#64748b',
];

/** Icons offered when creating a custom category (all valid FleetIcon names). */
export const CATEGORY_ICONS: string[] = [
  'dots', 'vehicle', 'fuel', 'wrench', 'staff', 'driver', 'doc', 'book',
  'chart', 'settle', 'box', 'pin', 'plug', 'phone', 'warning', 'shift',
];
