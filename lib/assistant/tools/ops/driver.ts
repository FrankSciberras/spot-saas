// get_driver — one driver: status, vehicles, document expiry dates, shifts in a period.
// Mirrors app/fleet/drivers/[id]/page.tsx and the Drivers list (assigned
// vehicle + driver_vehicle_assignments; on shift = an open shift). Shift numbers
// come from the shared loader in ./shifts, so they match shifts_summary.
// No money: settlements and earnings are the money tools' job.

import type { AssistantTool } from '../../types';
import { argId, dedupeSources } from '../args';
import { PERIOD_SCHEMA, daysBetween, localDay, resolvePeriod } from '../../period';
import { loadShifts, localTime, one, round2, summarizeShifts } from './shifts';

// Columns per supabase/saas_install.sql (drivers) + add_tag_license.sql and
// migrations/20251228_add_employment_type.sql. ID / licence NUMBERS, phone and
// address are deliberately not selected.
const DRIVER_COLUMNS =
  'id, full_name, status, employment_type, created_at, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date, tag_license_expiry_date, vehicles:assigned_vehicle_id (id, registration_number, make, model)';

const DOCS = [
  ['id_card_expiry_date', 'ID card'],
  ['police_conduct_expiry_date', 'Police conduct'],
  ['driving_license_expiry_date', 'Driving licence'],
  ['tag_license_expiry_date', 'Tag licence'],
] as const;

type VehicleRel = { id: string; registration_number: string | null; make: string | null; model: string | null };

interface DriverRow {
  id: string;
  full_name: string | null;
  status: string;
  employment_type: string | null;
  created_at: string;
  id_card_expiry_date: string | null;
  police_conduct_expiry_date: string | null;
  driving_license_expiry_date: string | null;
  tag_license_expiry_date: string | null;
  vehicles: VehicleRel | VehicleRel[] | null;
}

const vehicleName = (v: VehicleRel) =>
  [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Vehicle';

export const getDriverTool: AssistantTool = {
  name: 'get_driver',
  status: 'Looking up the driver…',
  description:
    'Everything operational about ONE driver: status and employment type, assigned vehicle(s), document expiry dates, whether they are on shift now, their last shift, and their shifts in a period (count, days worked, hours, km, missed pre-shift checks). Use for "how is Joe doing this month", "when does Maria\'s licence expire", "what car does Ali drive", or "this driver" on a driver\'s page. Needs driver_id from find (or the driver page being viewed). No pay or settlements.',
  parameters: {
    type: 'object',
    properties: {
      driver_id: { type: 'string', description: 'Driver id from find. Omit on a driver\'s page to use that driver.' },
      period: { ...PERIOD_SCHEMA, description: 'Range for the shift numbers (default this month).' },
    },
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const driverId = argId(args, 'driver_id') ?? (ctx.page?.entity?.type === 'driver' ? ctx.page.entity.id : undefined);
    if (!driverId) return { data: { error: 'No driver given. Call find with the name first, then pass driver_id.' } };
    const period = resolvePeriod(ctx, args.period, 'this_month');

    const { data: driverData, error } = await ctx.db
      .from('drivers')
      .select(DRIVER_COLUMNS)
      .eq('id', driverId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (error) throw new Error(`drivers: ${error.message}`);
    if (!driverData) return { data: { not_found: 'No driver with that id in this fleet. Use find to look them up by name.' } };
    const d = driverData as unknown as DriverRow;

    const [assignRes, lastRes, periodShifts] = await Promise.all([
      ctx.db
        .from('driver_vehicle_assignments')
        .select('vehicles:vehicle_id (id, registration_number, make, model)')
        .eq('organization_id', ctx.orgId)
        .eq('driver_id', driverId)
        .limit(20),
      // Latest shift of any date (open or closed), for "last shift" / "on shift now".
      ctx.db
        .from('driver_shifts')
        .select('start_time, end_time, starting_mileage, ending_mileage, vehicles:vehicle_id (registration_number)')
        .eq('organization_id', ctx.orgId)
        .eq('driver_id', driverId)
        .order('start_time', { ascending: false })
        .limit(1),
      loadShifts(ctx, period, { driverId }),
    ]);
    if (assignRes.error) throw new Error(`driver_vehicle_assignments: ${assignRes.error.message}`);
    if (lastRes.error) throw new Error(`driver_shifts: ${lastRes.error.message}`);

    const primary = one(d.vehicles);
    const others = ((assignRes.data ?? []) as { vehicles: VehicleRel | VehicleRel[] | null }[])
      .map((a) => one(a.vehicles))
      .filter((v): v is VehicleRel => !!v && v.id !== primary?.id);

    type LastShift = {
      start_time: string;
      end_time: string | null;
      starting_mileage: number | null;
      ending_mileage: number | null;
      vehicles: { registration_number: string | null } | { registration_number: string | null }[] | null;
    };
    const last = ((lastRes.data ?? []) as LastShift[])[0];
    const now = Date.now();
    const lastShift = last
      ? {
          date: localDay(last.start_time, ctx.timeZone),
          start: localTime(last.start_time, ctx.timeZone),
          end: last.end_time ? `${localDay(last.end_time, ctx.timeZone)} ${localTime(last.end_time, ctx.timeZone)}` : 'still on shift',
          vehicle: one(last.vehicles)?.registration_number || '—',
          // Open shifts count up to now, capped at 24 h (as in shifts_summary).
          hours: round2(
            Math.max(0, (last.end_time ? Date.parse(last.end_time) : Math.min(now, Date.parse(last.start_time) + 86_400_000)) - Date.parse(last.start_time)) /
              3_600_000,
          ),
          km:
            last.ending_mileage != null && last.starting_mileage != null && last.ending_mileage >= last.starting_mileage
              ? last.ending_mileage - last.starting_mileage
              : undefined,
        }
      : null;

    const documents = DOCS.map(([col, label]) => {
      const date = d[col];
      if (!date) return { document: label, expires: null };
      const left = daysBetween(ctx.today, date);
      return { document: label, expires: date, days_left: left, state: left < 0 ? 'expired' : left <= 30 ? 'expiring' : 'valid' };
    });

    const { shifts, capped } = periodShifts;
    const missed = shifts.filter((s) => s.missedChecks.length > 0).slice(0, 10);

    return {
      data: {
        driver: {
          id: d.id,
          name: d.full_name || 'Unnamed driver',
          status: d.status,
          employment_type: d.employment_type ?? undefined,
          in_fleet_since: localDay(d.created_at, ctx.timeZone),
        },
        assigned_vehicle: primary ? vehicleName(primary) : null,
        also_assigned: others.length ? others.map(vehicleName) : undefined,
        on_shift_now: last && !last.end_time ? { since: `${lastShift?.date} ${lastShift?.start}`, vehicle: lastShift?.vehicle } : false,
        last_shift: lastShift,
        documents,
        shifts: {
          period: period.label,
          ...summarizeShifts(shifts),
          vehicles_driven: [...new Set(shifts.map((s) => s.plate))].slice(0, 6),
          missed_checks: missed.length
            ? missed.map((s) => ({ date: s.day, start: localTime(s.startIso, ctx.timeZone), vehicle: s.plate, missing: s.missedChecks }))
            : undefined,
          ...(capped ? { note: 'Very many shifts; totals cover the newest 5000.' } : {}),
        },
      },
      sources: dedupeSources([
        { label: d.full_name || 'Driver', href: `/fleet/drivers/${d.id}` },
        ...(primary ? [{ label: primary.registration_number || 'Vehicle', href: `/fleet/vehicles/${primary.id}` }] : []),
        ...(ctx.modules.has('rostering') ? [{ label: 'Driver shifts', href: '/fleet/shifts' }] : []),
      ]),
    };
  },
};
