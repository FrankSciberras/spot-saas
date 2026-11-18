// =============================================================================
// GPS on the Live Map — shared shapes (client-safe: no secrets, no server deps)
// =============================================================================

/** One GPS tracker as the Live Map draws it. */
export interface VehicleGpsItem {
  deviceId: string;
  /** The Rovora vehicle it's fitted in (null = not linked yet). */
  vehicleId: string | null;
  /** Number plate when linked, else the tracker's own name. */
  label: string;
  /** "Toyota Prius" when linked. */
  model: string | null;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  recordedAt: string;
}

/** The columns the map selects from gps_devices (+ the linked vehicle). */
export const GPS_DEVICE_MAP_COLUMNS =
  'id, vehicle_id, name, latitude, longitude, speed_kmh, heading, ignition, recorded_at, vehicles:vehicle_id (registration_number, make, model)';

type VehicleRel = { registration_number: string | null; make: string | null; model: string | null };

export interface GpsDeviceMapRow {
  id: string;
  vehicle_id: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  recorded_at: string | null;
  vehicles?: VehicleRel | VehicleRel[] | null;
}

/**
 * A gps_devices row → map item. Null when the tracker has no usable fix yet.
 * `vehicleOverride` supplies plate/model for Realtime rows (which don't carry
 * the joined vehicle).
 */
export function toVehicleGpsItem(row: GpsDeviceMapRow, vehicleOverride?: VehicleRel | null): VehicleGpsItem | null {
  const lat = row.latitude == null ? null : Number(row.latitude);
  const lng = row.longitude == null ? null : Number(row.longitude);
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  const v = vehicleOverride ?? (Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles) ?? null;
  const linked = row.vehicle_id ? v : null;
  return {
    deviceId: row.id,
    vehicleId: row.vehicle_id,
    label: linked?.registration_number || row.name || 'Tracker',
    model: linked ? [linked.make, linked.model].filter(Boolean).join(' ') || null : null,
    latitude: lat,
    longitude: lng,
    speedKmh: row.speed_kmh == null ? null : Number(row.speed_kmh),
    heading: row.heading == null ? null : Number(row.heading),
    ignition: row.ignition,
    recordedAt: row.recorded_at ?? new Date(0).toISOString(),
  };
}

/** Distance in metres (haversine) — client-side copy of lib/gps/sync's. */
export function metersApart(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type VehicleMotion = 'moving' | 'idling' | 'parked' | 'no-signal';

/**
 * Trackers report every few seconds while driving but as rarely as once an
 * hour when parked with the engine off, so "old position" alone doesn't mean
 * offline — only silence of more than ~70 min does.
 */
export function vehicleMotion(v: Pick<VehicleGpsItem, 'speedKmh' | 'ignition' | 'recordedAt'>, now: number): VehicleMotion {
  const age = now - new Date(v.recordedAt).getTime();
  if (age > 70 * 60_000) return 'no-signal';
  if ((v.speedKmh ?? 0) >= 4 && age < 10 * 60_000) return 'moving';
  if (v.ignition === true && age < 10 * 60_000) return 'idling';
  return 'parked';
}
