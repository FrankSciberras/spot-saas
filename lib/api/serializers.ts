// =============================================================================
// PUBLIC API — RESOURCE SHAPES
// =============================================================================
// The v1 contract is deliberately NOT "whatever columns the table has today".
// Every resource is projected through a serializer, so internal columns (a
// driver's settlement preset, a fleet's tracking internals) never leak into a
// public payload and an internal schema change cannot silently break clients.
//
// Adding a field here is a compatible change. Removing or renaming one is not —
// that needs a /api/v2.
// =============================================================================

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface ApiDriver {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  status: string;
  employment_type: string | null;
  user_id: string | null;
  assigned_vehicle_id: string | null;
  id_card_number: string | null;
  id_card_expiry_date: string | null;
  police_conduct_expiry_date: string | null;
  driving_license_number: string | null;
  driving_license_expiry_date: string | null;
  tag_license_expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** The columns a driver read selects. Keep in step with serializeDriver. */
export const DRIVER_COLUMNS =
  'id, full_name, phone, address, status, employment_type, user_id, assigned_vehicle_id, id_card_number, id_card_expiry_date, police_conduct_expiry_date, driving_license_number, driving_license_expiry_date, tag_license_expiry_date, notes, created_at, updated_at';

export function serializeDriver(row: Row): ApiDriver {
  return {
    id: String(row.id),
    full_name: String(row.full_name ?? ''),
    phone: str(row.phone),
    address: str(row.address),
    status: String(row.status ?? 'active'),
    employment_type: str(row.employment_type),
    user_id: str(row.user_id),
    assigned_vehicle_id: str(row.assigned_vehicle_id),
    id_card_number: str(row.id_card_number),
    id_card_expiry_date: str(row.id_card_expiry_date),
    police_conduct_expiry_date: str(row.police_conduct_expiry_date),
    driving_license_number: str(row.driving_license_number),
    driving_license_expiry_date: str(row.driving_license_expiry_date),
    tag_license_expiry_date: str(row.tag_license_expiry_date),
    notes: str(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface ApiVehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  year: number | null;
  mileage: number;
  status: string;
  assigned_driver_id: string | null;
  insurance_expiry_date: string | null;
  road_license_expiry_date: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const VEHICLE_COLUMNS =
  'id, registration_number, make, model, year, mileage, status, assigned_driver_id, insurance_expiry_date, road_license_expiry_date, color, notes, created_at, updated_at';

export function serializeVehicle(row: Row): ApiVehicle {
  return {
    id: String(row.id),
    registration_number: String(row.registration_number ?? ''),
    make: String(row.make ?? ''),
    model: String(row.model ?? ''),
    year: num(row.year),
    mileage: num(row.mileage) ?? 0,
    status: String(row.status ?? 'active'),
    assigned_driver_id: str(row.assigned_driver_id),
    insurance_expiry_date: str(row.insurance_expiry_date),
    road_license_expiry_date: str(row.road_license_expiry_date),
    color: str(row.color),
    notes: str(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface ApiFinanceCategory {
  id: string;
  key: string;
  name: string;
  kind: 'income' | 'expense';
  is_active: boolean;
  sort_order: number;
}

export const CATEGORY_COLUMNS = 'id, key, name, kind, is_active, sort_order';

export function serializeCategory(row: Row): ApiFinanceCategory {
  return {
    id: String(row.id),
    key: String(row.key ?? ''),
    name: String(row.name ?? ''),
    kind: row.kind === 'income' ? 'income' : 'expense',
    is_active: row.is_active !== false,
    sort_order: num(row.sort_order) ?? 0,
  };
}

export interface ApiTransaction {
  id: string;
  txn_date: string;
  /** Always positive — read `direction` for the sign. */
  amount: number;
  /** Derived from the category, so clients never have to join to know. */
  direction: 'income' | 'expense';
  category_id: string;
  category: { id: string; key: string; name: string; kind: string } | null;
  description: string | null;
  counterparty: string | null;
  payment_method: string;
  vehicle_id: string | null;
  driver_id: string | null;
  /** 'manual' | 'recurring' | 'period_import' — how the line got here. */
  source: string;
  /** True when a receipt image is attached. The file itself is not exposed. */
  has_receipt: boolean;
  created_at: string;
  updated_at: string;
}

export const TRANSACTION_COLUMNS =
  'id, txn_date, category_id, amount, description, counterparty, payment_method, vehicle_id, driver_id, receipt_path, source, created_at, updated_at';

/** Minimal category shape the transaction serializer needs. */
export interface CategoryRef {
  id: string;
  key: string;
  name: string;
  kind: string;
}

/**
 * Categories are resolved from a map the caller loads once per request rather
 * than embedded per row: a fleet has a couple of dozen of them, so one small
 * extra query beats a join on every ledger line.
 */
export function serializeTransaction(
  row: Row,
  categories: Map<string, CategoryRef>,
): ApiTransaction {
  const cat = categories.get(String(row.category_id)) ?? null;
  return {
    id: String(row.id),
    txn_date: String(row.txn_date),
    amount: num(row.amount) ?? 0,
    direction: cat?.kind === 'income' ? 'income' : 'expense',
    category_id: String(row.category_id),
    category: cat,
    description: str(row.description),
    counterparty: str(row.counterparty),
    payment_method: String(row.payment_method ?? 'card'),
    vehicle_id: str(row.vehicle_id),
    driver_id: str(row.driver_id),
    source: String(row.source ?? 'manual'),
    has_receipt: Boolean(row.receipt_path),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
