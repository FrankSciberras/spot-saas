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
    admin.from('drivers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
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
