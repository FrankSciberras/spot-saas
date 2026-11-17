// shifts_summary — shifts, hours, km and missed pre-shift checks per driver or vehicle.
// Hours mirror app/api/shifts/hours/route.ts (the wage-settlement prefill): a
// shift counts in the period it STARTS in (fleet time zone), and a shift still
// open counts up to now, capped at 24 h. Also exports the shift loader that
// get_driver / get_vehicle reuse, so all three report the same numbers.

import type { AssistantContext, AssistantTool } from '../../types';
import { argEnum, argId, capList, dedupeSources } from '../args';
import { PERIOD_SCHEMA, localDay, periodBoundsUtc, resolvePeriod, type Period } from '../../period';

const OPEN_SHIFT_CAP_MS = 24 * 3_600_000;
const PAGE_SIZE = 1000; // PostgREST's default max rows per request on Supabase
const MAX_SHIFT_ROWS = 5000;

type Rel<T> = T | T[] | null | undefined;
/** An embedded many-to-one relation (PostgREST may hand back an object or a 1-item array). */
export function one<T>(rel: Rel<T>): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** "HH:MM" of a timestamp in the fleet's time zone. */
export function localTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Read every row of a query, a page at a time (PostgREST caps each response).
 * `page(from, to)` must build the full, org-scoped query with
 * `{ count: 'exact' }` and end in `.range(from, to)`.
 */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>,
  label: string,
  maxRows = MAX_SHIFT_ROWS,
): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = [];
  for (;;) {
    const from = rows.length;
    const { data, error, count } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (Array.isArray(data) ? data : []) as T[];
    rows.push(...batch);
    const total = count ?? rows.length;
    if (batch.length === 0 || rows.length >= total) return { rows: rows.slice(0, maxRows), capped: false };
    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), capped: true };
  }
}

// Columns verified against supabase/saas_install.sql (driver_shifts) and
// migrations/20260902_shift_lifecycle.sql (ending_mileage, auto_closed_at).
// Photo URLs and notes are read only to derive booleans — never returned.
const SHIFT_COLUMNS =
  'id, driver_id, vehicle_id, start_time, end_time, starting_mileage, ending_mileage, dashcam_checked, car_internal_checked, front_image_url, left_image_url, right_image_url, back_image_url, auto_closed_at, notes, drivers:driver_id (full_name), vehicles:vehicle_id (registration_number)';

interface RawShift {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  start_time: string;
  end_time: string | null;
  starting_mileage: number | null;
  ending_mileage: number | null;
  dashcam_checked: boolean | null;
  car_internal_checked: boolean | null;
  front_image_url: string | null;
  left_image_url: string | null;
  right_image_url: string | null;
  back_image_url: string | null;
  auto_closed_at: string | null;
  notes: string | null;
  drivers: Rel<{ full_name: string | null }>;
  vehicles: Rel<{ registration_number: string | null }>;
}

/** One shift, reduced to what the tools report. */
export interface ShiftFact {
  id: string;
  driverId: string;
  driver: string;
  vehicleId: string | null;
  plate: string;
  /** Fleet-local day the shift started on. */
  day: string;
  startIso: string;
  open: boolean;
  /** Unrounded; open shifts count up to now (max 24 h). */
  hours: number;
  /** Closing − opening odometer; null when the shift has no closing reading. */
  km: number | null;
  missedChecks: ('dashcam' | 'interior')[];
  /** Fewer than the four walk-around photos (front/left/right/back). */
  photosIncomplete: boolean;
  /** Ended by the system (forgotten clock-out / no answer to "still on shift?"). */
  autoClosed: boolean;
  /** The driver attached damage photos when going online. */
  damagePhotos: boolean;
}

/** Go-online stores damage photos as {"damage_image_urls": [...]} in notes. */
function hasDamagePhotos(notes: string | null): boolean {
  if (!notes || !notes.includes('damage_image_urls')) return false;
  try {
    const parsed: unknown = JSON.parse(notes);
    const urls = parsed && typeof parsed === 'object' ? (parsed as { damage_image_urls?: unknown }).damage_image_urls : undefined;
    return Array.isArray(urls) && urls.length > 0;
  } catch {
    return false;
  }
}

function toFact(r: RawShift, timeZone: string, now: number): ShiftFact {
  const start = Date.parse(r.start_time);
  const end = r.end_time ? Date.parse(r.end_time) : Math.min(now, start + OPEN_SHIFT_CAP_MS);
  const hours = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3_600_000 : 0;
  const km =
    r.ending_mileage != null && r.starting_mileage != null && r.ending_mileage >= r.starting_mileage
      ? r.ending_mileage - r.starting_mileage
      : null;
  const missedChecks: ShiftFact['missedChecks'] = [];
  // NOT NULL DEFAULT FALSE in the schema; treat a null from old rows as missed too.
  if (r.dashcam_checked !== true) missedChecks.push('dashcam');
  if (r.car_internal_checked !== true) missedChecks.push('interior');
  const photos = [r.front_image_url, r.left_image_url, r.right_image_url, r.back_image_url].filter(Boolean).length;
  return {
    id: r.id,
    driverId: r.driver_id,
    driver: one(r.drivers)?.full_name || 'Unknown driver',
    vehicleId: r.vehicle_id,
    plate: one(r.vehicles)?.registration_number || '—',
    day: localDay(r.start_time, timeZone),
    startIso: r.start_time,
    open: !r.end_time,
    hours,
    km,
    missedChecks,
    photosIncomplete: photos < 4,
    autoClosed: !!r.auto_closed_at,
    damagePhotos: hasDamagePhotos(r.notes),
  };
}

/** Shifts that STARTED in `period` (fleet time zone), newest first. */
export async function loadShifts(
  ctx: AssistantContext,
  period: Pick<Period, 'from' | 'to'>,
  filter: { driverId?: string; vehicleId?: string } = {},
): Promise<{ shifts: ShiftFact[]; capped: boolean }> {
  const { startIso, endIso } = periodBoundsUtc(period, ctx.timeZone);
  const { rows, capped } = await readAll<RawShift>((from, to) => {
    let query = ctx.db
      .from('driver_shifts')
      .select(SHIFT_COLUMNS, { count: 'exact' })
      .eq('organization_id', ctx.orgId)
      .gte('start_time', startIso)
      .lt('start_time', endIso);
    if (filter.driverId) query = query.eq('driver_id', filter.driverId);
    if (filter.vehicleId) query = query.eq('vehicle_id', filter.vehicleId);
    return query.order('start_time', { ascending: false }).order('id', { ascending: true }).range(from, to);
  }, 'driver_shifts');
  const now = Date.now();
  return { shifts: rows.map((r) => toFact(r, ctx.timeZone, now)), capped };
}

export interface ShiftTotals {
  shifts: number;
  days_worked: number;
  hours: number;
  km: number;
  /** Shifts with no closing odometer, so their km is unknown (not counted in km). */
  km_missing?: number;
  /** Shifts where the dashcam and/or interior check box was not ticked. */
  check_misses?: number;
  photos_incomplete?: number;
  auto_closed?: number;
  damage_photo_shifts?: number;
  on_shift_now?: boolean;
}

/** Totals for a set of shifts. Optional counts are left out when zero, to keep output small. */
export function summarizeShifts(shifts: ShiftFact[]): ShiftTotals {
  const days = new Set<string>();
  let hours = 0;
  let km = 0;
  let kmMissing = 0;
  let misses = 0;
  let photos = 0;
  let auto = 0;
  let damage = 0;
  let open = false;
  for (const s of shifts) {
    days.add(s.day);
    hours += s.hours;
    if (s.km == null) kmMissing += 1;
    else km += s.km;
    if (s.missedChecks.length) misses += 1;
    if (s.photosIncomplete) photos += 1;
    if (s.autoClosed) auto += 1;
    if (s.damagePhotos) damage += 1;
    if (s.open) open = true;
  }
  const out: ShiftTotals = { shifts: shifts.length, days_worked: days.size, hours: round2(hours), km: Math.round(km) };
  if (kmMissing) out.km_missing = kmMissing;
  if (misses) out.check_misses = misses;
  if (photos) out.photos_incomplete = photos;
  if (auto) out.auto_closed = auto;
  if (damage) out.damage_photo_shifts = damage;
  if (open) out.on_shift_now = true;
  return out;
}

type GroupRow = ShiftTotals & { id: string; name: string; also: string[] };

export const shiftsSummaryTool: AssistantTool = {
  name: 'shifts_summary',
  status: 'Checking shifts…',
  description:
    'Logged shifts (driver clock-in to clock-out) for a period, grouped per driver (default) or per vehicle: number of shifts, days worked, hours, km driven, and MISSED PRE-SHIFT CHECKS (dashcam / interior checkbox not ticked when going online), plus a list of the shifts with missed checks. When grouped by driver it also lists active drivers with NO shifts in the period; by vehicle, active vehicles that were not used. Use for "who hasn\'t done a pre-shift check this week", "hours per driver last week", "who didn\'t work yesterday", "how many km did ABC 123 do this month", "who is on shift". Pass driver_id / vehicle_id (from find) to narrow it.',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      group_by: { type: 'string', enum: ['driver', 'vehicle'], description: 'Default driver.' },
      driver_id: { type: 'string', description: 'Only this driver (id from find).' },
      vehicle_id: { type: 'string', description: 'Only this vehicle (id from find).' },
    },
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const period = resolvePeriod(ctx, args.period, 'this_week');
    const groupBy = argEnum(args, 'group_by', ['driver', 'vehicle'] as const, 'driver');
    const driverId = argId(args, 'driver_id');
    const vehicleId = argId(args, 'vehicle_id');
    const unfiltered = !driverId && !vehicleId;

    const { shifts, capped } = await loadShifts(ctx, period, { driverId, vehicleId });

    // Group: per driver lists the plates they drove; per vehicle the drivers.
    const groups = new Map<string, { name: string; shifts: ShiftFact[]; also: Set<string> }>();
    for (const s of shifts) {
      const key = groupBy === 'driver' ? s.driverId : s.vehicleId ?? 'none';
      const name = groupBy === 'driver' ? s.driver : s.plate;
      const g = groups.get(key) ?? { name, shifts: [], also: new Set<string>() };
      g.shifts.push(s);
      g.also.add(groupBy === 'driver' ? s.plate : s.driver);
      groups.set(key, g);
    }
    const rows: GroupRow[] = [...groups.entries()]
      .map(([id, g]) => ({ id, name: g.name, ...summarizeShifts(g.shifts), also: [...g.also].slice(0, 4) }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
    const list = capList(rows, 40);

    // Shifts started without both pre-shift checks, newest first.
    const missed = shifts.filter((s) => s.missedChecks.length > 0);
    const missedList = capList(missed, 25);

    // Who did NOT work: active drivers (or vehicles) with no shift at all.
    let idle: { items: { id: string; name: string }[]; total: number; truncated: boolean } | undefined;
    if (unfiltered && groupBy === 'driver') {
      const { data, error } = await ctx.db
        .from('drivers')
        .select('id, full_name, employment_type')
        .eq('organization_id', ctx.orgId)
        .eq('status', 'active')
        .order('full_name')
        .limit(1000);
      if (error) throw new Error(`drivers: ${error.message}`);
      const drivers = (data ?? []) as { id: string; full_name: string | null; employment_type: string | null }[];
      idle = capList(
        drivers
          .filter((d) => d.employment_type !== 'terminated' && !groups.has(d.id))
          .map((d) => ({ id: d.id, name: d.full_name || 'Unnamed driver' })),
        40,
      );
    } else if (unfiltered) {
      const { data, error } = await ctx.db
        .from('vehicles')
        .select('id, registration_number')
        .eq('organization_id', ctx.orgId)
        .eq('status', 'active')
        .order('registration_number')
        .limit(1000);
      if (error) throw new Error(`vehicles: ${error.message}`);
      const vehicles = (data ?? []) as { id: string; registration_number: string | null }[];
      idle = capList(
        vehicles.filter((v) => !groups.has(v.id)).map((v) => ({ id: v.id, name: v.registration_number || 'Vehicle' })),
        40,
      );
    }

    const isDriver = groupBy === 'driver';
    const data: Record<string, unknown> = {
      period: period.label,
      grouped_by: groupBy,
      totals: { ...summarizeShifts(shifts), [isDriver ? 'drivers' : 'vehicles']: groups.size },
      [isDriver ? 'drivers' : 'vehicles']: list.items.map(({ id, name, also, ...totals }) => ({
        [isDriver ? 'driver' : 'vehicle']: name,
        [isDriver ? 'driver_id' : 'vehicle_id']: id,
        ...totals,
        [isDriver ? 'vehicles' : 'drivers']: also,
      })),
      truncated: list.truncated,
      missed_checks: {
        shifts: missed.length,
        drivers: new Set(missed.map((s) => s.driverId)).size,
        list: missedList.items.map((s) => ({
          date: s.day,
          start: localTime(s.startIso, ctx.timeZone),
          driver: s.driver,
          vehicle: s.plate,
          missing: s.missedChecks,
        })),
        truncated: missedList.truncated,
      },
    };
    if (idle) {
      data[isDriver ? 'active_drivers_without_shifts' : 'active_vehicles_not_used'] = {
        count: idle.total,
        list: idle.items.map((i) => ({ name: i.name, id: i.id })),
        truncated: idle.truncated,
      };
    }
    if (capped) data.note = `Only the newest ${MAX_SHIFT_ROWS} shifts were read; use a shorter period for exact totals.`;

    const sources = [
      ...(ctx.modules.has('rostering') ? [{ label: 'Driver shifts', href: '/fleet/shifts' }] : []),
      ...list.items
        .filter((r) => r.id !== 'none')
        .slice(0, 5)
        .map((r) => ({ label: r.name, href: isDriver ? `/fleet/drivers/${r.id}` : `/fleet/vehicles/${r.id}` })),
    ];
    return { data, sources: dedupeSources(sources) };
  },
};
