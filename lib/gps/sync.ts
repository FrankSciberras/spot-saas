// =============================================================================
// GPS SYNC — pull the latest tracker positions for one connected GPS account
// =============================================================================
// Called by:
//   * the in-process scheduler, about once a minute (lib/cron/internal-scheduler)
//   * the Live Map while it's open (POST /api/fleet/gps/refresh) — so positions
//     stay fresh even where the scheduler isn't running (local dev)
//   * "Sync now" / connect on the GPS trackers page
//
// Each run CLAIMS the connection first (an atomic "last synced more than N
// seconds ago?" update), so the scheduler and an open map never both hit the
// provider for the same account in the same minute.
//
// SERVER ONLY — uses the service-role client and decrypts credentials.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { openSecret, sealSecret } from '@/lib/crypto/secret-box';
import { normReg } from '@/lib/bolt/mapping';
import { getGpsProvider } from './providers';
import { GpsProviderError, validLatLng, type GpsCredentials, type GpsDeviceSnapshot } from './types';

export interface GpsConnection {
  id: string;
  organization_id: string;
  provider: string;
  server_url: string | null;
  account_label: string | null;
  credentials_enc: string;
  status: 'connected' | 'error';
  last_error: string | null;
  last_synced_at: string | null;
  device_count: number;
  created_at: string;
}

export interface GpsSyncResult {
  ok: boolean;
  /** false when another run synced this account moments ago. */
  ran: boolean;
  devices: number;
  linked: number;
  error?: string;
}

/** Don't hit a provider more often than this per account. */
export const MIN_SYNC_INTERVAL_MS = 45_000;
/** An account whose credentials were refused is retried this often. */
const ERROR_RETRY_MS = 60 * 60_000;
/** A history point is stored when the tracker moved at least this far… */
const HISTORY_MIN_MOVE_M = 30;
/** …or this long passed since the last one (so stops still show up). */
const HISTORY_MAX_GAP_MS = 10 * 60_000;

export function sealCredentials(credentials: GpsCredentials): string {
  return sealSecret(JSON.stringify(credentials));
}

export function openCredentials(conn: Pick<GpsConnection, 'credentials_enc' | 'server_url'>): GpsCredentials {
  const parsed = JSON.parse(openSecret(conn.credentials_enc)) as GpsCredentials;
  if (conn.server_url && !parsed.server_url) parsed.server_url = conn.server_url;
  return parsed;
}

export function describeGpsError(error: unknown): string {
  if (error instanceof GpsProviderError) return error.message;
  if (error instanceof Error && /Stored secret|decrypt|Unsupported state/i.test(error.message)) {
    return 'The saved login can no longer be read. Please reconnect this GPS account.';
  }
  return 'Something went wrong talking to the GPS platform. Rovora will try again shortly.';
}

/** Distance in metres between two points (haversine). */
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface VehicleRef {
  id: string;
  registration_number: string | null;
}

interface ExistingDevice {
  id: string;
  external_id: string;
  vehicle_id: string | null;
  link_source: 'auto' | 'manual' | null;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  odometer_km: number | null;
  recorded_at: string | null;
}

/**
 * Finds the Rovora vehicle a tracker sits in: its plate, else a plate written
 * inside its name ("ABC 123 – Prius"). Null when nothing matches or when the
 * match is ambiguous.
 */
export function matchVehicleForDevice(
  snap: Pick<GpsDeviceSnapshot, 'plate' | 'name'>,
  vehicles: VehicleRef[],
): string | null {
  const byReg = new Map<string, string[]>();
  for (const v of vehicles) {
    const reg = normReg(v.registration_number);
    if (reg.length < 3) continue;
    byReg.set(reg, [...(byReg.get(reg) ?? []), v.id]);
  }
  const one = (reg: string) => {
    const hits = byReg.get(reg);
    return hits && hits.length === 1 ? hits[0] : null;
  };

  const plate = normReg(snap.plate);
  if (plate.length >= 3) {
    const hit = one(plate);
    if (hit) return hit;
  }

  const name = normReg(snap.name);
  if (name.length >= 3) {
    const exact = one(name);
    if (exact) return exact;
    // The plate appears somewhere inside the tracker's name.
    const contained = [...byReg.keys()].filter((reg) => reg.length >= 4 && name.includes(reg));
    if (contained.length === 1) return one(contained[0]);
  }
  return null;
}

/**
 * Atomically marks a connection as "being synced now". Returns false when it
 * was synced (or claimed) less than `minIntervalMs` ago.
 */
async function claim(admin: SupabaseClient, conn: GpsConnection, minIntervalMs: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - minIntervalMs).toISOString();
  const { data, error } = await admin
    .from('gps_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', conn.id)
    .or(`last_synced_at.is.null,last_synced_at.lt."${cutoff}"`)
    .select('id');
  if (error) {
    console.error('gps sync: claim failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Syncs one GPS account: fetch every tracker, upsert gps_devices, auto-link to
 * vehicles, append history points, drop trackers the platform no longer has.
 */
export async function syncGpsConnection(
  admin: SupabaseClient,
  conn: GpsConnection,
  opts: { minIntervalMs?: number; force?: boolean } = {},
): Promise<GpsSyncResult> {
  const result: GpsSyncResult = { ok: false, ran: false, devices: 0, linked: 0 };
  const adapter = getGpsProvider(conn.provider);
  if (!adapter) return { ...result, error: `Unknown GPS platform "${conn.provider}".` };

  if (!opts.force) {
    const minInterval = conn.status === 'error' ? ERROR_RETRY_MS : (opts.minIntervalMs ?? MIN_SYNC_INTERVAL_MS);
    if (!(await claim(admin, conn, minInterval))) return { ...result, ok: true };
  }
  result.ran = true;

  const orgId = conn.organization_id;
  const wasFailing = conn.status === 'error';

  try {
    const snapshots = await adapter.fetchDevices(openCredentials(conn));
    const syncedAt = new Date().toISOString();

    const [existingRes, vehiclesRes, takenRes] = await Promise.all([
      admin
        .from('gps_devices')
        .select('id, external_id, vehicle_id, link_source, latitude, longitude, speed_kmh, heading, ignition, odometer_km, recorded_at')
        .eq('connection_id', conn.id),
      admin.from('vehicles').select('id, registration_number').eq('organization_id', orgId),
      // Vehicles already linked to a tracker on ANOTHER account of this fleet.
      admin
        .from('gps_devices')
        .select('vehicle_id')
        .eq('organization_id', orgId)
        .neq('connection_id', conn.id)
        .not('vehicle_id', 'is', null),
    ]);
    if (existingRes.error) throw existingRes.error;

    const existing = new Map<string, ExistingDevice>(
      ((existingRes.data ?? []) as ExistingDevice[]).map((d) => [d.external_id, d]),
    );
    const vehicles = (vehiclesRes.data ?? []) as VehicleRef[];
    const taken = new Set<string>(((takenRes.data ?? []) as { vehicle_id: string }[]).map((r) => r.vehicle_id));
    for (const d of existing.values()) if (d.vehicle_id) taken.add(d.vehicle_id);

    // De-duplicate (some platforms list a unit twice across groups).
    const unique = new Map<string, GpsDeviceSnapshot>();
    for (const s of snapshots) if (s.externalId) unique.set(s.externalId, s);

    const rows: Record<string, unknown>[] = [];
    for (const s of unique.values()) {
      const prev = existing.get(s.externalId);
      const hasFix = validLatLng(s.latitude, s.longitude);

      let vehicleId = prev?.vehicle_id ?? null;
      let linkSource = prev?.link_source ?? null;
      // Never touch the operator's own choice (including "not in a vehicle").
      if (linkSource !== 'manual' && !vehicleId) {
        const match = matchVehicleForDevice(s, vehicles.filter((v) => !taken.has(v.id)));
        if (match) {
          vehicleId = match;
          linkSource = 'auto';
          taken.add(match);
        }
      }

      // A fix older than the one we already have (platform hiccup) is ignored.
      const newer =
        hasFix && (!prev?.recorded_at || !s.recordedAt || new Date(s.recordedAt) >= new Date(prev.recorded_at));

      rows.push({
        organization_id: orgId,
        connection_id: conn.id,
        provider: conn.provider,
        external_id: s.externalId,
        name: s.name,
        unique_id: s.uniqueId,
        plate: s.plate,
        vehicle_id: vehicleId,
        link_source: linkSource,
        latitude: newer ? s.latitude : (prev?.latitude ?? null),
        longitude: newer ? s.longitude : (prev?.longitude ?? null),
        speed_kmh: newer ? s.speedKmh : (prev?.speed_kmh ?? null),
        heading: newer ? s.heading : (prev?.heading ?? null),
        ignition: newer ? s.ignition : (prev?.ignition ?? null),
        odometer_km: s.odometerKm ?? prev?.odometer_km ?? null,
        // No timestamp from the platform → don't pretend the fix is fresh.
        recorded_at: newer ? (s.recordedAt ?? prev?.recorded_at ?? null) : (prev?.recorded_at ?? null),
        synced_at: syncedAt,
      });
    }

    let saved: { id: string; external_id: string }[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await admin
        .from('gps_devices')
        .upsert(rows.slice(i, i + 500), { onConflict: 'connection_id,external_id' })
        .select('id, external_id');
      if (error) throw error;
      saved = saved.concat((data ?? []) as { id: string; external_id: string }[]);
    }
    const idByExternal = new Map(saved.map((r) => [r.external_id, r.id]));

    // Privacy (organizations.gps_hide_off_shift, on by default): a car's route
    // is only kept while a driver is on shift in it.
    const [privacyRes, shiftsRes] = await Promise.all([
      admin.from('organizations').select('gps_hide_off_shift').eq('id', orgId).maybeSingle(),
      admin.from('driver_shifts').select('vehicle_id').eq('organization_id', orgId).is('end_time', null),
    ]);
    const hideOffShift = privacyRes.error ? true : privacyRes.data?.gps_hide_off_shift !== false;
    const onShiftVehicles = new Set(
      ((shiftsRes.data ?? []) as { vehicle_id: string | null }[]).map((r) => r.vehicle_id).filter(Boolean),
    );

    // History: one point when the tracker moved, or every 10 min while it sits.
    const history: Record<string, unknown>[] = [];
    for (const s of unique.values()) {
      if (!validLatLng(s.latitude, s.longitude) || !s.recordedAt) continue;
      const deviceId = idByExternal.get(s.externalId);
      if (!deviceId) continue;
      const prev = existing.get(s.externalId);
      const at = s.recordedAt;
      if (prev?.recorded_at && new Date(at) <= new Date(prev.recorded_at)) continue;
      const moved =
        prev?.latitude == null || prev?.longitude == null
          ? Infinity
          : metersBetween(prev.latitude, prev.longitude, s.latitude!, s.longitude!);
      const gap = prev?.recorded_at ? new Date(at).getTime() - new Date(prev.recorded_at).getTime() : Infinity;
      if (moved < HISTORY_MIN_MOVE_M && gap < HISTORY_MAX_GAP_MS) continue;
      const row = rows.find((r) => r.external_id === s.externalId);
      const vehicleId = (row?.vehicle_id as string | null) ?? null;
      if (hideOffShift && (!vehicleId || !onShiftVehicles.has(vehicleId))) continue;
      history.push({
        organization_id: orgId,
        device_id: deviceId,
        vehicle_id: (row?.vehicle_id as string | null) ?? null,
        latitude: s.latitude,
        longitude: s.longitude,
        speed_kmh: s.speedKmh,
        heading: s.heading,
        ignition: s.ignition,
        recorded_at: at,
      });
    }
    if (history.length > 0) {
      const { error } = await admin.from('gps_device_locations').insert(history);
      if (error) console.error('gps sync: history insert failed', error);
    }

    // Trackers the platform no longer lists. Skipped when it suddenly lists
    // NOTHING — far more likely a hiccup than a fleet removing every tracker.
    const gone = [...existing.values()].filter((d) => !unique.has(d.external_id)).map((d) => d.id);
    if (gone.length > 0 && unique.size > 0) {
      await admin.from('gps_devices').delete().in('id', gone);
    }

    await admin
      .from('gps_connections')
      .update({
        status: 'connected',
        last_error: null,
        last_synced_at: syncedAt,
        device_count: unique.size,
        updated_at: syncedAt,
      })
      .eq('id', conn.id);

    result.ok = true;
    result.devices = unique.size;
    result.linked = rows.filter((r) => r.vehicle_id).length;
    return result;
  } catch (error) {
    // Rovora's own GPS server: the fleet can't fix it, so say so plainly and
    // keep it out of the "reconnect" flow — it's ours to fix (logged below).
    const hosted = conn.provider === 'rovora';
    const message = hosted
      ? 'Rovora GPS is having a problem reaching your trackers. We’re on it — positions will catch up automatically.'
      : describeGpsError(error);
    const refused =
      !hosted && error instanceof GpsProviderError && (error.kind === 'auth' || error.kind === 'config');
    if (hosted || !(error instanceof GpsProviderError)) console.error(`GPS sync failed for connection ${conn.id}:`, error);

    await admin
      .from('gps_connections')
      .update(refused ? { status: 'error', last_error: message } : { last_error: message })
      .eq('id', conn.id);

    if (refused && !wasFailing) {
      await admin.from('notifications').insert({
        organization_id: orgId,
        driver_id: null,
        title: `${adapter.name} GPS connection needs attention`,
        body: `Rovora can no longer read your ${adapter.name} trackers — the login was refused. Open GPS trackers to reconnect.`,
        type: 'warning',
        action_url: '/fleet/gps',
        target_role: 'admin',
      });
    }
    result.error = message;
    return result;
  }
}

export async function loadGpsConnections(admin: SupabaseClient, orgId: string): Promise<GpsConnection[]> {
  const { data, error } = await admin
    .from('gps_connections')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as GpsConnection[];
}

/**
 * Every fleet, every account: the scheduler's minute job. Stops taking new
 * accounts after `budgetMs` so a slow provider never delays the next tick.
 */
export async function runGpsSync(admin: SupabaseClient, budgetMs = 40_000): Promise<{ synced: number; failed: number }> {
  const started = Date.now();
  const cutoff = new Date(Date.now() - MIN_SYNC_INTERVAL_MS).toISOString();
  const { data, error } = await admin
    .from('gps_connections')
    .select('*')
    .or(`last_synced_at.is.null,last_synced_at.lt."${cutoff}"`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) {
    // Before the migration is applied there is simply nothing to do.
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('gps sync: loading connections failed', error);
    return { synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  for (const conn of (data ?? []) as GpsConnection[]) {
    if (Date.now() - started > budgetMs) break;
    const res = await syncGpsConnection(admin, conn);
    if (!res.ran) continue;
    if (res.ok) synced++;
    else failed++;
  }
  return { synced, failed };
}
