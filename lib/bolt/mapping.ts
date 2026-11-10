// =============================================================================
// BOLT → ROVORA MAPPING (pure functions, no I/O)
// =============================================================================
// Turns Bolt API objects into the rows we keep in bolt_drivers / bolt_vehicles /
// bolt_rides, and matches Bolt drivers & vehicles to the fleet's own Rovora
// records. Kept free of database and network code so it is easy to test.
// =============================================================================

import type {
  BoltDriver,
  BoltDriverBase,
  BoltOrder,
  BoltSuspension,
  BoltVehicle,
} from './client';

/** A Bolt suspension, trimmed to what the dashboard shows. */
export interface StoredSuspension {
  category: string;
  type: string;
  type_code: string;
  document: string | null;
  start: string;
  end: string | null;
  message: string | null;
}

export function compactSuspensions(suspension: BoltSuspension | null | undefined): StoredSuspension[] {
  return (suspension?.current ?? []).map((s) => ({
    category: s.category?.name ?? s.category?.code ?? 'Other',
    type: s.type?.name ?? s.type?.code ?? 'Suspended',
    type_code: s.type?.code ?? '',
    document: s.document_type?.name ?? null,
    start: s.start,
    end: s.end ?? null,
    message: s.message ?? null,
  }));
}

// --- Matching to Rovora records ------------------------------------------------

export interface RovoraDriverRef {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

export interface RovoraVehicleRef {
  id: string;
  registration_number: string | null;
}

const normName = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Phones are written a dozen ways (+356 7912 3456, 0035679123456, 79123456),
 * so compare the last 8 digits — enough to be unique within one fleet.
 */
const phoneTail = (s: string | null | undefined) => {
  const digits = (s ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
};

export const normReg = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Finds the Rovora driver a Bolt driver corresponds to: same email, else same
 * phone, else exactly the same full name. Returns null when nothing matches or
 * when a name is shared by more than one driver (too risky to guess).
 */
export function matchDriver(bolt: BoltDriverBase, candidates: RovoraDriverRef[]): string | null {
  const email = (bolt.email ?? '').trim().toLowerCase();
  if (email) {
    const hit = candidates.find((c) => (c.email ?? '').trim().toLowerCase() === email);
    if (hit) return hit.id;
  }

  const tail = phoneTail(bolt.phone);
  if (tail) {
    const hit = candidates.find((c) => phoneTail(c.phone) === tail);
    if (hit) return hit.id;
  }

  const name = normName(`${bolt.first_name ?? ''} ${bolt.last_name ?? ''}`);
  if (name) {
    const hits = candidates.filter((c) => normName(c.full_name) === name);
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

export function matchVehicle(
  bolt: { registration_number: string | null; normalised_registration_number: string | null },
  candidates: RovoraVehicleRef[],
): string | null {
  const reg = normReg(bolt.normalised_registration_number || bolt.registration_number);
  if (!reg) return null;
  return candidates.find((c) => normReg(c.registration_number) === reg)?.id ?? null;
}

// --- Rows ----------------------------------------------------------------------

export function driverRow(organizationId: string, d: BoltDriver, syncedAt: string) {
  return {
    organization_id: organizationId,
    bolt_uuid: d.uuid as string,
    partner_uuid: d.partner_uuid,
    first_name: d.first_name,
    last_name: d.last_name,
    display_name: d.display_name,
    email: d.email,
    phone: d.phone,
    status: d.status,
    is_online: Boolean(d.is_online),
    added_to_fleet: d.added_to_fleet ?? null,
    deactivated_since: d.deactivated_since ?? null,
    suspensions: compactSuspensions(d.suspension),
    selected_vehicle_uuid: d.vehicles?.selected?.uuid ?? null,
    selected_vehicle_reg: d.vehicles?.selected?.registration_number ?? null,
    cash_rides_enabled: d.settings?.cash_rides_enabled ?? null,
    synced_at: syncedAt,
  };
}

export function vehicleRow(organizationId: string, v: BoltVehicle, vehicleId: string | null, syncedAt: string) {
  return {
    organization_id: organizationId,
    bolt_uuid: v.uuid as string,
    registration_number: v.registration_number,
    normalised_reg: normReg(v.normalised_registration_number || v.registration_number),
    vin: v.vin || null,
    make: v.make,
    model: v.model,
    year: v.year ?? null,
    colour: v.colour,
    seats: v.seats ?? null,
    status: v.status,
    added_to_fleet: v.added_to_fleet ?? null,
    deactivated_since: v.deactivated_since ?? null,
    suspensions: compactSuspensions(v.suspension),
    branding_status: v.branding?.status ?? null,
    vehicle_id: vehicleId,
    synced_at: syncedAt,
  };
}

export function rideRow(organizationId: string, o: BoltOrder, syncedAt: string) {
  const stops = o.stops ?? [];
  const pickup = stops.find((s) => s.type === 'pickup') ?? stops[0] ?? null;
  const dropoff = [...stops].reverse().find((s) => s.type === 'dropoff') ?? null;

  return {
    organization_id: organizationId,
    order_reference: o.order_reference,
    status: o.status,
    ride_type: o.type ?? null,
    is_optional: o.is_optional ?? null,
    category_name: o.category_name ?? null,
    payment_method: o.payment_method ?? null,
    created_by: o.created_by ?? null,
    requested_at: o.request_created_datetime,
    // Bolt stamps times with the fleet city's own offset, so the first ten
    // characters ARE the local calendar day — no timezone maths needed.
    local_day: o.request_created_datetime.slice(0, 10),
    accepted_at: o.driver_accepted_datetime ?? null,
    pickup_at: o.pickup_datetime ?? null,
    finished_at: o.finished_datetime ?? null,
    driver_uuid: o.driver?.uuid ?? null,
    vehicle_uuid: o.vehicle?.uuid ?? null,
    vehicle_reg: o.vehicle?.registration_number ?? null,
    currency: o.price?.currency ? o.price.currency.toUpperCase() : null,
    price_total: o.price?.total ?? null,
    tip: o.price?.tip ?? null,
    booking_fee: o.price?.booking_fee ?? null,
    toll_fee: o.price?.toll_fee ?? null,
    cancellation_fee: o.price?.cancellation_fee ?? null,
    ride_duration_seconds: o.ride_duration_seconds ?? null,
    pickup_duration_seconds: o.pickup_duration_seconds ?? null,
    trip_distance_km: o.pickup_to_dropoff_distance_km ?? null,
    total_distance_km: o.total_ride_distance_km ?? null,
    rating: o.ride_rating ?? null,
    driver_cancelled_reason: o.driver_cancelled_reason ?? null,
    rider_cancelled_reason: o.rider_cancelled_reason ?? null,
    pickup_address: pickup?.address ?? null,
    pickup_lat: pickup?.location?.lat ?? null,
    pickup_lng: pickup?.location?.lng ?? null,
    dropoff_address: dropoff?.address ?? null,
    dropoff_lat: dropoff?.location?.lat ?? null,
    dropoff_lng: dropoff?.location?.lng ?? null,
    synced_at: syncedAt,
  };
}

export type BoltRideRow = ReturnType<typeof rideRow>;
