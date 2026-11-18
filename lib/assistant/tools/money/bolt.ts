// bolt_stats — the fleet's Bolt rides and fares for a period.
//
// Mirrors app/fleet/bolt/page.tsx: rides are read from bolt_rides by
// `local_day` (the request's day in the fleet's own Bolt city), "today" is the
// Bolt city's today (fleetToday below, from bolt_connections.utc_offset_minutes),
// the hour-of-day profile uses fleetClock(), periods are trimmed to 92 days,
// and every figure comes from summarizeRides() + its helpers in
// lib/bolt/stats.ts (acceptance, average fare, fares per busy hour, rating).
// The bolt_* tables are service-role only, hence ctx.admin() — always with the
// organization filter.
//
// Fares are what riders paid BEFORE Bolt's commission (the API does not expose
// payouts), in the rides' own currency.

import type { AssistantContext, AssistantTool, Source } from '../../types';
import { argBool, argId, argInt, capList, dedupeSources, money } from '../args';
import { PERIOD_SCHEMA, daysBetween, previousPeriod, resolvePeriod, type Period } from '../../period';
import {
  RIDE_STAT_COLUMNS,
  acceptanceRate,
  averageFare,
  averageRating,
  faresPerBusyHour,
  summarizeRides,
  type RideStatRow,
  type RideTotals,
} from '@/lib/bolt/stats';
import { fleetClock } from '@/lib/bolt/timezone';
import { delta, readAllPages } from './finance';

/** Same ceiling as the Bolt page's custom range. */
const MAX_SPAN_DAYS = 92;
/** ~a busy fleet's 92 days of ride offers. */
const MAX_RIDES = 40_000;
/** A day-by-day list is useful for a week or a month, noise beyond that. */
const MAX_DAYS_LISTED = 31;

const PAYMENT_LABEL: Record<string, string> = {
  in_app: 'In-app (card)',
  cash: 'Cash',
  business: 'Bolt Business',
  card_terminal: 'Card terminal',
  other: 'Other',
};

interface ConnectionRow {
  status: string;
  last_synced_at: string | null;
  utc_offset_minutes: number | null;
  country_code: string | null;
  rides_synced_from: string | null;
}

interface BoltDriverRow {
  bolt_uuid: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  status: string | null;
  driver_id: string | null;
}

interface BoltVehicleRow {
  bolt_uuid: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicle_id: string | null;
}

/** "Today" in the fleet's own Bolt city (copied from app/fleet/bolt/page.tsx). */
function fleetToday(utcOffsetMinutes: number | null): string {
  return new Date(Date.now() + (utcOffsetMinutes ?? 0) * 60_000).toISOString().slice(0, 10);
}

const driverName = (d: BoltDriverRow) =>
  [d.first_name, d.last_name].filter(Boolean).join(' ') || d.display_name || 'Unnamed driver';

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (r: number | null) => (r == null ? null : round1(r * 100));
const moneyOrNull = (n: number | null) => (n == null ? null : money(n));

function totalsOut(t: RideTotals) {
  const rating = averageRating(t);
  return {
    offers: t.offers,
    accepted: t.accepted,
    declined: t.declined,
    finished: t.finished,
    rider_cancelled: t.riderCancelled,
    driver_cancelled: t.driverCancelled,
    rider_no_show: t.noShow,
    acceptance_rate_pct: pct(acceptanceRate(t)),
    fares: money(t.fares),
    tips: money(t.tips),
    cash_fares: money(t.cashFares),
    cancellation_fees: money(t.cancellationFees),
    average_fare: moneyOrNull(averageFare(t)),
    busy_hours: round1(t.busySeconds / 3600),
    fares_per_busy_hour: moneyOrNull(faresPerBusyHour(t)),
    trip_km: round1(t.tripKm),
    average_rating: rating == null ? null : Math.round(rating * 100) / 100,
  };
}

async function loadRides(ctx: AssistantContext, p: Period, driverUuids: string[] | null) {
  const admin = ctx.admin();
  return readAllPages<RideStatRow>(
    'bolt_rides',
    (from, to, withCount) => {
      let q = admin
        .from('bolt_rides')
        .select(RIDE_STAT_COLUMNS, withCount ? { count: 'exact' } : undefined)
        .eq('organization_id', ctx.orgId)
        .gte('local_day', p.from)
        .lte('local_day', p.to);
      if (driverUuids) q = q.in('driver_uuid', driverUuids);
      return q.order('requested_at', { ascending: true }).order('order_reference', { ascending: true }).range(from, to);
    },
    MAX_RIDES,
  );
}

export const boltStatsTool: AssistantTool = {
  name: 'bolt_stats',
  status: 'Checking Bolt…',
  description:
    'Bolt rides for a period from the fleet\'s connected Bolt account: ride offers, accepted / declined, acceptance rate, finished rides, cancellations, fares, tips, cash, average fare, busy hours and fares per busy hour, rating, ' +
    'busiest hours of the day, payment methods, plus top drivers and top vehicles by fares. Optional comparison with the previous period, optional one driver. ' +
    'Use for "how much did Bolt bring in this week vs last", "who earned most on Bolt", "what is our acceptance rate", "busiest hours on Bolt", "which car did most Bolt rides". ' +
    'Fares are what riders paid before Bolt\'s commission, in the rides\' currency. Returns connected:false when the fleet has not connected Bolt. Max 92 days per question.',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      compare_previous: {
        type: 'boolean',
        description: 'Also return the equal-length period just before (this week → last week).',
      },
      driver_id: {
        type: 'string',
        description: 'Only this Rovora driver (id from find / the page); works when the driver is linked to their Bolt account.',
      },
      top: { type: 'integer', description: 'How many top drivers / vehicles to list (default 10, max 40).' },
    },
  },
  roles: ['admin'],
  module: 'bolt',
  async run(ctx, args) {
    const admin = ctx.admin();
    const { data: connData, error: connError } = await admin
      .from('bolt_connections')
      .select('status, last_synced_at, utc_offset_minutes, country_code, rides_synced_from')
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (connError) throw new Error(`bolt_connections: ${connError.message}`);
    const conn = connData as ConnectionRow | null;
    if (!conn) {
      return {
        data: { connected: false, note: 'This fleet has not connected its Bolt account. It can be connected on the Bolt page.' },
        sources: [{ label: 'Bolt', href: '/fleet/bolt' }],
      };
    }

    const top = argInt(args, 'top', 10, 1, 40);
    const compare = argBool(args, 'compare_previous');
    const rovoraDriverId = argId(args, 'driver_id');

    // Resolve on the Bolt city's calendar, like the page does.
    let period = resolvePeriod({ today: fleetToday(conn.utc_offset_minutes) }, args.period, 'last_7_days');
    let trimmed = false;
    if (daysBetween(period.from, period.to) > MAX_SPAN_DAYS - 1) {
      const from = new Date(Date.parse(`${period.to}T00:00:00Z`) - (MAX_SPAN_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
      period = { from, to: period.to, label: `${period.label}, trimmed to the last ${MAX_SPAN_DAYS} days (${from} to ${period.to})` };
      trimmed = true;
    }
    const prevPeriod = compare ? previousPeriod(period) : null;

    const [driversRes, vehiclesRes] = await Promise.all([
      admin
        .from('bolt_drivers')
        .select('bolt_uuid, first_name, last_name, display_name, status, driver_id')
        .eq('organization_id', ctx.orgId)
        .range(0, 4999),
      admin
        .from('bolt_vehicles')
        .select('bolt_uuid, registration_number, make, model, year, vehicle_id')
        .eq('organization_id', ctx.orgId)
        .range(0, 4999),
    ]);
    if (driversRes.error) throw new Error(`bolt_drivers: ${driversRes.error.message}`);
    if (vehiclesRes.error) throw new Error(`bolt_vehicles: ${vehiclesRes.error.message}`);
    const boltDrivers = (driversRes.data ?? []) as BoltDriverRow[];
    const boltVehicles = (vehiclesRes.data ?? []) as BoltVehicleRow[];
    const driverByUuid = new Map(boltDrivers.map((d) => [d.bolt_uuid, d]));
    const vehicleByUuid = new Map(boltVehicles.map((v) => [v.bolt_uuid, v]));

    // One Rovora driver → the Bolt account(s) linked to them.
    let driverUuids: string[] | null = null;
    if (rovoraDriverId) {
      driverUuids = boltDrivers.filter((d) => d.driver_id === rovoraDriverId).map((d) => d.bolt_uuid);
      if (driverUuids.length === 0) {
        return {
          data: {
            connected: true,
            driver_linked: false,
            note: 'This driver is not linked to a Bolt driver account, so their Bolt rides cannot be picked out. Links are set on the Bolt page (Drivers tab).',
          },
          sources: [{ label: 'Bolt', href: '/fleet/bolt' }],
        };
      }
    }

    const [cur, prev] = await Promise.all([
      loadRides(ctx, period, driverUuids),
      prevPeriod ? loadRides(ctx, prevPeriod, driverUuids) : Promise.resolve(null),
    ]);

    const clock = fleetClock(conn.country_code, conn.utc_offset_minutes);
    const summary = summarizeRides(cur.rows, period.from, period.to, clock.hour);
    const prevSummary = prev && prevPeriod ? summarizeRides(prev.rows, prevPeriod.from, prevPeriod.to) : null;

    // ---- drivers ---------------------------------------------------------------
    const drivers = [...summary.byDriver.entries()]
      .map(([uuid, t]) => ({ uuid, t, d: driverByUuid.get(uuid) }))
      .sort((a, b) => b.t.fares - a.t.fares || b.t.finished - a.t.finished);
    const driverList = capList(drivers, top);
    const idle = boltDrivers.filter((d) => d.status === 'active' && !summary.byDriver.has(d.bolt_uuid)).map(driverName);

    // ---- vehicles --------------------------------------------------------------
    const vehicles = [...summary.byVehicle.entries()]
      .map(([uuid, t]) => ({ uuid, t, v: vehicleByUuid.get(uuid) }))
      .sort((a, b) => b.t.fares - a.t.fares || b.t.finished - a.t.finished);
    const vehicleList = capList(vehicles, top);

    // ---- busiest hours (fleet clock) -------------------------------------------
    const peakHours = [...summary.byHour]
      .filter((h) => h.finished > 0)
      .sort((a, b) => b.finished - a.finished || b.fares - a.fares)
      .slice(0, 3)
      .map((h) => ({ hour: `${String(h.hour).padStart(2, '0')}:00`, finished: h.finished, fares: money(h.fares) }));

    const historyFrom = conn.rides_synced_from ? conn.rides_synced_from.slice(0, 10) : null;
    const notes: string[] = [];
    if (trimmed) notes.push(`Bolt questions cover at most ${MAX_SPAN_DAYS} days; the period was trimmed.`);
    if (historyFrom && period.from < historyFrom) notes.push(`Bolt ride history in Rovora starts on ${historyFrom}; earlier days have no data.`);
    if (conn.status === 'error') notes.push('Bolt refused the saved API key at the last sync, so these numbers may be out of date. Reconnect on the Bolt page.');
    if (cur.truncated || prev?.truncated) notes.push(`Only the first ${MAX_RIDES} ride offers were read; totals are incomplete. Ask for a shorter period.`);

    const sources: Source[] = [{ label: 'Bolt', href: '/fleet/bolt' }];
    for (const r of driverList.items) {
      if (sources.length >= 4) break;
      if (r.d?.driver_id) sources.push({ label: driverName(r.d), href: `/fleet/drivers/${r.d.driver_id}` });
    }
    const topCar = vehicleList.items.find((r) => r.v?.vehicle_id);
    if (topCar?.v?.vehicle_id) sources.push({ label: topCar.v.registration_number || 'Vehicle', href: `/fleet/vehicles/${topCar.v.vehicle_id}` });

    const totalsNow = summary.totals;
    return {
      data: {
        connected: true,
        connection_status: conn.status,
        last_synced_at: conn.last_synced_at,
        period: period.label,
        from: period.from,
        to: period.to,
        currency: summary.currency,
        ...(summary.currency !== ctx.currency.code.toUpperCase() ? { fleet_currency: ctx.currency.code } : {}),
        ...(rovoraDriverId && driverUuids ? { driver: driverName(driverByUuid.get(driverUuids[0]) as BoltDriverRow) } : {}),
        totals: totalsOut(totalsNow),
        ...(prevSummary && prevPeriod
          ? {
              previous: { period: prevPeriod.label, from: prevPeriod.from, to: prevPeriod.to, totals: totalsOut(prevSummary.totals) },
              change: {
                fares: delta(totalsNow.fares, prevSummary.totals.fares),
                tips: delta(totalsNow.tips, prevSummary.totals.tips),
                finished: delta(totalsNow.finished, prevSummary.totals.finished),
                acceptance_rate_points:
                  acceptanceRate(totalsNow) != null && acceptanceRate(prevSummary.totals) != null
                    ? round1(((acceptanceRate(totalsNow) as number) - (acceptanceRate(prevSummary.totals) as number)) * 100)
                    : null,
              },
            }
          : {}),
        peak_hours: peakHours,
        ...(summary.byDay.length <= MAX_DAYS_LISTED
          ? { by_day: summary.byDay.map((d) => ({ day: d.day, offers: d.offers, finished: d.finished, fares: money(d.fares), tips: money(d.tips) })) }
          : {}),
        payment_methods: summary.byPayment.map((p) => ({ method: PAYMENT_LABEL[p.key] ?? p.key, rides: p.rides, fares: money(p.fares) })),
        ride_categories: summary.byCategory.slice(0, 8).map((c) => ({ category: c.key, rides: c.rides, fares: money(c.fares) })),
        top_drivers: driverList.items.map(({ t, d }) => ({
          driver: d ? driverName(d) : 'Former driver',
          linked_to_rovora_driver: Boolean(d?.driver_id),
          offers: t.offers,
          finished: t.finished,
          acceptance_rate_pct: pct(acceptanceRate(t)),
          fares: money(t.fares),
          tips: money(t.tips),
          cash_fares: money(t.cashFares),
          busy_hours: round1(t.busySeconds / 3600),
          fares_per_busy_hour: moneyOrNull(faresPerBusyHour(t)),
          average_rating: averageRating(t) == null ? null : Math.round((averageRating(t) as number) * 100) / 100,
        })),
        drivers_with_rides: driverList.total,
        drivers_truncated: driverList.truncated,
        ...(!rovoraDriverId && idle.length
          ? { active_on_bolt_without_rides: capList(idle, 20).items, active_without_rides_count: idle.length }
          : {}),
        top_vehicles: vehicleList.items.map(({ t, v }) => ({
          vehicle: v ? [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Vehicle' : 'Removed vehicle',
          linked_to_rovora_vehicle: Boolean(v?.vehicle_id),
          finished: t.finished,
          fares: money(t.fares),
          busy_hours: round1(t.busySeconds / 3600),
        })),
        vehicles_with_rides: vehicleList.total,
        vehicles_truncated: vehicleList.truncated,
        ...(notes.length ? { notes } : {}),
      },
      sources: dedupeSources(sources).slice(0, 6),
    };
  },
};
