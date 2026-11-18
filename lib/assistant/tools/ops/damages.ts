// damages — vehicle damage reports: open / monitoring / repaired, severity, per vehicle.
// Counts mirror app/fleet/damages/page.tsx (open = status 'open'; severe =
// severity 'severe' and not yet repaired). Repair costs are left out on
// purpose — they belong to the money tools.

import type { AssistantTool } from '../../types';
import { argEnum, argId, capList, dedupeSources } from '../args';
import { PERIOD_SCHEMA, localDay, periodBoundsUtc, resolvePeriod } from '../../period';
import { one, readAll } from './shifts';

const STATUSES = ['unrepaired', 'open', 'monitoring', 'repaired', 'all'] as const;
const SEVERITIES = ['any', 'minor', 'moderate', 'severe'] as const;

// Columns per supabase/saas_install.sql (vehicle_damages, migrations/20260207_vehicle_damages.sql).
// reported_by is the dashboard user who logged it (drivers can't create damage
// records; they attach damage photos to a shift instead — see shifts_summary).
interface DamageRow {
  id: string;
  vehicle_id: string;
  zone: string | null;
  description: string | null;
  severity: string;
  status: string;
  reported_at: string;
  repaired_at: string | null;
  vehicles: { registration_number: string | null; make: string | null; model: string | null } | { registration_number: string | null; make: string | null; model: string | null }[] | null;
  reporter: { full_name: string | null } | { full_name: string | null }[] | null;
}

const clean = (s: string | null, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const damagesTool: AssistantTool = {
  name: 'damages',
  status: 'Checking damages…',
  description:
    'Vehicle damage reports logged in the dashboard: zone, severity (minor / moderate / severe), status (open / monitoring / repaired), when reported and repaired, plus counts per vehicle. Default shows everything not yet repaired. Use for "which cars have open damage", "any severe damage", "damages reported this month", "what damage does ABC 123 have". Optional vehicle_id (from find) and period (by date reported). No repair costs — use the money tools for those.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: [...STATUSES], description: 'Default unrepaired (open + monitoring).' },
      severity: { type: 'string', enum: [...SEVERITIES], description: 'Default any.' },
      vehicle_id: { type: 'string', description: 'Only this vehicle (id from find).' },
      period: { ...PERIOD_SCHEMA, description: 'Only damages REPORTED in this range. Omit for all time.' },
    },
  },
  roles: ['admin', 'staff'],
  async run(ctx, args) {
    const status = argEnum(args, 'status', STATUSES, 'unrepaired');
    const severity = argEnum(args, 'severity', SEVERITIES, 'any');
    const vehicleId = argId(args, 'vehicle_id');
    const period = args.period ? resolvePeriod(ctx, args.period, 'this_month') : null;
    const bounds = period ? periodBoundsUtc(period, ctx.timeZone) : null;
    const statusIn = status === 'unrepaired' ? ['open', 'monitoring'] : status === 'all' ? null : [status];

    const { rows, capped } = await readAll<DamageRow>(
      (from, to) => {
        let query = ctx.db
          .from('vehicle_damages')
          .select(
            'id, vehicle_id, zone, description, severity, status, reported_at, repaired_at, vehicles:vehicle_id (registration_number, make, model), reporter:reported_by (full_name)',
            { count: 'exact' },
          )
          .eq('organization_id', ctx.orgId);
        if (statusIn) query = query.in('status', statusIn);
        if (severity !== 'any') query = query.eq('severity', severity);
        if (vehicleId) query = query.eq('vehicle_id', vehicleId);
        if (bounds) query = query.gte('reported_at', bounds.startIso).lt('reported_at', bounds.endIso);
        return query.order('reported_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
      },
      'vehicle_damages',
      3000,
    );

    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const perVehicle = new Map<string, { vehicle: string; vehicle_id: string; total: number; open: number; monitoring: number; severe_unrepaired: number }>();
    for (const d of rows) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
      const v = perVehicle.get(d.vehicle_id) ?? {
        vehicle: one(d.vehicles)?.registration_number || 'Vehicle',
        vehicle_id: d.vehicle_id,
        total: 0,
        open: 0,
        monitoring: 0,
        severe_unrepaired: 0,
      };
      v.total += 1;
      if (d.status === 'open') v.open += 1;
      if (d.status === 'monitoring') v.monitoring += 1;
      if (d.severity === 'severe' && d.status !== 'repaired') v.severe_unrepaired += 1;
      perVehicle.set(d.vehicle_id, v);
    }
    const vehicles = capList(
      [...perVehicle.values()].sort((a, b) => b.severe_unrepaired - a.severe_unrepaired || b.open - a.open || b.total - a.total),
      25,
    );
    const list = capList(rows, 30);

    const maintenanceOn = ctx.modules.has('maintenance');
    return {
      data: {
        showing: { status, severity, period: period?.label ?? 'all time', vehicle: vehicleId ? vehicles.items[0]?.vehicle ?? vehicleId : 'all' },
        total: rows.length,
        by_status: byStatus,
        by_severity: bySeverity,
        per_vehicle: vehicles.items,
        per_vehicle_truncated: vehicles.truncated,
        damages: list.items.map((d) => {
          const v = one(d.vehicles);
          return {
            vehicle: v?.registration_number || 'Vehicle',
            zone: clean(d.zone, 40).replace(/_/g, ' '),
            severity: d.severity,
            status: d.status,
            reported: localDay(d.reported_at, ctx.timeZone),
            repaired: d.repaired_at ? localDay(d.repaired_at, ctx.timeZone) : undefined,
            description: clean(d.description, 100) || undefined,
            logged_by: one(d.reporter)?.full_name || undefined,
          };
        }),
        truncated: list.truncated,
        ...(capped ? { note: 'Only the newest 3000 damage records were read.' } : {}),
      },
      sources: dedupeSources([
        ...(maintenanceOn ? [{ label: 'Damages', href: '/fleet/damages' }] : []),
        ...vehicles.items.slice(0, 5).map((v) => ({ label: `${v.vehicle} damages`, href: `/fleet/vehicles/${v.vehicle_id}/damages` })),
      ]),
    };
  },
};
