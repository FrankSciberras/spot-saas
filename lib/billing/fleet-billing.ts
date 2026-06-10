// =============================================================================
// BILLING — FLEET BILLING STATUS (server only)
// =============================================================================
// Resolves a fleet's live trial/plan/usage status from the database. This is
// the SERVER half of the billing layer — it imports the Supabase server client
// (which depends on next/headers), so it must never be pulled into a client
// bundle. The client-safe catalogue, types and pure helpers live in ./plans.
// =============================================================================

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  type Plan,
  type PaidPlan,
  type FleetBilling,
  TRIAL_PLAN,
  planRank,
  requiredPlanFor,
} from './plans';
import { getPlans } from './plans-data';

function daysBetween(future: Date, now: Date): number {
  const ms = future.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/**
 * Resolve the billing/trial status for a fleet. Cached per-request so the layout
 * gate and the trial banner share a single round-trip.
 */
export const getFleetBilling = cache(async (organizationId: string): Promise<FleetBilling> => {
  const supabase = await createClient();

  const [plans, { data: org }, driversCount, vehiclesCount] = await Promise.all([
    getPlans(),
    supabase
      .from('organizations')
      .select('plan, status, trial_ends_at')
      .eq('id', organizationId)
      .single(),
    supabase
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
  ]);

  const plan = (org?.plan as Plan) ?? 'trial';
  const status = (org?.status as string) ?? 'active';
  const trialEndsAt = (org?.trial_ends_at as string | null) ?? null;
  const drivers = driversCount.count ?? 0;
  const vehicles = vehiclesCount.count ?? 0;

  const now = new Date();
  const onTrial = plan === TRIAL_PLAN;
  // A trial ends at trial_ends_at. A trial with NO end date is treated as
  // already expired — a trial must always resolve to "pick a plan", never grant
  // open-ended free access.
  const trialExpired = onTrial && (trialEndsAt === null || now > new Date(trialEndsAt));
  const trialDaysLeft = onTrial && trialEndsAt ? daysBetween(new Date(trialEndsAt), now) : 0;

  const requiredPlan: PaidPlan = requiredPlanFor(plans, drivers, vehicles);
  // Only enforce the over-limit lock when the current plan is a known catalogue
  // plan; an unknown/unpublished key can't be ranked, so don't falsely lock a
  // paying fleet out of its dashboard.
  const planKnown = plans.some((p) => p.id === plan);
  const overLimit = !onTrial && planKnown && planRank(plans, plan) < planRank(plans, requiredPlan);

  const suspended = status === 'suspended' || status === 'cancelled';
  const locked = trialExpired || overLimit || suspended;

  return {
    plan,
    status,
    trialEndsAt,
    trialDaysLeft,
    onTrial,
    trialExpired,
    drivers,
    vehicles,
    requiredPlan,
    overLimit,
    locked,
  };
});
