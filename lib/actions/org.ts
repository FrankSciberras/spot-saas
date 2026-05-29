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
): Promise<{ error: string } | void> {
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

  // Paid plan chosen during onboarding — activate it now (Stripe stub). If this
  // fails the fleet simply stays on its trial, so let the user into the app.
  if (plan !== 'trial') {
    const { error: planError } = await supabase.rpc('set_organization_plan', {
      p_org: orgId as string,
      p_plan: plan,
    });
    if (planError) {
      console.error('completeOnboardingAction (plan) failed:', planError);
    }
  }

  revalidatePath('/', 'layout');
  redirect('/fleet');
}
