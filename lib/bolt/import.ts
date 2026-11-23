// =============================================================================
// BOLT → ROVORA FLEET IMPORT — creating drivers & cars from a Bolt account
// =============================================================================
// Connecting Bolt fills the bolt_* tables. This turns those Bolt records into
// the fleet's own Rovora drivers and vehicles, so a new fleet doesn't have to
// type everyone in by hand:
//
//   * importBoltRecords   the "Import everything" / "Add selected" button, and
//                         the hourly sync in add-automatically mode.
//   * undoBoltImport      takes one import back out, for 24 hours, leaving
//                         anything that has been edited or used since.
//   * handleNewBoltMembers  run by every sync after the first import: someone
//                         new on Bolt is held for the admin (ask first — the
//                         default), added straight away, or left alone.
//
// Imported drivers have NO login: Rovora drivers have not needed one since the
// public API (drivers.user_id is nullable). The admin can invite them to the
// driver app later from the driver's page.
//
// Every call is scoped to one organization_id and uses the SERVICE-ROLE
// client. Callers check who is asking (lib/actions/bolt.ts: admin only).
//
// SERVER ONLY.
// =============================================================================

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planRoom } from '@/lib/api/capacity';
import { syncExtraVehicleBillingSafe } from '@/lib/billing/vehicle-billing';
import { matchDriver, matchVehicle } from './mapping';
import { loadRovoraDrivers, loadRovoraVehicles } from './rovora';
import {
  IMPORTABLE_GROUPS,
  IMPORT_ALL_GROUPS,
  classifyDriver,
  classifyVehicle,
  rovoraDriverFromBolt,
  rovoraVehicleFromBolt,
  soleDriverByVehicle,
  sortDriversForImport,
  sortVehiclesForImport,
  takeWithinRoom,
  uniqueByPlate,
  type BoltDriverImportRow,
  type BoltImportGroup,
  type BoltVehicleImportRow,
} from './import-plan';

export const DRIVER_IMPORT_COLUMNS =
  'bolt_uuid, first_name, last_name, display_name, email, phone, status, selected_vehicle_uuid, selected_vehicle_reg, driver_id, link_source, import_state';
export const VEHICLE_IMPORT_COLUMNS =
  'bolt_uuid, registration_number, normalised_reg, make, model, year, colour, status, vehicle_id, link_source, import_state';

/** How long after an import it can still be undone. */
export const UNDO_WINDOW_MS = 24 * 3600_000;
const CHUNK = 200;

export type NewMemberMode = 'review' | 'auto' | 'off';
export const NEW_MEMBER_MODES: readonly NewMemberMode[] = ['review', 'auto', 'off'];

type Admin = SupabaseClient;

const chunks = <T,>(items: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 drivers and 1 car" / "2 drivers" / "1 car". */
export function describeCounts(drivers: number, vehicles: number): string {
  const parts = [drivers ? plural(drivers, 'driver') : '', vehicles ? plural(vehicles, 'car') : ''].filter(Boolean);
  return parts.join(' and ') || 'nothing';
}

// --- reading -------------------------------------------------------------------

export async function loadImportRows(
  admin: Admin,
  orgId: string,
): Promise<{ drivers: BoltDriverImportRow[]; vehicles: BoltVehicleImportRow[] }> {
  const [d, v] = await Promise.all([
    admin.from('bolt_drivers').select(DRIVER_IMPORT_COLUMNS).eq('organization_id', orgId).range(0, 4999),
    admin.from('bolt_vehicles').select(VEHICLE_IMPORT_COLUMNS).eq('organization_id', orgId).range(0, 4999),
  ]);
  if (d.error) throw new Error(`Loading Bolt drivers failed: ${d.error.message}`);
  if (v.error) throw new Error(`Loading Bolt vehicles failed: ${v.error.message}`);
  return {
    drivers: (d.data ?? []) as unknown as BoltDriverImportRow[],
    vehicles: (v.data ?? []) as unknown as BoltVehicleImportRow[],
  };
}

export interface BoltLastImport {
  batchId: string;
  at: string;
  drivers: number;
  vehicles: number;
}

/** The most recent import that can still be undone, if any. */
export async function loadLastImport(admin: Admin, orgId: string): Promise<BoltLastImport | null> {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
  const select = (table: string) =>
    admin
      .from(table)
      .select('import_batch, imported_at')
      .eq('organization_id', orgId)
      .not('import_batch', 'is', null)
      .gte('imported_at', since)
      .range(0, 4999);
  const [d, v] = await Promise.all([select('bolt_drivers'), select('bolt_vehicles')]);

  const batches = new Map<string, BoltLastImport>();
  const add = (rows: unknown, key: 'drivers' | 'vehicles') => {
    for (const r of (rows ?? []) as { import_batch: string; imported_at: string }[]) {
      const b = batches.get(r.import_batch) ?? { batchId: r.import_batch, at: r.imported_at, drivers: 0, vehicles: 0 };
      b[key] += 1;
      if (r.imported_at > b.at) b.at = r.imported_at;
      batches.set(r.import_batch, b);
    }
  };
  add(d.data, 'drivers');
  add(v.data, 'vehicles');

  let latest: BoltLastImport | null = null;
  for (const b of batches.values()) if (!latest || b.at > latest.at) latest = b;
  return latest;
}

// --- importing -----------------------------------------------------------------

export interface BoltImportSelection {
  /** 'all' = every new and waiting one; otherwise the Bolt ids to add. */
  drivers: 'all' | string[];
  vehicles: 'all' | string[];
  /**
   * Mark the new / waiting ones that were NOT chosen as "not added", so later
   * syncs don't offer them again. Used by the first-import screen, where the
   * admin has looked at the whole list.
   */
  ignoreRest?: boolean;
}

export interface BoltImportResult {
  batchId: string | null;
  driversAdded: number;
  vehiclesAdded: number;
  /** Chosen, but already in Rovora (added by hand since the last sync) — linked instead. */
  driversLinked: number;
  vehiclesLinked: number;
  /** Chosen, but the plan has no room left for them. */
  driversOverPlan: number;
  vehiclesOverPlan: number;
  /** New drivers who were given the car they drive on Bolt. */
  carsAssigned: number;
  planName: string;
}

function pick<T extends { bolt_uuid: string }>(
  rows: T[],
  classify: (row: T) => BoltImportGroup,
  choice: 'all' | string[],
): T[] {
  if (choice === 'all') return rows.filter((r) => IMPORT_ALL_GROUPS.has(classify(r)));
  const wanted = new Set(choice);
  return rows.filter((r) => wanted.has(r.bolt_uuid) && IMPORTABLE_GROUPS.has(classify(r)));
}

type LinkRow = {
  organization_id: string;
  bolt_uuid: string;
  link_source: 'auto' | 'import';
  import_state: null;
  import_batch: string | null;
  imported_at: string | null;
};
type DriverLink = LinkRow & { driver_id: string };
type VehicleLink = LinkRow & { vehicle_id: string };

/**
 * Writes link columns onto existing bolt_* rows. Every object carries the same
 * keys, so the upsert only ever touches these columns (and missing NOT NULL
 * columns fall back to their defaults rather than null).
 */
async function writeLinks(admin: Admin, table: 'bolt_drivers' | 'bolt_vehicles', rows: (DriverLink | VehicleLink)[]) {
  for (const part of chunks(rows)) {
    const { error } = await admin
      .from(table)
      .upsert(part, { onConflict: 'organization_id,bolt_uuid', defaultToNull: false });
    if (error) throw new Error(`Linking ${table} failed: ${error.message}`);
  }
}

/**
 * Creates Rovora drivers and vehicles for the chosen Bolt records and links
 * them. Cars go first so each new driver can be given the car they drive on
 * Bolt. Stays inside the plan's limits; anything over is reported, not added.
 */
export async function importBoltRecords(
  admin: Admin,
  orgId: string,
  selection: BoltImportSelection,
): Promise<BoltImportResult> {
  const [{ drivers: boltDrivers, vehicles: boltVehicles }, rovoraDrivers, rovoraVehicles, room] = await Promise.all([
    loadImportRows(admin, orgId),
    loadRovoraDrivers(admin, orgId),
    loadRovoraVehicles(admin, orgId),
    planRoom(orgId),
  ]);

  const result: BoltImportResult = {
    batchId: null,
    driversAdded: 0,
    vehiclesAdded: 0,
    driversLinked: 0,
    vehiclesLinked: 0,
    driversOverPlan: 0,
    vehiclesOverPlan: 0,
    carsAssigned: 0,
    planName: room.planName,
  };

  const pickedVehicles = uniqueByPlate(sortVehiclesForImport(pick(boltVehicles, classifyVehicle, selection.vehicles)));
  const pickedDrivers = sortDriversForImport(pick(boltDrivers, classifyDriver, selection.drivers));

  // Someone may have added a car or driver by hand since the last sync — link
  // to that record rather than create a duplicate.
  const vehicleLinks: VehicleLink[] = [];
  const vehiclesToCreate: BoltVehicleImportRow[] = [];
  const vehicleIdByBolt = new Map<string, string>();
  for (const v of boltVehicles) if (v.vehicle_id) vehicleIdByBolt.set(v.bolt_uuid, v.vehicle_id);
  for (const v of pickedVehicles) {
    const hit = matchVehicle(
      { registration_number: v.registration_number, normalised_registration_number: v.normalised_reg },
      rovoraVehicles,
    );
    if (hit) {
      vehicleIdByBolt.set(v.bolt_uuid, hit);
      vehicleLinks.push({ ...linkBase(orgId, v.bolt_uuid, 'auto'), vehicle_id: hit });
    } else {
      vehiclesToCreate.push(v);
    }
  }

  const driverLinks: DriverLink[] = [];
  const driversToCreate: BoltDriverImportRow[] = [];
  for (const d of pickedDrivers) {
    const hit = matchDriver(
      {
        uuid: d.bolt_uuid,
        partner_uuid: null,
        first_name: d.first_name,
        last_name: d.last_name,
        display_name: d.display_name,
        email: d.email,
        phone: d.phone ?? '',
      },
      rovoraDrivers,
    );
    if (hit) driverLinks.push({ ...linkBase(orgId, d.bolt_uuid, 'auto'), driver_id: hit });
    else driversToCreate.push(d);
  }

  const vehiclesFit = takeWithinRoom(vehiclesToCreate, room.vehicles);
  const driversFit = takeWithinRoom(driversToCreate, room.drivers);
  result.vehiclesOverPlan = vehiclesFit.left.length;
  result.driversOverPlan = driversFit.left.length;

  const batchId = randomUUID();
  const provisional = new Date().toISOString();

  // ---- vehicles ----------------------------------------------------------------
  const createdVehicleIds = new Set<string>();
  const vehicleRows = vehiclesFit.take.map((v) => ({ src: v, row: { id: randomUUID(), ...rovoraVehicleFromBolt(v) } }));
  for (const part of chunks(vehicleRows)) {
    // A plate that appeared in Rovora a moment ago is skipped, not an error.
    const { data, error } = await admin
      .from('vehicles')
      .upsert(
        part.map((p) => ({ ...p.row, organization_id: orgId, mileage: 0 })),
        { onConflict: 'organization_id,registration_number', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`Adding vehicles failed: ${error.message}`);
    for (const r of (data ?? []) as { id: string }[]) createdVehicleIds.add(r.id);
  }

  const raced: BoltVehicleImportRow[] = [];
  for (const { src, row } of vehicleRows) {
    if (createdVehicleIds.has(row.id)) {
      vehicleIdByBolt.set(src.bolt_uuid, row.id);
      vehicleLinks.push({ ...linkBase(orgId, src.bolt_uuid, 'import', batchId, provisional), vehicle_id: row.id });
    } else {
      raced.push(src);
    }
  }
  if (raced.length) {
    const fresh = await loadRovoraVehicles(admin, orgId);
    for (const v of raced) {
      const hit = matchVehicle({ registration_number: v.registration_number, normalised_registration_number: v.normalised_reg }, fresh);
      if (!hit) continue;
      vehicleIdByBolt.set(v.bolt_uuid, hit);
      vehicleLinks.push({ ...linkBase(orgId, v.bolt_uuid, 'auto'), vehicle_id: hit });
    }
  }
  await writeLinks(admin, 'bolt_vehicles', vehicleLinks);
  result.vehiclesAdded = createdVehicleIds.size;
  result.vehiclesLinked = vehicleLinks.length - createdVehicleIds.size;

  // ---- drivers -----------------------------------------------------------------
  const driverRows = driversFit.take.map((d) => {
    const vehicleId = d.selected_vehicle_uuid ? vehicleIdByBolt.get(d.selected_vehicle_uuid) ?? null : null;
    return {
      bolt: d.bolt_uuid,
      row: { id: randomUUID(), ...rovoraDriverFromBolt(d), assigned_vehicle_id: vehicleId },
    };
  });
  for (const part of chunks(driverRows)) {
    const { error } = await admin
      .from('drivers')
      .insert(part.map((p) => ({ ...p.row, organization_id: orgId, user_id: null })));
    if (error) {
      // The cars added so far are linked and in this batch, so they can be undone.
      await writeLinks(admin, 'bolt_drivers', driverLinks);
      throw new Error(`Adding drivers failed: ${error.message}`);
    }
    for (const p of part) {
      driverLinks.push({ ...linkBase(orgId, p.bolt, 'import', batchId, provisional), driver_id: p.row.id });
    }
    result.driversAdded += part.length;
  }
  await writeLinks(admin, 'bolt_drivers', driverLinks);
  result.driversLinked = driverLinks.length - result.driversAdded;

  // ---- who drives what -----------------------------------------------------------
  const pairs = driverRows
    .filter((p) => p.row.assigned_vehicle_id)
    .map((p) => ({ driverId: p.row.id, vehicleId: p.row.assigned_vehicle_id as string }));
  result.carsAssigned = pairs.length;
  for (const part of chunks(pairs)) {
    const { error } = await admin
      .from('driver_vehicle_assignments')
      .insert(part.map((p) => ({ organization_id: orgId, driver_id: p.driverId, vehicle_id: p.vehicleId })));
    if (error) console.error(`Bolt import: car assignments for org ${orgId} failed:`, error.message);
  }
  // A car that exactly one new driver drives gets them as its driver too —
  // only for cars this import created, never someone's existing car.
  const sole = [...soleDriverByVehicle(pairs)].filter(([vehicleId]) => createdVehicleIds.has(vehicleId));
  for (const part of chunks(sole, 10)) {
    await Promise.all(
      part.map(([vehicleId, driverId]) =>
        admin.from('vehicles').update({ assigned_driver_id: driverId }).eq('id', vehicleId).eq('organization_id', orgId),
      ),
    );
  }

  // ---- bookkeeping ---------------------------------------------------------------
  if (selection.ignoreRest && (selection.drivers !== 'all' || selection.vehicles !== 'all')) {
    await ignoreUnchosen(admin, orgId, boltDrivers, pickedDrivers, classifyDriver, 'bolt_drivers', selection.drivers);
    await ignoreUnchosen(admin, orgId, boltVehicles, pickedVehicles, classifyVehicle, 'bolt_vehicles', selection.vehicles);
  }

  if (result.driversAdded || result.vehiclesAdded) {
    result.batchId = batchId;
    // Stamp the batch AFTER every write above, so "unchanged since the import"
    // (what undo checks) isn't tripped by the import's own updates.
    const stamp = new Date().toISOString();
    for (const table of ['bolt_drivers', 'bolt_vehicles']) {
      await admin.from(table).update({ imported_at: stamp }).eq('organization_id', orgId).eq('import_batch', batchId);
    }
  }
  if (result.vehiclesAdded) await syncExtraVehicleBillingSafe(orgId);

  return result;
}

function linkBase(
  orgId: string,
  boltUuid: string,
  source: 'auto' | 'import',
  batchId: string | null = null,
  at: string | null = null,
): LinkRow {
  return {
    organization_id: orgId,
    bolt_uuid: boltUuid,
    link_source: source,
    import_state: null,
    import_batch: source === 'import' ? batchId : null,
    imported_at: source === 'import' ? at : null,
  };
}

async function ignoreUnchosen<T extends { bolt_uuid: string }>(
  admin: Admin,
  orgId: string,
  all: T[],
  picked: T[],
  classify: (row: T) => BoltImportGroup,
  table: 'bolt_drivers' | 'bolt_vehicles',
  choice: 'all' | string[],
) {
  if (choice === 'all') return;
  const chosen = new Set(picked.map((r) => r.bolt_uuid));
  const rest = all.filter((r) => IMPORT_ALL_GROUPS.has(classify(r)) && !chosen.has(r.bolt_uuid)).map((r) => r.bolt_uuid);
  for (const part of chunks(rest)) {
    await admin.from(table).update({ import_state: 'ignored' }).eq('organization_id', orgId).in('bolt_uuid', part);
  }
}

/** Marks Bolt records as "not added" (or puts them back on offer with state = null). */
export async function setImportState(
  admin: Admin,
  orgId: string,
  items: { drivers: string[]; vehicles: string[] },
  state: 'ignored' | 'pending' | null,
): Promise<void> {
  for (const [table, ids, linkCol] of [
    ['bolt_drivers', items.drivers, 'driver_id'],
    ['bolt_vehicles', items.vehicles, 'vehicle_id'],
  ] as const) {
    for (const part of chunks(ids)) {
      const { error } = await admin
        .from(table)
        .update({ import_state: state })
        .eq('organization_id', orgId)
        .is(linkCol, null)
        .in('bolt_uuid', part);
      if (error) throw new Error(`Updating ${table} failed: ${error.message}`);
    }
  }
}

// --- undo ------------------------------------------------------------------------

export interface BoltUndoResult {
  driversRemoved: number;
  vehiclesRemoved: number;
  /** Edited or used since the import (a shift, a settlement, a damage report…), so left in place. */
  driversKept: number;
  vehiclesKept: number;
}

export class BoltUndoError extends Error {}

/** Ids among `ids` that any of these tables refers to. Null = couldn't check (keep everything). */
async function idsInUse(admin: Admin, tables: string[], column: string, ids: string[]): Promise<Set<string> | null> {
  const used = new Set<string>();
  for (const table of tables) {
    for (const part of chunks(ids)) {
      const { data, error } = await admin.from(table).select(column).in(column, part).range(0, 9999);
      if (error) {
        // A table this install doesn't have can't hold references.
        if (error.code === '42P01' || error.code === 'PGRST205') break;
        console.error(`Bolt undo: checking ${table} failed:`, error.message);
        return null;
      }
      for (const r of (data ?? []) as unknown as Record<string, string>[]) used.add(r[column]);
    }
  }
  return used;
}

/** Edits within a few seconds of the stamp are the import's own writes. */
const untouched = (updatedAt: string | null, importedAt: string) =>
  !updatedAt || new Date(updatedAt).getTime() <= new Date(importedAt).getTime() + 5_000;

/**
 * Takes an import back out: deletes the drivers and cars it created, as long
 * as nobody has edited or used them since, and puts their Bolt records back on
 * offer. Anything that has been touched stays, still linked.
 */
export async function undoBoltImport(admin: Admin, orgId: string, batchId: string): Promise<BoltUndoResult> {
  const [d, v] = await Promise.all([
    admin.from('bolt_drivers').select('bolt_uuid, driver_id, imported_at').eq('organization_id', orgId).eq('import_batch', batchId).range(0, 4999),
    admin.from('bolt_vehicles').select('bolt_uuid, vehicle_id, imported_at').eq('organization_id', orgId).eq('import_batch', batchId).range(0, 4999),
  ]);
  const dRows = (d.data ?? []) as { bolt_uuid: string; driver_id: string | null; imported_at: string }[];
  const vRows = (v.data ?? []) as { bolt_uuid: string; vehicle_id: string | null; imported_at: string }[];
  if (!dRows.length && !vRows.length) throw new BoltUndoError('There’s nothing left to undo from that import.');

  const importedAt = [...dRows, ...vRows].map((r) => r.imported_at).sort().at(-1) as string;
  if (Date.now() - new Date(importedAt).getTime() > UNDO_WINDOW_MS) {
    throw new BoltUndoError('That import is more than a day old, so it can no longer be undone in one go.');
  }

  const driverIds = dRows.map((r) => r.driver_id).filter((id): id is string => Boolean(id));
  const vehicleIds = vRows.map((r) => r.vehicle_id).filter((id): id is string => Boolean(id));

  const [driverRecs, vehicleRecs, driversUsed, vehiclesUsed] = await Promise.all([
    driverIds.length
      ? admin.from('drivers').select('id, user_id, updated_at, assigned_vehicle_id').eq('organization_id', orgId).in('id', driverIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length
      ? admin.from('vehicles').select('id, updated_at').eq('organization_id', orgId).in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
    idsInUse(admin, ['driver_shifts', 'driver_settlements', 'driver_adjustments'], 'driver_id', driverIds),
    idsInUse(admin, ['driver_shifts', 'vehicle_damages', 'vehicle_services'], 'vehicle_id', vehicleIds),
  ]);

  type DriverRec = { id: string; user_id: string | null; updated_at: string | null; assigned_vehicle_id: string | null };
  const drivers = (driverRecs.data ?? []) as DriverRec[];
  const removable = (r: DriverRec) =>
    !r.user_id && untouched(r.updated_at, importedAt) && driversUsed !== null && !driversUsed.has(r.id);
  const removableDrivers = drivers.filter(removable).map((r) => r.id);
  // A car still driven by a driver who stays isn't taken away from them.
  const stillDriven = new Set(drivers.filter((r) => !removable(r) && r.assigned_vehicle_id).map((r) => r.assigned_vehicle_id));
  const removableVehicles = ((vehicleRecs.data ?? []) as { id: string; updated_at: string | null }[])
    .filter((r) => untouched(r.updated_at, importedAt) && vehiclesUsed !== null && !vehiclesUsed.has(r.id) && !stillDriven.has(r.id))
    .map((r) => r.id);

  // Drivers first: they point at the cars.
  for (const part of chunks(removableDrivers)) {
    const { error } = await admin.from('drivers').delete().eq('organization_id', orgId).in('id', part);
    if (error) throw new Error(`Removing imported drivers failed: ${error.message}`);
  }
  for (const part of chunks(removableVehicles)) {
    const { error } = await admin.from('vehicles').delete().eq('organization_id', orgId).in('id', part);
    if (error) throw new Error(`Removing imported vehicles failed: ${error.message}`);
  }

  const goneDrivers = new Set(removableDrivers);
  const goneVehicles = new Set(removableVehicles);
  const reset = { link_source: null, import_state: null, import_batch: null, imported_at: null };
  const resetDrivers = dRows.filter((r) => !r.driver_id || goneDrivers.has(r.driver_id)).map((r) => r.bolt_uuid);
  const resetVehicles = vRows.filter((r) => !r.vehicle_id || goneVehicles.has(r.vehicle_id)).map((r) => r.bolt_uuid);
  for (const part of chunks(resetDrivers)) {
    await admin.from('bolt_drivers').update({ ...reset, driver_id: null }).eq('organization_id', orgId).in('bolt_uuid', part);
  }
  for (const part of chunks(resetVehicles)) {
    await admin.from('bolt_vehicles').update({ ...reset, vehicle_id: null }).eq('organization_id', orgId).in('bolt_uuid', part);
  }
  // What stays is no longer part of an undoable batch.
  for (const table of ['bolt_drivers', 'bolt_vehicles']) {
    await admin.from(table).update({ import_batch: null }).eq('organization_id', orgId).eq('import_batch', batchId);
  }

  if (removableVehicles.length) await syncExtraVehicleBillingSafe(orgId);

  // Nothing imported is left at all → back to a clean first-import screen.
  const [leftD, leftV] = await Promise.all([
    admin.from('bolt_drivers').select('bolt_uuid', { count: 'exact', head: true }).eq('organization_id', orgId).eq('link_source', 'import'),
    admin.from('bolt_vehicles').select('bolt_uuid', { count: 'exact', head: true }).eq('organization_id', orgId).eq('link_source', 'import'),
  ]);
  if ((leftD.count ?? 0) === 0 && (leftV.count ?? 0) === 0) {
    await admin.from('bolt_connections').update({ first_import_at: null }).eq('organization_id', orgId);
    for (const table of ['bolt_drivers', 'bolt_vehicles']) {
      await admin.from(table).update({ import_state: null }).eq('organization_id', orgId).not('import_state', 'is', null);
    }
  }

  return {
    driversRemoved: removableDrivers.length,
    vehiclesRemoved: removableVehicles.length,
    driversKept: dRows.length - resetDrivers.length,
    vehiclesKept: vRows.length - resetVehicles.length,
  };
}

// --- after every sync --------------------------------------------------------------

async function notifyAdmins(admin: Admin, orgId: string, title: string, body: string) {
  const { error } = await admin.from('notifications').insert({
    organization_id: orgId,
    driver_id: null,
    title,
    body,
    type: 'info',
    action_url: '/fleet/bolt#bolt-import',
    target_role: 'admin',
  });
  if (error) console.error(`Bolt import: notifying org ${orgId} failed:`, error.message);
}

/**
 * Runs after a sync has saved the latest Bolt drivers and cars. `fresh` holds
 * the Bolt ids seen for the FIRST time in this sync. Does nothing until the
 * fleet has been through its first import (that screen shows everyone anyway).
 *
 *   review (default)  new ones wait on the Bolt page; the admin gets one
 *                     notification per batch of arrivals.
 *   auto              new ones (and anything still waiting) are added now.
 *   off               nothing.
 */
export async function handleNewBoltMembers(
  admin: Admin,
  conn: { organization_id: string; first_import_at: string | null; new_member_mode: NewMemberMode | null },
  fresh: { drivers: string[]; vehicles: string[] },
): Promise<void> {
  const mode = conn.new_member_mode ?? 'review';
  if (!conn.first_import_at || mode === 'off') return;
  if (mode === 'review' && !fresh.drivers.length && !fresh.vehicles.length) return;

  const orgId = conn.organization_id;
  const { drivers, vehicles } = await loadImportRows(admin, orgId);
  const freshD = new Set(fresh.drivers);
  const freshV = new Set(fresh.vehicles);
  const newDrivers = drivers.filter((r) => freshD.has(r.bolt_uuid) && classifyDriver(r) === 'new').map((r) => r.bolt_uuid);
  const newVehicles = vehicles.filter((r) => freshV.has(r.bolt_uuid) && classifyVehicle(r) === 'new').map((r) => r.bolt_uuid);

  if (mode === 'review') {
    if (!newDrivers.length && !newVehicles.length) return;
    await setImportState(admin, orgId, { drivers: newDrivers, vehicles: newVehicles }, 'pending');
    await notifyAdmins(
      admin,
      orgId,
      `New on Bolt: ${describeCounts(newDrivers.length, newVehicles.length)}`,
      'They joined your Bolt fleet but aren’t in Rovora yet. Open the Bolt page to add them with one tap.',
    );
    return;
  }

  // auto
  const waitingD = drivers.filter((r) => classifyDriver(r) === 'pending').map((r) => r.bolt_uuid);
  const waitingV = vehicles.filter((r) => classifyVehicle(r) === 'pending').map((r) => r.bolt_uuid);
  const wantD = [...newDrivers, ...waitingD];
  const wantV = [...newVehicles, ...waitingV];
  if (!wantD.length && !wantV.length) return;

  const res = await importBoltRecords(admin, orgId, { drivers: wantD, vehicles: wantV });
  if (res.driversAdded || res.vehiclesAdded) {
    await notifyAdmins(
      admin,
      orgId,
      `Added ${describeCounts(res.driversAdded, res.vehiclesAdded)} from Bolt`,
      'They joined your Bolt fleet, so Rovora added them for you. You can undo this from the Bolt page for 24 hours.',
    );
  }
  if (res.driversOverPlan || res.vehiclesOverPlan) {
    // Hold whatever didn't fit, and say so once — when they first arrive.
    await setImportState(admin, orgId, { drivers: newDrivers, vehicles: newVehicles }, 'pending');
    if (newDrivers.length || newVehicles.length) {
      await notifyAdmins(
        admin,
        orgId,
        `Your ${res.planName} plan is full`,
        `${describeCounts(res.driversOverPlan, res.vehiclesOverPlan)} new on Bolt couldn’t be added. Upgrade your plan, then add them from the Bolt page.`,
      );
    }
  }
}
