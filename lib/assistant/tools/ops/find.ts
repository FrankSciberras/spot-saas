// find — look up drivers by name and vehicles by plate / make / model / colour.
// Mirrors app/api/search/route.ts (the ⌘K palette), minus phone search (PII),
// and matches word by word so "white Prius", "Toyota Prius" or "ABC 123" vs a
// stored "ABC123" all hit. Returns ids for get_driver / get_vehicle.

import type { AssistantTool } from '../../types';
import { argEnum, argInt, argString, dedupeSources, searchText } from '../args';
import { one } from './shifts';

type NameRel = { full_name: string | null } | { full_name: string | null }[] | null;
type PlateRel = { registration_number: string | null } | { registration_number: string | null }[] | null;

interface DriverHit {
  id: string;
  full_name: string | null;
  status: string;
  employment_type: string | null;
  vehicles: PlateRel;
}

interface VehicleHit {
  id: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  status: string;
  drivers: NameRel;
}

interface OpenShift {
  driver_id: string;
  vehicle_id: string | null;
  drivers: NameRel;
  vehicles: PlateRel;
}

export const findTool: AssistantTool = {
  name: 'find',
  status: 'Searching…',
  description:
    'Find drivers by name and vehicles by plate, make, model or colour, and get their ids. Call this FIRST whenever a question names a person or a car ("how is Joe doing", "the white Prius", "ABC 123", "Maria\'s car") and then pass the id to get_driver, get_vehicle, shifts_summary, damages, etc. Returns status, the driver\'s assigned vehicle / the vehicle\'s assigned driver, and who is on shift now.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Name, plate, make, model or colour, e.g. "Joe", "ABC 123", "white Prius".' },
      kind: { type: 'string', enum: ['all', 'drivers', 'vehicles'], description: 'Default all.' },
      limit: { type: 'integer', description: 'Max results per kind (default 8, max 15).' },
    },
    required: ['query'],
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const q = searchText(argString(args, 'query', 60));
    const kind = argEnum(args, 'kind', ['all', 'drivers', 'vehicles'] as const, 'all');
    const limit = argInt(args, 'limit', 8, 1, 15);
    if (!q || q.replace(/\s/g, '').length < 2) {
      return { data: { error: 'Give at least two letters or digits of a name or plate.' } };
    }

    // Every word must match. Dots and apostrophes are dropped for the vehicle
    // .or() filter (reserved in PostgREST filter syntax; plates don't use them).
    const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
    const plateWords = q
      .split(/[\s.'-]+/)
      .filter(Boolean)
      .slice(0, 4);

    const [driversRes, vehiclesRes, openRes] = await Promise.all([
      kind === 'vehicles'
        ? null
        : (() => {
            let query = ctx.db
              .from('drivers')
              .select('id, full_name, status, employment_type, vehicles:assigned_vehicle_id (registration_number)')
              .eq('organization_id', ctx.orgId);
            for (const w of words) query = query.ilike('full_name', `%${w}%`);
            return query.order('status', { ascending: true }).order('full_name', { ascending: true }).limit(limit + 1);
          })(),
      kind === 'drivers' || plateWords.length === 0
        ? null
        : (() => {
            // One filter param: and(or(word 1 in any column), or(word 2 …)).
            const anyColumn = (w: string) =>
              `or(registration_number.ilike.%${w}%,make.ilike.%${w}%,model.ilike.%${w}%,color.ilike.%${w}%)`;
            return ctx.db
              .from('vehicles')
              .select('id, registration_number, make, model, year, color, status, drivers:assigned_driver_id (full_name)')
              .eq('organization_id', ctx.orgId)
              .or(`and(${plateWords.map(anyColumn).join(',')})`)
              .order('status', { ascending: true })
              .order('registration_number', { ascending: true })
              .limit(limit + 1);
          })(),
      // Open shifts are few (one per driver at most), so one read covers both lists.
      ctx.db
        .from('driver_shifts')
        .select('driver_id, vehicle_id, drivers:driver_id (full_name), vehicles:vehicle_id (registration_number)')
        .eq('organization_id', ctx.orgId)
        .is('end_time', null)
        .limit(500),
    ]);
    if (driversRes?.error) throw new Error(`drivers: ${driversRes.error.message}`);
    if (vehiclesRes?.error) throw new Error(`vehicles: ${vehiclesRes.error.message}`);
    if (openRes.error) throw new Error(`driver_shifts: ${openRes.error.message}`);

    const open = (openRes.data ?? []) as OpenShift[];
    const shiftByDriver = new Map(open.map((s) => [s.driver_id, one(s.vehicles)?.registration_number || '—']));
    const shiftByVehicle = new Map(open.filter((s) => s.vehicle_id).map((s) => [s.vehicle_id as string, one(s.drivers)?.full_name || 'Unknown driver']));

    const driverRows = (driversRes?.data ?? []) as DriverHit[];
    const vehicleRows = (vehiclesRes?.data ?? []) as VehicleHit[];

    const drivers = driverRows.slice(0, limit).map((d) => ({
      id: d.id,
      name: d.full_name || 'Unnamed driver',
      status: d.status,
      employment_type: d.employment_type ?? undefined,
      assigned_vehicle: one(d.vehicles)?.registration_number ?? undefined,
      on_shift_now_in: shiftByDriver.get(d.id),
    }));
    const vehicles = vehicleRows.slice(0, limit).map((v) => ({
      id: v.id,
      plate: v.registration_number || 'Vehicle',
      make_model: [v.make, v.model].filter(Boolean).join(' ') || undefined,
      year: v.year ?? undefined,
      colour: v.color ?? undefined,
      status: v.status,
      assigned_driver: one(v.drivers)?.full_name ?? undefined,
      on_shift_now: shiftByVehicle.get(v.id),
    }));

    const data: Record<string, unknown> = { query: q };
    if (kind !== 'vehicles') data.drivers = drivers;
    if (kind !== 'drivers') data.vehicles = vehicles;
    if (driverRows.length > limit || vehicleRows.length > limit) data.more_matches = 'More matches exist; ask for a more specific name or plate.';
    if (!drivers.length && !vehicles.length) data.no_matches = 'Nothing matched. Try part of the name or plate, or a different spelling.';

    return {
      data,
      sources: dedupeSources([
        ...drivers.map((d) => ({ label: d.name, href: `/fleet/drivers/${d.id}` })),
        ...vehicles.map((v) => ({ label: v.plate, href: `/fleet/vehicles/${v.id}` })),
      ]).slice(0, 6),
    };
  },
};
