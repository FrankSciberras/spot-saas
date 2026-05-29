'use server';

// =============================================================================
// BILLING SERVER ACTIONS (stubbed plan activation)
// =============================================================================
// No Stripe yet: "activating" a plan just records the chosen tier via the
// set_organization_plan RPC (which verifies the caller is a fleet admin). This
// is the seam a real Stripe Checkout + webhook will replace — the webhook would
// call the same RPC on `checkout.session.completed`.
// =============================================================================

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrgId } from '@/lib/auth/org-context';
import { getFleetBilling, planRank, type PaidPlan } from '@/lib/billing/plans';

export async function activatePlanAction(
  plan: PaidPlan
): Promise<{ error: string } | void> {
  const orgId = await getActiveOrgId();
  if (!orgId) redirect('/login');

  // Don't let a fleet pick a plan too small for its current usage.
  const billing = await getFleetBilling(orgId);
  if (planRank(plan) < planRank(billing.requiredPlan)) {
    return {
      error: `Your fleet has ${billing.drivers} drivers and ${billing.vehicles} vehicles — that needs the ${billing.requiredPlan} plan or higher.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_organization_plan', {
    p_org: orgId,
    p_plan: plan,
  });

  if (error) {
    console.error('activatePlanAction failed:', error);
    return { error: 'Could not activate that plan. Please try again.' };
  }

  revalidatePath('/', 'layout');
  redirect('/fleet');
}
