// =============================================================================
// BOLT RIDE STATISTICS (pure functions, no I/O)
// =============================================================================
// Rolls ride-offer rows up into the numbers the /fleet/bolt dashboard shows —
// for the whole fleet, per driver and per day. This is also the layer a future
// AI fleet-manager would read, so the definitions are spelled out here once.
//
//   offers        every ride Bolt offered a driver in the period
//   accepted      offers the driver took (whatever happened afterwards)
//   declined      offers the driver rejected or let time out
//   acceptance    accepted / (accepted + declined). A rider cancelling before
//                 the driver answered counts for neither side.
//   finished      rides completed
//   fares         what riders paid for finished rides, BEFORE Bolt's commission
//                 (the API does not expose commission or net payout yet)
//   tips          rider tips on finished rides (not included in fares)
//   cash          the part of fares collected by the driver in cash
//   busy time     driving to the pickup + driving the rider, finished rides
//   fares / hour  fares / busy time — earning power while actually on a job
// =============================================================================

/** The bolt_rides columns the statistics need. */
export interface RideStatRow {
  status: string;
  driver_uuid: string | null;
  vehicle_uuid: string | null;
  requested_at: string;
  local_day: string;
  accepted_at: string | null;
  payment_method: string | null;
  category_name: string | null;
  currency: string | null;
  price_total: number | string | null;
  tip: number | string | null;
  cancellation_fee: number | string | null;
  ride_duration_seconds: number | null;
  pickup_duration_seconds: number | null;
  trip_distance_km: number | string | null;
  rating: number | string | null;
}

export const RIDE_STAT_COLUMNS =
  'status, driver_uuid, vehicle_uuid, requested_at, local_day, accepted_at, payment_method, category_name, currency, price_total, tip, cancellation_fee, ride_duration_seconds, pickup_duration_seconds, trip_distance_km, rating';

export interface RideTotals {
  offers: number;
  accepted: number;
  declined: number;
  finished: number;
  riderCancelled: number;
  driverCancelled: number;
  noShow: number;
  fares: number;
  tips: number;
  cashFares: number;
  cancellationFees: number;
  busySeconds: number;
  tripKm: number;
  ratingSum: number;
  ratingCount: number;
}

export interface DayStats {
  day: string;
  offers: number;
  finished: number;
  fares: number;
  tips: number;
}

/** Finished rides + fares that were REQUESTED in a given hour of the day. */
export interface HourStats {
  hour: number;
  offers: number;
  finished: number;
  fares: number;
}

export interface RideSummary {
  totals: RideTotals;
  byDriver: Map<string, RideTotals>;
  byVehicle: Map<string, RideTotals>;
  byDay: DayStats[];
  /** 24 entries, 00–23, on the fleet's own clock. All zero when no clock was given. */
  byHour: HourStats[];
  /** Finished rides + fares per payment method (in_app, cash, …). */
  byPayment: { key: string; rides: number; fares: number }[];
  /** Finished rides + fares per Bolt category (Bolt, Comfort, …). */
  byCategory: { key: string; rides: number; fares: number }[];
  currency: string;
}

const emptyTotals = (): RideTotals => ({
  offers: 0,
  accepted: 0,
  declined: 0,
  finished: 0,
  riderCancelled: 0,
  driverCancelled: 0,
  noShow: 0,
  fares: 0,
  tips: 0,
  cashFares: 0,
  cancellationFees: 0,
  busySeconds: 0,
  tripKm: 0,
  ratingSum: 0,
  ratingCount: 0,
});

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Statuses that can only happen after the driver said yes. */
const ACCEPTED_STATUSES = new Set(['finished', 'driver_cancelled_after_accept', 'rider_did_not_show']);
const DECLINED_STATUSES = new Set(['driver_rejected', 'driver_did_not_respond']);

function add(t: RideTotals, r: RideStatRow) {
  t.offers++;

  const accepted = r.accepted_at != null || ACCEPTED_STATUSES.has(r.status);
  if (DECLINED_STATUSES.has(r.status)) t.declined++;
  else if (accepted) t.accepted++;

  if (r.status === 'rider_cancelled') t.riderCancelled++;
  if (r.status === 'driver_cancelled_after_accept') t.driverCancelled++;
  if (r.status === 'rider_did_not_show') t.noShow++;

  t.cancellationFees += num(r.cancellation_fee);

  if (r.status !== 'finished') return;
  const fare = num(r.price_total);
  t.finished++;
  t.fares += fare;
  t.tips += num(r.tip);
  if (r.payment_method === 'cash') t.cashFares += fare;
  t.busySeconds += num(r.ride_duration_seconds) + num(r.pickup_duration_seconds);
  t.tripKm += num(r.trip_distance_km);
  if (r.rating != null) {
    t.ratingSum += num(r.rating);
    t.ratingCount++;
  }
}

/**
 * `from` and `to` are inclusive YYYY-MM-DD days; every day between gets a bar.
 * Pass `hourOf` (see lib/bolt/timezone.ts) to also get the hour-of-day profile.
 */
export function summarizeRides(
  rows: RideStatRow[],
  from: string,
  to: string,
  hourOf?: (iso: string) => number,
): RideSummary {
  const totals = emptyTotals();
  const byDriver = new Map<string, RideTotals>();
  const byVehicle = new Map<string, RideTotals>();
  const byHour: HourStats[] = Array.from({ length: 24 }, (_, hour) => ({ hour, offers: 0, finished: 0, fares: 0 }));
  const days = new Map<string, DayStats>();
  const payments = new Map<string, { rides: number; fares: number }>();
  const categories = new Map<string, { rides: number; fares: number }>();
  let currency = '';

  for (const day of eachDay(from, to)) days.set(day, { day, offers: 0, finished: 0, fares: 0, tips: 0 });

  for (const r of rows) {
    add(totals, r);

    if (r.driver_uuid) {
      let t = byDriver.get(r.driver_uuid);
      if (!t) byDriver.set(r.driver_uuid, (t = emptyTotals()));
      add(t, r);
    }

    if (r.vehicle_uuid) {
      let t = byVehicle.get(r.vehicle_uuid);
      if (!t) byVehicle.set(r.vehicle_uuid, (t = emptyTotals()));
      add(t, r);
    }

    const d = days.get(r.local_day);
    if (d) d.offers++;

    const h = hourOf && r.requested_at ? byHour[hourOf(r.requested_at)] : undefined;
    if (h) h.offers++;

    if (r.status === 'finished') {
      const fare = num(r.price_total);
      if (d) {
        d.finished++;
        d.fares += fare;
        d.tips += num(r.tip);
      }
      if (h) {
        h.finished++;
        h.fares += fare;
      }
      bump(payments, r.payment_method || 'other', fare);
      bump(categories, r.category_name || 'Other', fare);
      if (!currency && r.currency) currency = r.currency.toUpperCase();
    }
  }

  const ranked = (m: Map<string, { rides: number; fares: number }>) =>
    [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.rides - a.rides);

  return {
    totals,
    byDriver,
    byVehicle,
    byDay: [...days.values()],
    byHour,
    byPayment: ranked(payments),
    byCategory: ranked(categories),
    currency: currency || 'EUR',
  };
}

function bump(m: Map<string, { rides: number; fares: number }>, key: string, fare: number) {
  const v = m.get(key) ?? { rides: 0, fares: 0 };
  v.rides++;
  v.fares += fare;
  m.set(key, v);
}

/** Every YYYY-MM-DD from `from` to `to`, inclusive (capped so a typo can't loop). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  let t = Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end)) return out;
  for (let i = 0; t <= end && i < 400; i++, t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// --- Derived figures -------------------------------------------------------------

/** 0–1, or null when the driver was offered nothing they could answer. */
export function acceptanceRate(t: RideTotals): number | null {
  const answered = t.accepted + t.declined;
  return answered > 0 ? t.accepted / answered : null;
}

export function averageFare(t: RideTotals): number | null {
  return t.finished > 0 ? t.fares / t.finished : null;
}

/** Fares earned per hour actually spent on jobs. Null under 15 minutes of data. */
export function faresPerBusyHour(t: RideTotals): number | null {
  return t.busySeconds >= 900 ? t.fares / (t.busySeconds / 3600) : null;
}

export function averageRating(t: RideTotals): number | null {
  return t.ratingCount > 0 ? t.ratingSum / t.ratingCount : null;
}
