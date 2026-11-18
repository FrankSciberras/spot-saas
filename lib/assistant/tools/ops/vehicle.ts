// get_vehicle — one vehicle: details, drivers, document expiry, service status,
// damages and shifts in a period. Mirrors app/fleet/vehicles/[id]/page.tsx and
// the Vehicles list (assigned driver + driver_vehicle_assignments; damage counts
// as on that list). The next service uses the shared rule (./services), shift
// numbers the shared loader (./shifts). No costs — the money tools have those.

import type { AssistantTool } from '../../types';
import { argId, dedupeSources } from '../args';
import { PERIOD_SCHEMA, daysBetween, localDay, resolvePeriod } from '../../period';
import { loadShifts, localTime, one, round2, summarizeShifts } from './shifts';
import { loadServiceDue, serviceDueView } from './services';

// Columns per supabase/saas_install.sql (vehicles). GPS / photos are not selected.
const VEHICLE_COLUMNS =
  'id, registration_number, make, model, year, color, mileage, status, insurance_expiry_date, road_license_expiry_date, drivers:assigned_driver_id (id, full_name)';

type DriverRel = { id: string; full_name: string | null };

interface VehicleRow {
  id: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  mileage: number | null;
  status: string;
  insurance_expiry_date: string | null;
  road_license_expiry_date: string | null;
  drivers: DriverRel | DriverRel[] | null;
}

function docState(date: string | null, today: string) {
  if (!date) return { expires: null };
  const left = daysBetween(today, date);
  return { expires: date, days_left: left, state: left < 0 ? 'expired' : left <= 30 ? 'expiring' : 'valid' };
}

export const getVehicleTool: AssistantTool = {
  name: 'get_vehicle',
  status: 'Looking up the vehicle…',
  description:
    'Everything operational about ONE vehicle: plate, make / model / year, status, odometer, assigned and on-shift driver, insurance and road licence expiry, last service and next service due (km and date, when Maintenance is on), unrepaired damages by severity, and its shifts in a period (count, hours, km, drivers). Use for "tell me about ABC 123", "when is the Prius due for service", "who is driving this car", or "this car" on a vehicle\'s page. Needs vehicle_id from find (or the vehicle page being viewed). No costs.',
  parameters: {
    type: 'object',
    properties: {
      vehicle_id: { type: 'string', description: 'Vehicle id from find. Omit on a vehicle\'s page to use that vehicle.' },
      period: { ...PERIOD_SCHEMA, description: 'Range for the shift numbers (default this month).' },
    },
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const vehicleId = argId(args, 'vehicle_id') ?? (ctx.page?.entity?.type === 'vehicle' ? ctx.page.entity.id : undefined);
    if (!vehicleId) return { data: { error: 'No vehicle given. Call find with the plate or model first, then pass vehicle_id.' } };
    const period = resolvePeriod(ctx, args.period, 'this_month');
    const maintenanceOn = ctx.modules.has('maintenance');

    const { data: vehicleData, error } = await ctx.db
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('id', vehicleId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle();
    if (error) throw new Error(`vehicles: ${error.message}`);
    if (!vehicleData) return { data: { not_found: 'No vehicle with that id in this fleet. Use find to look it up by plate.' } };
    const v = vehicleData as unknown as VehicleRow;

    const [assignRes, openRes, damagesRes, periodShifts, lastServiceRes, serviceDue] = await Promise.all([
      ctx.db
        .from('driver_vehicle_assignments')
        .select('drivers:driver_id (id, full_name)')
        .eq('organization_id', ctx.orgId)
        .eq('vehicle_id', vehicleId)
        .limit(20),
      ctx.db
        .from('driver_shifts')
        .select('start_time, drivers:driver_id (id, full_name)')
        .eq('organization_id', ctx.orgId)
        .eq('vehicle_id', vehicleId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1),
      ctx.db
        .from('vehicle_damages')
        .select('severity, status')
        .eq('organization_id', ctx.orgId)
        .eq('vehicle_id', vehicleId)
        .neq('status', 'repaired')
        .limit(500),
      loadShifts(ctx, period, { vehicleId }),
      maintenanceOn
        ? ctx.db
            .from('vehicle_services')
            .select('service_date, service_type, mileage_at_service')
            .eq('organization_id', ctx.orgId)
            .eq('vehicle_id', vehicleId)
            .lte('service_date', ctx.today)
            .order('service_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
        : null,
      maintenanceOn ? loadServiceDue(ctx, { vehicleId }) : null,
    ]);
    if (assignRes.error) throw new Error(`driver_vehicle_assignments: ${assignRes.error.message}`);
    if (openRes.error) throw new Error(`driver_shifts: ${openRes.error.message}`);
    if (damagesRes.error) throw new Error(`vehicle_damages: ${damagesRes.error.message}`);
    if (lastServiceRes?.error) throw new Error(`vehicle_services: ${lastServiceRes.error.message}`);

    const assigned = one(v.drivers);
    const others = ((assignRes.data ?? []) as { drivers: DriverRel | DriverRel[] | null }[])
      .map((a) => one(a.drivers))
      .filter((dr): dr is DriverRel => !!dr && dr.id !== assigned?.id);

    type OpenRow = { start_time: string; drivers: DriverRel | DriverRel[] | null };
    const openShift = ((openRes.data ?? []) as OpenRow[])[0];
    const onShiftDriver = openShift ? one(openShift.drivers) : null;

    const damages = (damagesRes.data ?? []) as { severity: string; status: string }[];
    const bySeverity: Record<string, number> = {};
    for (const dmg of damages) bySeverity[dmg.severity] = (bySeverity[dmg.severity] ?? 0) + 1;

    let service: Record<string, unknown> | string = 'Maintenance module is switched off.';
    if (maintenanceOn) {
      type LastService = { service_date: string; service_type: string | null; mileage_at_service: number | null };
      const last = ((lastServiceRes?.data ?? []) as LastService[])[0];
      const next = serviceDue?.due[0];
      service = {
        last_service: last ? { date: last.service_date, type: last.service_type?.replace(/_/g, ' ') ?? null, km: last.mileage_at_service } : null,
        next_service: next ? serviceDueView(next) : 'No next service (km or date) has been set.',
      };
    }

    const { shifts, capped } = periodShifts;

    return {
      data: {
        vehicle: {
          id: v.id,
          plate: v.registration_number || 'Vehicle',
          make: v.make,
          model: v.model,
          year: v.year ?? undefined,
          colour: v.color ?? undefined,
          status: v.status,
          odometer_km: v.mileage ?? null,
        },
        assigned_driver: assigned?.full_name ?? null,
        also_assigned: others.length ? others.map((dr) => dr.full_name || 'Unnamed driver') : undefined,
        on_shift_now: onShiftDriver
          ? {
              driver: onShiftDriver.full_name || 'Unknown driver',
              since: `${localDay(openShift.start_time, ctx.timeZone)} ${localTime(openShift.start_time, ctx.timeZone)}`,
            }
          : false,
        documents: {
          insurance: docState(v.insurance_expiry_date, ctx.today),
          road_licence: docState(v.road_license_expiry_date, ctx.today),
        },
        service,
        damages: {
          unrepaired: damages.length,
          open: damages.filter((dmg) => dmg.status === 'open').length,
          monitoring: damages.filter((dmg) => dmg.status === 'monitoring').length,
          by_severity: bySeverity,
        },
        shifts: {
          period: period.label,
          ...summarizeShifts(shifts),
          drivers: [...new Set(shifts.map((s) => s.driver))].slice(0, 8),
          km_per_shift: (() => {
            const withKm = shifts.filter((s) => s.km != null);
            return withKm.length ? round2(withKm.reduce((a, s) => a + (s.km ?? 0), 0) / withKm.length) : undefined;
          })(),
          ...(capped ? { note: 'Very many shifts; totals cover the newest 5000.' } : {}),
        },
      },
      sources: dedupeSources([
        { label: v.registration_number || 'Vehicle', href: `/fleet/vehicles/${v.id}` },
        ...(damages.length ? [{ label: 'Damages', href: `/fleet/vehicles/${v.id}/damages` }] : []),
        ...(maintenanceOn ? [{ label: 'Services', href: '/fleet/services' }] : []),
        ...(assigned ? [{ label: assigned.full_name || 'Driver', href: `/fleet/drivers/${assigned.id}` }] : []),
        ...(onShiftDriver && onShiftDriver.id !== assigned?.id
          ? [{ label: onShiftDriver.full_name || 'Driver', href: `/fleet/drivers/${onShiftDriver.id}` }]
          : []),
      ]),
    };
  },
};
