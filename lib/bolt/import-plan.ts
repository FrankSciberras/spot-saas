// =============================================================================
// BOLT → ROVORA FLEET IMPORT — the planning half (pure functions, no I/O)
// =============================================================================
// Decides which Bolt drivers and cars are candidates to become Rovora records,
// how each is grouped on the import screen, and what the new Rovora rows look
// like. The database half (lib/bolt/import.ts) calls these; keeping them free
// of I/O makes the rules easy to read and to test.
//
// The states a Bolt record can be in, relative to Rovora:
//
//   linked     driver_id / vehicle_id set — matched to an existing record or
//              created by an import. Nothing to do.
//   new        not linked and nothing decided — offered for import.
//   pending    new on Bolt since the first import, waiting for the admin
//              (ask-first mode). Offered for import, and highlighted.
//   inactive   not linked, deactivated on Bolt — shown, but not ticked.
//   ignored    the admin chose not to add it. Not offered again unless they
//              go looking.
//   excluded   the admin unlinked it by hand, or deleted the record an import
//              created. Never offered — re-creating it would undo their choice.
// =============================================================================

import { normReg } from './mapping';

export type BoltImportGroup = 'linked' | 'new' | 'pending' | 'inactive' | 'ignored' | 'excluded';

export interface BoltDriverImportRow {
  bolt_uuid: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  selected_vehicle_uuid: string | null;
  selected_vehicle_reg: string | null;
  driver_id: string | null;
  link_source: string | null;
  import_state: string | null;
}

export interface BoltVehicleImportRow {
  bolt_uuid: string;
  registration_number: string | null;
  normalised_reg: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  status: string | null;
  vehicle_id: string | null;
  link_source: string | null;
  import_state: string | null;
}

type Classifiable = {
  status: string | null;
  link_source: string | null;
  import_state: string | null;
};

function classify(row: Classifiable, linkedId: string | null): BoltImportGroup {
  if (linkedId) return 'linked';
  // A hand-made "not linked" (manual + null) or an imported record that has
  // since been deleted (import + null) is the admin's decision — leave it.
  if (row.link_source === 'manual' || row.link_source === 'import') return 'excluded';
  if (row.import_state === 'ignored') return 'ignored';
  if (row.status === 'deactivated') return 'inactive';
  if (row.import_state === 'pending') return 'pending';
  return 'new';
}

export function classifyDriver(row: BoltDriverImportRow): BoltImportGroup {
  return classify(row, row.driver_id);
}

export function classifyVehicle(row: BoltVehicleImportRow): BoltImportGroup {
  // A car with no plate can't become a Rovora vehicle (the plate is required).
  if (!row.vehicle_id && !(row.registration_number ?? '').trim()) return 'excluded';
  return classify(row, row.vehicle_id);
}

/** Groups that may be imported when the admin asks for them by name. */
export const IMPORTABLE_GROUPS: ReadonlySet<BoltImportGroup> = new Set(['new', 'pending', 'inactive', 'ignored']);
/** Groups that "Import everything" takes. */
export const IMPORT_ALL_GROUPS: ReadonlySet<BoltImportGroup> = new Set(['new', 'pending']);

export function boltDriverName(row: Pick<BoltDriverImportRow, 'first_name' | 'last_name' | 'display_name' | 'phone'>): string {
  const full = [row.first_name, row.last_name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return full || (row.display_name ?? '').trim() || (row.phone ?? '').trim() || 'Bolt driver';
}

/** The Rovora driver created for a Bolt driver (no login — they can be invited later). */
export function rovoraDriverFromBolt(row: BoltDriverImportRow) {
  return {
    full_name: boltDriverName(row).slice(0, 200),
    phone: (row.phone ?? '').trim() || null,
    status: row.status === 'deactivated' ? ('inactive' as const) : ('active' as const),
  };
}

/** The Rovora vehicle created for a Bolt car. */
export function rovoraVehicleFromBolt(row: BoltVehicleImportRow) {
  const model = (row.model ?? '').trim();
  return {
    registration_number: (row.registration_number ?? '').trim().toUpperCase(),
    // Rovora requires a make; Bolt sometimes leaves it out.
    make: (row.make ?? '').trim() || 'Unknown',
    model: model || 'Unknown',
    year: row.year && row.year > 1950 && row.year < 2100 ? row.year : null,
    color: (row.colour ?? '').trim() || null,
    status: row.status === 'deactivated' ? ('out_of_service' as const) : ('active' as const),
  };
}

/**
 * Bolt can list the same plate twice (an old and a new record for one car).
 * Rovora allows a plate once per fleet, so keep the first of each — callers
 * sort the preferred one (active) first.
 */
export function uniqueByPlate<T extends Pick<BoltVehicleImportRow, 'registration_number' | 'normalised_reg'>>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = normReg(r.normalised_reg || r.registration_number);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Splits a list at what the plan still has room for (null = no limit). */
export function takeWithinRoom<T>(items: T[], room: number | null): { take: T[]; left: T[] } {
  if (room === null) return { take: items, left: [] };
  const n = Math.max(0, room);
  return { take: items.slice(0, n), left: items.slice(n) };
}

/**
 * Which cars should name a single driver as theirs: a car that exactly one of
 * the newly imported drivers drives on Bolt. Shared cars (shift work) get no
 * single "assigned driver" — the drivers still each point at the car.
 */
export function soleDriverByVehicle(pairs: { driverId: string; vehicleId: string | null }[]): Map<string, string> {
  const byVehicle = new Map<string, string[]>();
  for (const p of pairs) {
    if (!p.vehicleId) continue;
    byVehicle.set(p.vehicleId, [...(byVehicle.get(p.vehicleId) ?? []), p.driverId]);
  }
  const out = new Map<string, string>();
  for (const [vehicleId, drivers] of byVehicle) if (drivers.length === 1) out.set(vehicleId, drivers[0]);
  return out;
}

const activeFirst = (a: { status: string | null }, b: { status: string | null }) =>
  Number(a.status === 'deactivated') - Number(b.status === 'deactivated');

/** Order for the import screen and for taking within a plan limit: active first, then by name. */
export function sortDriversForImport<T extends BoltDriverImportRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => activeFirst(a, b) || boltDriverName(a).localeCompare(boltDriverName(b)));
}

export function sortVehiclesForImport<T extends BoltVehicleImportRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => activeFirst(a, b) || (a.registration_number ?? '').localeCompare(b.registration_number ?? ''),
  );
}
