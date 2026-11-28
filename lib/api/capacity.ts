// =============================================================================
// PUBLIC API — PLAN CAPACITY CHECK (server only)
// =============================================================================
// Mirrors checkCapacityToAdd() in lib/billing/fleet-billing.ts, but reads with
// the service-role client: an API-key request has no cookie session, so the
// dashboard helper's RLS-scoped reads would come back empty and silently wave
// every addition through.
//
// Without this, an integration could push a fleet far past the plan it pays
// for, which is precisely what the dashboard refuses to let a human do.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef, requiredPlanFor, TRIAL_PLAN } from '@/lib/billing/plans';

export type ApiCapacityCheck =
  | { ok: true }
  | { ok: false; message: string; current: number; cap: number; requiredPlan: string };

export async function checkApiCapacity(
  organizationId: string,
  kind: 'drivers' | 'vehicles',
): Promise<ApiCapacityCheck> {
  const admin = createAdminClient();

  const [plans, orgRes, driverCount, vehicleCount] = await Promise.all([
    getPlans(),
    admin.from('organizations').select('plan').eq('id', organizationId).maybeSingle(),
    admin.from('drivers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
    admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
  ]);

  const planKey = ((orgRes.data as { plan: string | null } | null)?.plan) ?? TRIAL_PLAN;
  // Trials are gated by their end date, not by counts.
  if (planKey === TRIAL_PLAN) return { ok: true };

  const planDef = getPlanDef(plans, planKey);
  if (!planDef) return { ok: true };

  const cap = kind === 'drivers' ? planDef.maxDrivers : planDef.maxVehicles;
  if (cap === null) return { ok: true };

  const drivers = driverCount.count ?? 0;
  const vehicles = vehicleCount.count ?? 0;
  const current = kind === 'drivers' ? drivers : vehicles;
  if (current + 1 <= cap) return { ok: true };

  const requiredPlan = requiredPlanFor(
    plans,
    kind === 'drivers' ? current + 1 : drivers,
    kind === 'vehicles' ? current + 1 : vehicles,
  );
  const requiredName = getPlanDef(plans, requiredPlan)?.name ?? requiredPlan;
  const noun = kind === 'drivers' ? 'driver' : 'vehicle';

  return {
    ok: false,
    current,
    cap,
    requiredPlan,
    message: `Your ${planDef.name} plan includes up to ${cap} ${noun}${cap === 1 ? '' : 's'} and you already have ${current}. Upgrade to ${requiredName} to add more.`,
  };
}

export interface PlanRoom {
  /** How many more drivers the plan allows (null = no limit). */
  drivers: number | null;
  /** How many more vehicles the plan allows (null = no limit). */
  vehicles: number | null;
  /** The plan's display name, for "your Pro plan includes up to…" messages. */
  planName: string;
}

/**
 * How many drivers and vehicles a fleet may still add under its plan — the
 * bulk version of checkApiCapacity, for adding many records at once (the Bolt
 * fleet import). Same rules: trials and unknown plans are not count-capped.
 * Service-role reads, so it also works from the hourly sync, which has no
 * signed-in user.
 */
export async function planRoom(organizationId: string): Promise<PlanRoom> {
  const admin = createAdminClient();

  const [plans, orgRes, driverCount, vehicleCount] = await Promise.all([
    getPlans(),
    admin.from('organizations').select('plan').eq('id', organizationId).maybeSingle(),
    admin.from('drivers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('archived_at', null),
    admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
  ]);

  const planKey = ((orgRes.data as { plan: string | null } | null)?.plan) ?? TRIAL_PLAN;
  if (planKey === TRIAL_PLAN) return { drivers: null, vehicles: null, planName: 'trial' };

  const planDef = getPlanDef(plans, planKey);
  if (!planDef) return { drivers: null, vehicles: null, planName: planKey };

  const left = (cap: number | null, current: number | null) =>
    cap === null ? null : Math.max(0, cap - (current ?? 0));

  return {
    drivers: left(planDef.maxDrivers, driverCount.count),
    vehicles: left(planDef.maxVehicles, vehicleCount.count),
    planName: planDef.name,
  };
}
