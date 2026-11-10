// =============================================================================
// BOLT SYNC — pulls a connected fleet's Bolt data into Rovora
// =============================================================================
// Called when a fleet first connects (with a history backfill), from the
// "Sync now" button, and hourly by /api/cron/bolt-sync.
//
// Everything here runs with the SERVICE-ROLE client and is always scoped to one
// organization_id — callers are responsible for having checked who is asking.
//
// SERVER ONLY.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { openSecret } from '@/lib/crypto/secret-box';
import { BoltApiError, BoltClient, MAX_RIDE_WINDOW_DAYS, describeBoltError } from './client';
import {
  driverRow,
  matchDriver,
  matchVehicle,
  rideRow,
  vehicleRow,
  type RovoraDriverRef,
  type RovoraVehicleRef,
} from './mapping';

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

/** The fleet's own drivers, with their login email, for matching to Bolt's. */
async function loadRovoraDrivers(admin: SupabaseClient, organizationId: string): Promise<RovoraDriverRef[]> {
  const { data: drivers } = await admin
    .from('drivers')
    .select('id, full_name, phone, user_id')
    .eq('organization_id', organizationId)
    .range(0, 4999);

  const rows = (drivers ?? []) as { id: string; full_name: string | null; phone: string | null; user_id: string | null }[];
  const userIds = rows.map((d) => d.user_id).filter((id): id is string => Boolean(id));

  const emailById = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data: users } = await admin.from('users').select('id, email').in('id', userIds.slice(i, i + 200));
    for (const u of (users ?? []) as { id: string; email: string | null }[]) {
      if (u.email) emailById.set(u.id, u.email);
    }
  }

  return rows.map((d) => ({
    id: d.id,
    full_name: d.full_name,
    phone: d.phone,
    email: d.user_id ? emailById.get(d.user_id) ?? null : null,
  }));
}

/**
 * Runs one full sync for a fleet: drivers, vehicles, then ride history from
 * where the last sync left off. Never throws — failures are recorded on the
 * connection row and returned as `{ ok: false, error }`.
 */
export async function syncBoltFleet(
  admin: SupabaseClient,
  conn: BoltConnection,
  opts: { backfillDays?: number } = {},
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
    // so does a hand-made "not linked", which is stored as manual + null.
    const manual = new Map<string, string | null>();
    for (const row of (existingLinks.data ?? []) as { bolt_uuid: string; driver_id: string | null; link_source: string | null }[]) {
      if (row.link_source === 'manual') manual.set(row.bolt_uuid, row.driver_id);
    }
    const liveDriverIds = new Set(rovoraDrivers.map((d) => d.id));

    const driverRows = boltDrivers
      .filter((d) => d.uuid)
      .map((d) => {
        const uuid = d.uuid as string;
        const base = driverRow(orgId, d, syncedAt);
        if (manual.has(uuid)) {
          const linked = manual.get(uuid) ?? null;
          return { ...base, driver_id: linked && liveDriverIds.has(linked) ? linked : null, link_source: 'manual' };
        }
        const matched = matchDriver(d, rovoraDrivers);
        return { ...base, driver_id: matched, link_source: matched ? 'auto' : null };
      });
    result.drivers = await upsertChunks(admin, 'bolt_drivers', driverRows, 'organization_id,bolt_uuid');

    // ---- vehicles --------------------------------------------------------------
    const [boltVehicles, rovoraVehiclesRes] = await Promise.all([
      client.getVehicles(conn.company_id),
      admin.from('vehicles').select('id, registration_number').eq('organization_id', orgId).range(0, 4999),
    ]);
    const rovoraVehicles = (rovoraVehiclesRes.data ?? []) as RovoraVehicleRef[];

    const vehicleRows = boltVehicles
      .filter((v) => v.uuid)
      .map((v) => vehicleRow(orgId, v, matchVehicle(v, rovoraVehicles), syncedAt));
    result.vehicles = await upsertChunks(admin, 'bolt_vehicles', vehicleRows, 'organization_id,bolt_uuid');

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
