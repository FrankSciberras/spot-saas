// services_due — vehicles overdue / due soon for service, plus recent services.
// "Which record sets the next service" is the shared rule in
// lib/maintenance/serviceDue.ts (same as the Services page, the alerts engine
// and the shift-start check). km left is measured like the Services page
// (app/fleet/services/page.tsx): next_service_mileage − max(vehicle odometer,
// mileage at that service). No costs here — those belong to the money tools.

import type { AssistantContext, AssistantTool } from '../../types';
import { argInt, capList, dedupeSources } from '../args';
import { PERIOD_SCHEMA, daysBetween, resolvePeriod } from '../../period';
import { latestServiceByVehicle } from '@/lib/maintenance/serviceDue';
import { readAll } from './shifts';

// "Due soon" distance comes from the fleet's own `maintenance.service_due_km`
// setting (ctx.settings.serviceDueKm, default 2000 km) — the same value the
// Services page uses for its amber "due soon" badge.

/**
 * Date-based look-ahead for records that set next_service_date: the default
 * `days_before` of the "Service Due Alert" rule (lib/notifications/engine.ts).
 */
export const SERVICE_DUE_SOON_DAYS = 14;

export interface ServiceDue {
  vehicleId: string;
  plate: string;
  model: string;
  vehicleStatus: string;
  currentKm: number;
  nextKm: number | null;
  kmLeft: number | null;
  nextDate: string | null;
  daysLeft: number | null;
  status: 'overdue' | 'due_soon' | 'ok';
  dueBy: ('km' | 'date')[];
}

interface VehicleRow {
  id: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  mileage: number | null;
  status: string;
}

interface ServiceRow {
  id: string;
  vehicle_id: string;
  service_date: string | null;
  mileage_at_service: number | null;
  next_service_mileage: number | null;
  next_service_date: string | null;
}

/**
 * Next-service status for every vehicle (or one) that has a service target.
 * Columns verified against supabase/saas_install.sql (vehicle_services, vehicles).
 */
export async function loadServiceDue(
  ctx: AssistantContext,
  opts: { vehicleId?: string; withinKm?: number; withinDays?: number } = {},
): Promise<{ due: ServiceDue[]; vehiclesWithoutTarget: number }> {
  const withinKm = opts.withinKm ?? ctx.settings.serviceDueKm;
  const withinDays = opts.withinDays ?? SERVICE_DUE_SOON_DAYS;

  let vehicleQuery = ctx.db
    .from('vehicles')
    .select('id, registration_number, make, model, mileage, status')
    .eq('organization_id', ctx.orgId)
    .limit(1000);
  if (opts.vehicleId) vehicleQuery = vehicleQuery.eq('id', opts.vehicleId);

  const [vehiclesRes, servicesRes] = await Promise.all([
    vehicleQuery,
    // Same filter as the alerts engine: only records that set a target.
    readAll<ServiceRow>((from, to) => {
      let query = ctx.db
        .from('vehicle_services')
        .select('id, vehicle_id, service_date, mileage_at_service, next_service_mileage, next_service_date', { count: 'exact' })
        .eq('organization_id', ctx.orgId)
        .or('next_service_mileage.not.is.null,next_service_date.not.is.null');
      if (opts.vehicleId) query = query.eq('vehicle_id', opts.vehicleId);
      return query.order('id', { ascending: true }).range(from, to);
    }, 'vehicle_services'),
  ]);
  if (vehiclesRes.error) throw new Error(`vehicles: ${vehiclesRes.error.message}`);

  const latest = latestServiceByVehicle(servicesRes.rows);
  const due: ServiceDue[] = [];
  let withoutTarget = 0;
  for (const v of (vehiclesRes.data ?? []) as VehicleRow[]) {
    const last = latest.get(v.id);
    if (!last) {
      withoutTarget += 1;
      continue;
    }
    const currentKm = Math.max(v.mileage ?? 0, last.mileage_at_service ?? 0);
    const kmLeft = last.next_service_mileage != null ? last.next_service_mileage - currentKm : null;
    const daysLeft = last.next_service_date ? daysBetween(ctx.today, last.next_service_date) : null;

    const overdueBy: ServiceDue['dueBy'] = [];
    const soonBy: ServiceDue['dueBy'] = [];
    if (kmLeft != null) {
      if (kmLeft <= 0) overdueBy.push('km');
      else if (kmLeft < withinKm) soonBy.push('km');
    }
    if (daysLeft != null) {
      if (daysLeft < 0) overdueBy.push('date');
      else if (daysLeft <= withinDays) soonBy.push('date');
    }
    const status: ServiceDue['status'] = overdueBy.length ? 'overdue' : soonBy.length ? 'due_soon' : 'ok';
    due.push({
      vehicleId: v.id,
      plate: v.registration_number || 'Vehicle',
      model: [v.make, v.model].filter(Boolean).join(' '),
      vehicleStatus: v.status,
      currentKm,
      nextKm: last.next_service_mileage,
      kmLeft,
      nextDate: last.next_service_date,
      daysLeft,
      status,
      dueBy: overdueBy.length ? overdueBy : soonBy,
    });
  }

  const rank = { overdue: 0, due_soon: 1, ok: 2 } as const;
  due.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.kmLeft ?? Number.MAX_SAFE_INTEGER) - (b.kmLeft ?? Number.MAX_SAFE_INTEGER) ||
      (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
  );
  return { due, vehiclesWithoutTarget: withoutTarget };
}

/** Compact, model-facing view of one vehicle's next service. */
export function serviceDueView(d: ServiceDue): Record<string, unknown> {
  const out: Record<string, unknown> = { status: d.status };
  if (d.dueBy.length) out.due_by = d.dueBy;
  if (d.nextKm != null) {
    out.next_service_km = d.nextKm;
    out.km_left = d.kmLeft;
  }
  if (d.nextDate) {
    out.next_service_date = d.nextDate;
    out.days_left = d.daysLeft;
  }
  out.current_km = d.currentKm;
  return out;
}

const humanize = (s: string | null) => (s ? s.replace(/_/g, ' ') : null);

export const servicesDueTool: AssistantTool = {
  name: 'services_due',
  status: 'Checking services…',
  description:
    `Vehicles OVERDUE or DUE SOON for their next service, from the latest service record per vehicle: by km (due soon = within the fleet's "service due soon" distance of the next-service odometer, the Services page's rule) or by next-service date (due soon = within ${SERVICE_DUE_SOON_DAYS} days). Also lists services logged in a period (default the last 30 days). Use for "which cars need a service", "is anything overdue for service", "what was serviced this month". No costs — use the money tools for spend.`,
  parameters: {
    type: 'object',
    properties: {
      within_km: { type: 'integer', description: `Count as due soon when this many km or fewer are left (default: the fleet's setting).` },
      within_days: { type: 'integer', description: `Count as due soon when the next-service date is this many days away or fewer (default ${SERVICE_DUE_SOON_DAYS}).` },
      period: { ...PERIOD_SCHEMA, description: 'Range for the list of recent services (default the last 30 days).' },
    },
  },
  roles: ['admin', 'staff'],
  module: 'maintenance',
  async run(ctx, args) {
    const withinKm = argInt(args, 'within_km', ctx.settings.serviceDueKm, 0, 50_000);
    const withinDays = argInt(args, 'within_days', SERVICE_DUE_SOON_DAYS, 0, 365);
    const period = resolvePeriod(ctx, args.period, 'last_30_days');

    const [{ due, vehiclesWithoutTarget }, recentRes] = await Promise.all([
      loadServiceDue(ctx, { withinKm, withinDays }),
      ctx.db
        .from('vehicle_services')
        .select('id, vehicle_id, service_date, service_type, mileage_at_service, service_provider, vehicles:vehicle_id (registration_number)')
        .eq('organization_id', ctx.orgId)
        .gte('service_date', period.from)
        .lte('service_date', period.to)
        .order('service_date', { ascending: false })
        .limit(200),
    ]);
    if (recentRes.error) throw new Error(`vehicle_services: ${recentRes.error.message}`);

    const flagged = due.filter((d) => d.status !== 'ok');
    const list = capList(flagged, 40);

    type RecentRow = {
      id: string;
      vehicle_id: string;
      service_date: string;
      service_type: string | null;
      mileage_at_service: number | null;
      service_provider: string | null;
      vehicles: { registration_number: string | null } | { registration_number: string | null }[] | null;
    };
    const recentRows = (recentRes.data ?? []) as RecentRow[];
    const recent = capList(recentRows, 20);
    const plateOf = (r: RecentRow) => (Array.isArray(r.vehicles) ? r.vehicles[0] : r.vehicles)?.registration_number || 'Vehicle';

    return {
      data: {
        today: ctx.today,
        rule: `Overdue = past the next-service km or date. Due soon = within ${withinKm} km or ${withinDays} days.`,
        overdue: flagged.filter((d) => d.status === 'overdue').length,
        due_soon: flagged.filter((d) => d.status === 'due_soon').length,
        vehicles_without_next_service_set: vehiclesWithoutTarget,
        vehicles: list.items.map((d) => ({
          vehicle: d.plate,
          vehicle_id: d.vehicleId,
          model: d.model || undefined,
          vehicle_status: d.vehicleStatus === 'active' ? undefined : d.vehicleStatus,
          ...serviceDueView(d),
        })),
        truncated: list.truncated,
        recent_services: {
          period: period.label,
          count: recentRows.length >= 200 ? '200+' : recentRows.length,
          list: recent.items.map((r) => ({
            date: r.service_date,
            vehicle: plateOf(r),
            type: humanize(r.service_type),
            km: r.mileage_at_service,
            provider: r.service_provider || undefined,
          })),
          truncated: recent.truncated,
        },
      },
      sources: dedupeSources([
        { label: 'Services', href: '/fleet/services' },
        ...list.items.slice(0, 5).map((d) => ({ label: d.plate, href: `/fleet/vehicles/${d.vehicleId}` })),
      ]),
    };
  },
};
