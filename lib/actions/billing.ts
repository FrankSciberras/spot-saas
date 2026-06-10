'use server';

// =============================================================================
// BILLING SERVER ACTIONS
// =============================================================================
// Plan activation now goes through Stripe Checkout when configured: choosing a
// paid plan creates a Checkout Session and the caller redirects the browser to
// it. The plan only flips to active when Stripe confirms payment, via
// app/api/stripe/webhook → set_organization_plan equivalent (admin write).
//
// If Stripe ISN'T configured (no STRIPE_SECRET_KEY, or the plan has no
// stripe_price_id yet) we fall back to the original stub: record the tier
// directly via the membership-checked set_organization_plan RPC. This keeps
// local/dev usable before the Stripe account exists.
// =============================================================================

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgId } from '@/lib/auth/org-context';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import { getPlans } from '@/lib/billing/plans-data';
import { planRank, getPlanDef, hasStripeTarget, type PaidPlan } from '@/lib/billing/plans';
import { isStripeEnabled } from '@/lib/billing/stripe';
import { createPlanCheckoutSession, createBillingPortalSession } from '@/lib/billing/checkout';

/**
 * Begin moving the active fleet onto `plan`.
 *  - Stripe configured + plan has a price → returns a Checkout `url` to redirect to.
 *  - Otherwise → records the plan directly (stub) and returns void (caller stays put;
 *    we revalidate + redirect to /fleet).
 */
export async function activatePlanAction(
  plan: PaidPlan
): Promise<{ error: string } | { url: string } | void> {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect('/login');

  // Don't let a fleet pick a plan too small for its current usage.
  const [plans, billing] = await Promise.all([getPlans(), getFleetBilling(orgId)]);
  if (planRank(plans, plan) < planRank(plans, billing.requiredPlan)) {
    return {
      error: `Your fleet has ${billing.drivers} drivers and ${billing.vehicles} vehicles — that needs the ${billing.requiredPlan} plan or higher.`,
    };
  }

  const planDef = getPlanDef(plans, plan);
  if (!planDef) return { error: 'Unknown plan.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Real payment path.
  if (isStripeEnabled() && hasStripeTarget(planDef)) {
    return createPlanCheckoutSession({
      orgId,
      email: user?.email ?? null,
      plan: planDef,
    });
  }

  // Fallback stub: record the chosen tier directly.
  const { error } = await supabase.rpc('set_organization_plan', {
    p_org: orgId,
    p_plan: plan,
  });

  if (error) {
    console.error('activatePlanAction (stub) failed:', error);
    return { error: 'Could not activate that plan. Please try again.' };
  }

  revalidatePath('/', 'layout');
  redirect('/fleet');
}

/**
 * Open the Stripe Billing Portal for the active fleet so an admin can change
 * plan, update their card or cancel. Returns a portal `url` to redirect to.
 */
export async function openBillingPortalAction(): Promise<{ error: string } | { url: string }> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { error: 'Not signed in.' };
  if (!isStripeEnabled()) return { error: 'Billing portal is not available yet.' };
  return createBillingPortalSession(orgId);
}
