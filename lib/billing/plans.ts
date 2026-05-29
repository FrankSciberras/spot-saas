// =============================================================================
// BILLING — PLANS, LIMITS & FLEET BILLING STATUS
// =============================================================================
// A fleet starts on a 30-day no-card `trial` with full access. When the trial
// ends it must move onto a paid plan; the required tier is driven by usage —
// BOTH drivers and vehicles are checked and the higher count wins.
//
// Charging is not wired to Stripe yet. Plan activation is a stub (an admin sets
// the plan via the set_organization_plan RPC). Everything here is the
// enforcement + display layer that a real payment flow will plug into.
// =============================================================================

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type Plan = 'trial' | 'starter' | 'growth' | 'scale';
export type PaidPlan = 'starter' | 'growth' | 'scale';

export interface PlanDef {
  id: PaidPlan;
  name: string;
  priceLabel: string;
  /** Max drivers / vehicles. null = unlimited. */
  maxDrivers: number | null;
  maxVehicles: number | null;
  features: string[];
}

export const TRIAL_DAYS = 30;

// Catalogue — mirrors the marketing pricing. Limits gate on drivers AND vehicles.
export const PLANS: PlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceLabel: '$49',
    maxDrivers: 10,
    maxVehicles: 10,
    features: ['Up to 10 drivers & 10 vehicles', 'Rosters & shift tracking', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceLabel: '$149',
    maxDrivers: 50,
    maxVehicles: 50,
    features: [
      'Up to 50 drivers & 50 vehicles',
      'Financials & settlements',
      'Maintenance & damages',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    priceLabel: 'Custom',
    maxDrivers: null,
    maxVehicles: null,
    features: ['Unlimited drivers & vehicles', 'Dedicated subdomain', 'SLA & onboarding'],
  },
];

// Ordered ranking so we can compare "is current plan big enough?".
const PLAN_RANK: Record<Plan, number> = { trial: 0, starter: 1, growth: 2, scale: 3 };

export function planRank(plan: Plan): number {
  return PLAN_RANK[plan] ?? 0;
}

export function getPlanDef(plan: PaidPlan): PlanDef {
  return PLANS.find((p) => p.id === plan)!;
}

/**
 * Smallest paid plan that can hold the given usage. Drivers AND vehicles both
 * matter — the higher requirement wins.
 */
export function requiredPlanFor(drivers: number, vehicles: number): PaidPlan {
  if (drivers > 50 || vehicles > 50) return 'scale';
  if (drivers > 10 || vehicles > 10) return 'growth';
  return 'starter';
}

export interface FleetBilling {
  plan: Plan;
  status: string; // organizations.status: active | suspended | cancelled
  trialEndsAt: string | null;
  /** Whole days remaining in the trial (0 if past / not on trial). */
  trialDaysLeft: number;
  onTrial: boolean;
  trialExpired: boolean;
  drivers: number;
  vehicles: number;
  /** Smallest paid plan that fits current usage. */
  requiredPlan: PaidPlan;
  /** True when the current paid plan is smaller than usage requires. */
  overLimit: boolean;
  /**
   * True when the fleet dashboard should be blocked behind the upgrade screen:
   *   - trial has expired, or
   *   - on a paid plan but outgrew it, or
   *   - org was suspended/cancelled by a platform admin.
   */
  locked: boolean;
}

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

  const [{ data: org }, driversCount, vehiclesCount] = await Promise.all([
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
  const onTrial = plan === 'trial';
  const trialExpired = onTrial && trialEndsAt !== null && now > new Date(trialEndsAt);
  const trialDaysLeft = onTrial && trialEndsAt ? daysBetween(new Date(trialEndsAt), now) : 0;

  const requiredPlan = requiredPlanFor(drivers, vehicles);
  const overLimit = !onTrial && planRank(plan) < planRank(requiredPlan);

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
