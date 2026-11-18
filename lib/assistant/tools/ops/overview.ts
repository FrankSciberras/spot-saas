// fleet_overview — one-call snapshot of the fleet: headcount, vehicles by status,
// who is on shift now, document / service / damage / reminder counts.
// Driver and vehicle counts mirror app/fleet/page.tsx (that page still buckets
// vehicles as 'idle' / 'service', which the enum doesn't have — the real values
// are active | in_service | out_of_service). On-shift = open shift (end_time null),
// as on the Drivers page. Module-gated counts are skipped when the module is off.

import type { AssistantTool } from '../../types';
import { capList, dedupeSources } from '../args';
import { daysBetween } from '../../period';
import { localTime, one, round2 } from './shifts';
import { loadServiceDue } from './services';
import { REMINDERS_NOT_ALLOWED, canViewReminders, isOverdue, loadActiveReminders } from './reminders';

// Same document set as documents_expiring, so the two tools agree.
const DRIVER_DOC_COLUMNS = ['id_card_expiry_date', 'police_conduct_expiry_date', 'driving_license_expiry_date', 'tag_license_expiry_date'] as const;
const VEHICLE_DOC_COLUMNS = ['insurance_expiry_date', 'road_license_expiry_date'] as const;

export const fleetOverviewTool: AssistantTool = {
  name: 'fleet_overview',
  status: 'Looking over the fleet…',
  description:
    'A snapshot of the whole fleet right now: drivers active / inactive, vehicles by status (active, in service, out of service), who is on shift now, how many documents are expired or expire soon (within the fleet’s warning window, 30 days unless changed in Settings), vehicles overdue / due soon for service, open damages, and open / overdue reminders. Use for "how is the fleet doing", "give me an overview", "how many drivers are working right now", or as a first step before drilling in with a more specific tool.',
  parameters: { type: 'object', properties: {} },
  roles: ['admin', 'staff'],
  async run(ctx) {
    const until = new Date(`${ctx.today}T00:00:00Z`);
    until.setUTCDate(until.getUTCDate() + ctx.settings.docWarningDays);
    const horizon = until.toISOString().slice(0, 10);
    const maintenanceOn = ctx.modules.has('maintenance');
    const remindersOn = ctx.modules.has('reminders');

    const [driversRes, vehiclesRes, openShiftsRes, driverDocsRes, vehicleDocsRes, damagesRes] = await Promise.all([
      ctx.db.from('drivers').select('id, status').eq('organization_id', ctx.orgId).limit(5000),
      ctx.db.from('vehicles').select('id, status').eq('organization_id', ctx.orgId).limit(5000),
      ctx.db
        .from('driver_shifts')
        .select('id, start_time, drivers:driver_id (full_name), vehicles:vehicle_id (registration_number)')
        .eq('organization_id', ctx.orgId)
        .is('end_time', null)
        .order('start_time', { ascending: true })
        .limit(500),
      ctx.db
        .from('drivers')
        .select(DRIVER_DOC_COLUMNS.join(', '))
        .eq('organization_id', ctx.orgId)
        .or(DRIVER_DOC_COLUMNS.map((c) => `${c}.lte.${horizon}`).join(','))
        .limit(5000),
      ctx.db
        .from('vehicles')
        .select(VEHICLE_DOC_COLUMNS.join(', '))
        .eq('organization_id', ctx.orgId)
        .or(VEHICLE_DOC_COLUMNS.map((c) => `${c}.lte.${horizon}`).join(','))
        .limit(5000),
      ctx.db.from('vehicle_damages').select('severity, status').eq('organization_id', ctx.orgId).neq('status', 'repaired').limit(5000),
    ]);
    for (const [label, res] of [
      ['drivers', driversRes],
      ['vehicles', vehiclesRes],
      ['driver_shifts', openShiftsRes],
      ['driver documents', driverDocsRes],
      ['vehicle documents', vehicleDocsRes],
      ['vehicle_damages', damagesRes],
    ] as const) {
      if (res.error) throw new Error(`${label}: ${res.error.message}`);
    }

    const drivers = (driversRes.data ?? []) as { status: string }[];
    const vehicles = (vehiclesRes.data ?? []) as { status: string }[];
    const countBy = (rows: { status: string }[], s: string) => rows.filter((r) => r.status === s).length;

    // Documents: count each expired / expiring document (a driver can have several).
    let expired = 0;
    let expiring = 0;
    const tally = (rows: Record<string, string | null>[], cols: readonly string[]) => {
      for (const row of rows) {
        for (const c of cols) {
          const date = row[c];
          if (!date || date > horizon) continue;
          if (daysBetween(ctx.today, date) < 0) expired += 1;
          else expiring += 1;
        }
      }
    };
    tally((driverDocsRes.data ?? []) as unknown as Record<string, string | null>[], DRIVER_DOC_COLUMNS);
    tally((vehicleDocsRes.data ?? []) as unknown as Record<string, string | null>[], VEHICLE_DOC_COLUMNS);

    // On shift now (open shifts; the shift-check / 24 h close keeps these honest).
    type OpenShift = {
      start_time: string;
      drivers: { full_name: string | null } | { full_name: string | null }[] | null;
      vehicles: { registration_number: string | null } | { registration_number: string | null }[] | null;
    };
    const open = (openShiftsRes.data ?? []) as OpenShift[];
    const now = Date.now();
    const onShift = capList(
      open.map((s) => ({
        driver: one(s.drivers)?.full_name || 'Unknown driver',
        vehicle: one(s.vehicles)?.registration_number || '—',
        since: localTime(s.start_time, ctx.timeZone),
        hours_so_far: round2(Math.max(0, now - Date.parse(s.start_time)) / 3_600_000),
      })),
      20,
    );

    const damages = (damagesRes.data ?? []) as { severity: string; status: string }[];
    const skipped: string[] = [];

    let services: Record<string, number> | undefined;
    if (maintenanceOn) {
      const { due } = await loadServiceDue(ctx);
      services = {
        overdue: due.filter((d) => d.status === 'overdue').length,
        due_soon: due.filter((d) => d.status === 'due_soon').length,
      };
    } else {
      skipped.push('services (the Maintenance module is switched off)');
    }

    let reminders: Record<string, number> | string | undefined;
    if (!remindersOn) {
      skipped.push('reminders (the Reminders module is switched off)');
    } else if (!(await canViewReminders(ctx))) {
      reminders = REMINDERS_NOT_ALLOWED;
    } else {
      const active = await loadActiveReminders(ctx);
      reminders = {
        active: active.length,
        overdue: active.filter((r) => isOverdue(r, now)).length,
        assigned_to_me: active.filter((r) => r.assigned_to === ctx.userId).length,
      };
    }

    return {
      data: {
        fleet: ctx.orgName,
        today: ctx.today,
        drivers: { total: drivers.length, active: countBy(drivers, 'active'), inactive: countBy(drivers, 'inactive') },
        vehicles: {
          total: vehicles.length,
          active: countBy(vehicles, 'active'),
          in_service: countBy(vehicles, 'in_service'),
          out_of_service: countBy(vehicles, 'out_of_service'),
        },
        on_shift_now: { count: open.length, drivers: onShift.items, truncated: onShift.truncated },
        documents: { expired, expiring_within_30_days: expiring },
        ...(services ? { services } : {}),
        damages: {
          open: countBy(damages, 'open'),
          monitoring: countBy(damages, 'monitoring'),
          severe_unrepaired: damages.filter((d) => d.severity === 'severe').length,
        },
        ...(reminders !== undefined ? { reminders } : {}),
        ...(skipped.length ? { skipped } : {}),
      },
      sources: dedupeSources([
        { label: 'Dashboard', href: '/fleet' },
        { label: 'Drivers', href: '/fleet/drivers' },
        { label: 'Vehicles', href: '/fleet/vehicles' },
        ...(maintenanceOn ? [{ label: 'Services', href: '/fleet/services' }, { label: 'Damages', href: '/fleet/damages' }] : []),
        ...(remindersOn && typeof reminders === 'object' ? [{ label: 'Reminders', href: '/fleet/reminders' }] : []),
      ]).slice(0, 6),
    };
  },
};
