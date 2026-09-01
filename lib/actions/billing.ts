'use server';

// =============================================================================
// BILLING SERVER ACTIONS
// =============================================================================
// Plan activation goes through Stripe Checkout when configured: choosing a paid
// plan creates a Checkout Session and the caller redirects the browser to it.
// The plan only flips to active when Stripe confirms payment, via
// app/api/stripe/webhook → set_organization_plan equivalent (admin write).
//
// Only when Stripe is NOT configured at all (no STRIPE_SECRET_KEY — local/dev)
// do we fall back to the original stub that records the tier directly. With
// Stripe live, a plan that has no price/product connected is simply not
// purchasable yet — it must never activate for free.
//
// Both actions are ADMIN-ONLY. A driver or staff member of the fleet must not be
// able to start a checkout, open the Stripe portal, or cancel the subscription.
// =============================================================================

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import { getPlans } from '@/lib/billing/plans-data';
import { planRank, getPlanDef, hasStripeTarget, type PaidPlan } from '@/lib/billing/plans';
import { isStripeEnabled } from '@/lib/billing/stripe';
import { createPlanCheckoutSession, createBillingPortalSession } from '@/lib/billing/checkout';

const ADMIN_ONLY = 'Only a fleet admin can change the plan or manage billing.';

/**
 * Begin moving the active fleet onto `plan`.
 *  - Stripe configured + plan has a price → returns a Checkout `url` to redirect to.
 *  - Stripe configured, plan NOT connected → error (never a free activation).
 *  - Stripe not configured (dev) → records the plan directly and redirects to /fleet.
 */
export async function activatePlanAction(
  plan: PaidPlan
): Promise<{ error: string } | { url: string } | void> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') return { error: ADMIN_ONLY };
  const orgId = session.organization_id;

  // Don't let a fleet pick a plan too small for its current usage.
  const [plans, billing] = await Promise.all([getPlans(), getFleetBilling(orgId)]);
  if (planRank(plans, plan) < planRank(plans, billing.requiredPlan)) {
    return {
      error: `Your fleet has ${billing.drivers} drivers and ${billing.vehicles} vehicles — that needs the ${billing.requiredPlan} plan or higher.`,
    };
  }

  const planDef = getPlanDef(plans, plan);
  if (!planDef) return { error: 'Unknown plan.' };

  // Real payment path.
  if (isStripeEnabled()) {
    if (!hasStripeTarget(planDef)) {
      return {
        error: `${planDef.name} isn't available for self-serve checkout yet. Please contact support to switch to it.`,
      };
    }
    return createPlanCheckoutSession({
      orgId,
      email: session.email ?? null,
      plan: planDef,
    });
  }

  // Dev-only stub (Stripe not configured): record the chosen tier directly.
  const supabase = await createClient();
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
 * Open the Stripe Billing Portal for the active fleet so an ADMIN can change
 * plan, update their card or cancel. Returns a portal `url` to redirect to.
 */
export async function openBillingPortalAction(): Promise<{ error: string } | { url: string }> {
  const session = await getSession();
  if (!session) return { error: 'Not signed in.' };
  if (session.role !== 'admin') return { error: ADMIN_ONLY };
  if (!isStripeEnabled()) return { error: 'Billing portal is not available yet.' };
  return createBillingPortalSession(session.organization_id);
}
