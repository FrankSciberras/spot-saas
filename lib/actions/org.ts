'use server';

// =============================================================================
// ORGANIZATION SERVER ACTIONS (active-org switch + self-serve onboarding)
// =============================================================================
// These run on the server where cookies are writable. Tenant isolation is still
// enforced by RLS — these actions only decide WHICH of the caller's own orgs is
// active, or bootstrap a brand-new fleet for a user who belongs to none.
// =============================================================================

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  loadMemberships,
  setActiveOrgCookie,
} from '@/lib/auth/org-context';
import type { Plan } from '@/lib/billing/plans';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef, hasStripeTarget } from '@/lib/billing/plans';
import { isStripeEnabled } from '@/lib/billing/stripe';
import { createPlanCheckoutSession } from '@/lib/billing/checkout';

/**
 * Switch the active organization. Validates the caller is actually a member of
 * the target org (defence in depth — RLS would block cross-org reads anyway),
 * persists the choice to the active_org cookie, then refreshes.
 */
export async function setActiveOrgAction(organizationId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const memberships = await loadMemberships(supabase, user.id);
  const isMember = memberships.some((m) => m.organization_id === organizationId);
  if (!isMember) {
    // Not a member — ignore silently rather than leak which orgs exist.
    return;
  }

  await setActiveOrgCookie(organizationId);
  revalidatePath('/', 'layout');
}

/**
 * Self-serve onboarding: create a new fleet, make the caller its admin, and
 * optionally activate a paid plan in the same step. Backed by the
 * create_organization_with_owner() SECURITY DEFINER RPC (the new fleet starts on
 * a 30-day trial); when `plan` is a paid tier we immediately move it onto that
 * tier via set_organization_plan() (a stub for Stripe — see lib/actions/billing).
 * Sets the new org active and redirects into the fleet dashboard.
 */
export async function completeOnboardingAction(
  name: string,
  plan: Plan = 'trial'
): Promise<{ error: string } | { url: string } | void> {
  const trimmed = name?.trim();
  if (!trimmed) return { error: 'Fleet name is required' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: orgId, error } = await supabase.rpc('create_organization_with_owner', {
    p_name: trimmed,
    p_slug: null,
  });

  if (error || !orgId) {
    console.error('completeOnboardingAction (create) failed:', error);
    return { error: 'Could not create your fleet. Please try again.' };
  }

  await setActiveOrgCookie(orgId as string);

  // Paid plan chosen during onboarding.
  if (plan !== 'trial') {
    const plans = await getPlans();
    const planDef = getPlanDef(plans, plan);

    // Stripe configured + the plan has a price → send to Checkout. The fleet
    // stays on its trial until payment is confirmed by the webhook, so if the
    // user abandons checkout they still land in the app on the trial.
    if (planDef && isStripeEnabled() && hasStripeTarget(planDef)) {
      const result = await createPlanCheckoutSession({
        orgId: orgId as string,
        orgName: trimmed,
        email: user.email ?? null,
        plan: planDef,
      });
      if ('url' in result) {
        revalidatePath('/', 'layout');
        return { url: result.url };
      }
      // Checkout couldn't start — fall through and let them into the trial.
      console.error('completeOnboardingAction (checkout) failed:', result.error);
    } else {
      // No Stripe yet — keep the old stub so dev still activates the tier.
      const { error: planError } = await supabase.rpc('set_organization_plan', {
        p_org: orgId as string,
        p_plan: plan,
      });
      if (planError) {
        console.error('completeOnboardingAction (plan) failed:', planError);
      }
    }
  }

  revalidatePath('/', 'layout');
  redirect('/fleet');
}
