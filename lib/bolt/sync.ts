// =============================================================================
// BOLT SYNC — pulls a connected fleet's Bolt data into Rovora
// =============================================================================
// Called when a fleet first connects (drivers & cars straight away, then the
// ride-history backfill in the background), from the "Sync now" button, and
// hourly by /api/cron/bolt-sync. After the drivers & cars are saved, anyone new
// on Bolt is handed to the fleet import (lib/bolt/import.ts) — held for the
// admin, added, or left alone, as the fleet chose.
//
// Everything here runs with the SERVICE-ROLE client and is always scoped to one
// organization_id — callers are responsible for having checked who is asking.
//
// SERVER ONLY.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { openSecret } from '@/lib/crypto/secret-box';
import { BoltApiError, BoltClient, MAX_RIDE_WINDOW_DAYS, describeBoltError } from './client';
import { driverRow, matchDriver, matchVehicle, rideRow, vehicleRow } from './mapping';
import { loadRovoraDrivers, loadRovoraVehicles } from './rovora';
import { handleNewBoltMembers, type NewMemberMode } from './import';

/** How much ride history to import when a fleet first connects (two pay cycles + slack). */
export const INITIAL_BACKFILL_DAYS = 62;
/**
 * Every sync re-reads the last two days as well as anything new: tips, ratings
 * and fare reviews keep landing on a ride for a while after it finishes.
 */
const OVERLAP_MS = 48 * 3600_000;
const DAY_MS = 86_400_000;
const UPSERT_CHUNK = 500;

export interface BoltConnection {
  organization_id: string;
  client_id: string;
  client_secret_enc: string;
  company_id: number;
  company_name: string | null;
  city_name: string | null;
  country_code: string | null;
  utc_offset_minutes: number;
  status: 'connected' | 'error';
  last_error: string | null;
  last_synced_at: string | null;
  rides_synced_from: string | null;
  rides_synced_through: string | null;
  /** What happens when someone new joins the Bolt fleet (lib/bolt/import.ts). */
  new_member_mode: NewMemberMode;
  /** When the admin went through the first "bring your fleet in" screen. */
  first_import_at: string | null;
  created_at: string;
}

export interface BoltSyncResult {
  ok: boolean;
  drivers: number;
  vehicles: number;
  rides: number;
  /** A plain-English reason when ok is false. */
  error?: string;
}

export async function loadBoltConnection(
  admin: SupabaseClient,
  organizationId: string,
): Promise<BoltConnection | null> {
  const { data } = await admin
    .from('bolt_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return (data as BoltConnection | null) ?? null;
}

/**
 * Has the fleet-import migration (20261123_bolt_fleet_import.sql) been run?
 * Migrations are applied by hand, so code can go live first; until then the
 * sync must not write the new columns, and the import screen stays hidden.
 * The connection row is read with select('*'), so the column is simply there.
 */
export function boltImportReady(conn: BoltConnection | null): boolean {
  return Boolean(conn && 'first_import_at' in conn);
}

/** Builds an API client for a stored connection (decrypts the key secret). */
export function boltClientFor(conn: Pick<BoltConnection, 'client_id' | 'client_secret_enc'>): BoltClient {
  return new BoltClient({ clientId: conn.client_id, clientSecret: openSecret(conn.client_secret_enc) });
}

async function upsertChunks(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  // Bolt occasionally lists the same record twice (seen with vehicles), and
  // Postgres refuses an upsert that names one row twice — so keep the last
  // copy of each key before saving.
  const keys = onConflict.split(',');
  const unique = [...new Map(rows.map((r) => [keys.map((k) => String(r[k])).join('|'), r])).values()];

  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const { error } = await admin.from(table).upsert(unique.slice(i, i + UPSERT_CHUNK), { onConflict });
    if (error) throw new Error(`Saving ${table} failed: ${error.message}`);
  }
  return unique.length;
}

/** '2026-11-10T15:21:17+01:00' → 60. Null when there is no stamp to read. */
function offsetMinutes(stamp: string): number | null {
  if (!stamp) return null;
  if (stamp.endsWith('Z')) return 0;
  const m = /([+-])(\d{2}):(\d{2})$/.exec(stamp);
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Runs one full sync for a fleet: drivers, vehicles, then ride history from
 * where the last sync left off. Never throws — failures are recorded on the
 * connection row and returned as `{ ok: false, error }`.
 */
export async function syncBoltFleet(
  admin: SupabaseClient,
  conn: BoltConnection,
  opts: {
    backfillDays?: number;
    /**
     * 'roster' = drivers & cars only (seconds — used on connect so the import
     * screen can show at once); 'rides' = ride history only; default both.
     */
    only?: 'roster' | 'rides';
  } = {},
): Promise<BoltSyncResult> {
  const orgId = conn.organization_id;
  const startedAt = new Date();
  const syncedAt = startedAt.toISOString();
  const result: BoltSyncResult = { ok: false, drivers: 0, vehicles: 0, rides: 0 };
  // Read now: the admin is told ONCE when a key starts being refused, not on
  // every retry after that.
  const alreadyFailing = conn.status === 'error';

  try {
    const client = boltClientFor(conn);
    const fresh = { drivers: [] as string[], vehicles: [] as string[] };
    const importReady = boltImportReady(conn);

    if (opts.only !== 'rides') {
      // ---- drivers ---------------------------------------------------------------
      const [boltDrivers, rovoraDrivers, existingLinks] = await Promise.all([
        client.getDrivers(conn.company_id),
        loadRovoraDrivers(admin, orgId),
        admin
          .from('bolt_drivers')
          .select('bolt_uuid, driver_id, link_source')
          .eq('organization_id', orgId)
          .range(0, 9999),
      ]);

      // A link the operator set by hand wins over anything we would guess — and
      // so does a hand-made "not linked", which is stored as manual + null. A
      // record CREATED by the fleet import keeps its link the same way, so
      // renaming the driver in Rovora never breaks it.
      const kept = new Map<string, { driverId: string | null; source: 'manual' | 'import' }>();
      const knownDrivers = new Set<string>();
      for (const row of (existingLinks.data ?? []) as { bolt_uuid: string; driver_id: string | null; link_source: string | null }[]) {
        knownDrivers.add(row.bolt_uuid);
        if (row.link_source === 'manual' || row.link_source === 'import') {
          kept.set(row.bolt_uuid, { driverId: row.driver_id, source: row.link_source });
        }
      }
      const liveDriverIds = new Set(rovoraDrivers.map((d) => d.id));

      const driverRows = boltDrivers
        .filter((d) => d.uuid)
        .map((d) => {
          const uuid = d.uuid as string;
          const base = driverRow(orgId, d, syncedAt);
          const keep = kept.get(uuid);
          if (keep) {
            const linked = keep.driverId && liveDriverIds.has(keep.driverId) ? keep.driverId : null;
            return { ...base, driver_id: linked, link_source: keep.source };
          }
          const matched = matchDriver(d, rovoraDrivers);
          return { ...base, driver_id: matched, link_source: matched ? 'auto' : null };
        });
      result.drivers = await upsertChunks(admin, 'bolt_drivers', driverRows, 'organization_id,bolt_uuid');
      fresh.drivers = driverRows.map((r) => r.bolt_uuid).filter((uuid) => !knownDrivers.has(uuid));

      // ---- vehicles --------------------------------------------------------------
      const [boltVehicles, rovoraVehicles, existingVehicleLinks] = await Promise.all([
        client.getVehicles(conn.company_id),
        loadRovoraVehicles(admin, orgId),
        admin
          .from('bolt_vehicles')
          .select(importReady ? 'bolt_uuid, vehicle_id, link_source' : 'bolt_uuid, vehicle_id')
          .eq('organization_id', orgId)
          .range(0, 9999),
      ]);

      // Plates are re-matched every time, except for cars the import created:
      // those keep their link even if the plate is edited in Rovora.
      const importedCars = new Map<string, string | null>();
      const knownVehicles = new Set<string>();
      for (const row of (existingVehicleLinks.data ?? []) as unknown as { bolt_uuid: string; vehicle_id: string | null; link_source?: string | null }[]) {
        knownVehicles.add(row.bolt_uuid);
        if (row.link_source === 'import') importedCars.set(row.bolt_uuid, row.vehicle_id);
      }
      const liveVehicleIds = new Set(rovoraVehicles.map((v) => v.id));

      const vehicleRows = boltVehicles
        .filter((v) => v.uuid)
        .map((v) => {
          const uuid = v.uuid as string;
          if (importedCars.has(uuid)) {
            const linked = importedCars.get(uuid) ?? null;
            return { ...vehicleRow(orgId, v, linked && liveVehicleIds.has(linked) ? linked : null, syncedAt), link_source: 'import' };
          }
          const matched = matchVehicle(v, rovoraVehicles);
          const row = vehicleRow(orgId, v, matched, syncedAt);
          return importReady ? { ...row, link_source: matched ? 'auto' : null } : row;
        });
      result.vehicles = await upsertChunks(admin, 'bolt_vehicles', vehicleRows, 'organization_id,bolt_uuid');
      fresh.vehicles = vehicleRows.map((r) => r.bolt_uuid).filter((uuid) => !knownVehicles.has(uuid));

      // ---- new on Bolt? -------------------------------------------------------------
      // Never allowed to fail the sync: the Bolt numbers matter more.
      try {
        if (importReady) await handleNewBoltMembers(admin, conn, fresh);
      } catch (error) {
        console.error(`Bolt sync: handling new drivers/cars for org ${orgId} failed:`, error);
      }
    }

    if (opts.only === 'roster') {
      await admin
        .from('bolt_connections')
        .update({ status: 'connected', last_error: null, last_synced_at: syncedAt })
        .eq('organization_id', orgId);
      result.ok = true;
      return result;
    }

    // ---- rides -----------------------------------------------------------------
    const cursor = conn.rides_synced_through ? new Date(conn.rides_synced_through) : null;
    const from = cursor
      ? new Date(cursor.getTime() - OVERLAP_MS)
      : new Date(startedAt.getTime() - (opts.backfillDays ?? INITIAL_BACKFILL_DAYS) * DAY_MS);

    // Bolt caps one request at 31 days, so walk the span in 30-day windows.
    const windowMs = (MAX_RIDE_WINDOW_DAYS - 1) * DAY_MS;
    let newestStamp = '';
    for (let start = from.getTime(); start < startedAt.getTime(); start += windowMs) {
      const end = Math.min(start + windowMs, startedAt.getTime());
      const orders = await client.getRideHistory(conn.company_id, new Date(start), new Date(end));
      const rows = orders.filter((o) => o.order_reference && o.request_created_datetime).map((o) => rideRow(orgId, o, syncedAt));
      result.rides += await upsertChunks(admin, 'bolt_rides', rows, 'organization_id,order_reference');
      for (const r of rows) if (r.requested_at > newestStamp) newestStamp = r.requested_at;
    }

    await admin
      .from('bolt_connections')
      .update({
        status: 'connected',
        last_error: null,
        last_synced_at: syncedAt,
        rides_synced_through: syncedAt,
        rides_synced_from: conn.rides_synced_from ?? from.toISOString(),
        utc_offset_minutes: offsetMinutes(newestStamp) ?? conn.utc_offset_minutes ?? 0,
      })
      .eq('organization_id', orgId);

    result.ok = true;
    return result;
  } catch (error) {
    const message = describeBoltError(error);
    // Only a refused KEY flips the connection to "needs attention". A blip
    // (network, rate limit, a database hiccup) just waits for the next run.
    const keyRefused = error instanceof BoltApiError && (error.kind === 'auth' || error.kind === 'forbidden');
    if (!(error instanceof BoltApiError)) console.error(`Bolt sync failed for org ${orgId}:`, error);

    await admin
      .from('bolt_connections')
      .update(keyRefused ? { status: 'error', last_error: message } : { last_error: message })
      .eq('organization_id', orgId);

    if (keyRefused && !alreadyFailing) {
      await admin.from('notifications').insert({
        organization_id: orgId,
        driver_id: null,
        title: 'Bolt connection needs attention',
        body: 'Rovora can no longer read your Bolt data — the API key was refused. Open the Bolt page to reconnect.',
        type: 'warning',
        action_url: '/fleet/bolt',
        target_role: 'admin',
      });
    }

    result.error = message;
    return result;
  }
}
