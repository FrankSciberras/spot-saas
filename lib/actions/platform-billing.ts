'use server';

// =============================================================================
// PLATFORM-ADMIN BILLING ACTIONS (Tier 1 — the SaaS operator)
// =============================================================================
// These let the platform admin (Frank) manually set any fleet's plan, reset or
// extend a trial, and suspend / reactivate a fleet. Unlike the fleet-facing
// activatePlanAction (which goes through the membership-checked
// set_organization_plan RPC), these run on the service-role admin client so the
// platform admin can manage fleets they are NOT a member of.
//
// This is the manual stand-in for a real Stripe back office. When billing is
// wired up, these stay useful as the admin override path.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { TRIAL_DAYS, type Plan } from '@/lib/billing/plans';

const PLAN_VALUES: Plan[] = ['trial', 'starter', 'growth', 'scale'];

/**
 * Set a fleet's plan directly. A paid plan marks it activated + active; choosing
 * `trial` restarts a fresh 30-day trial from now.
 */
export async function setFleetPlanAction(
  organizationId: string,
  plan: Plan
): Promise<{ error?: string; ok?: boolean }> {
  await requirePlatformAdmin();

  if (!PLAN_VALUES.includes(plan)) {
    return { error: 'Unknown plan.' };
  }

  const admin = createAdminClient();
  const now = new Date();

  const patch: Record<string, unknown> = { plan, status: 'active' };

  if (plan === 'trial') {
    patch.trial_started_at = now.toISOString();
    patch.trial_ends_at = new Date(
      now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    patch.plan_activated_at = null;
  } else {
    patch.plan_activated_at = now.toISOString();
  }

  const { error } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', organizationId);

  if (error) {
    console.error('setFleetPlanAction failed:', error);
    return { error: 'Could not update the plan.' };
  }

  revalidatePath('/admin/fleets');
  return { ok: true };
}

/**
 * Extend (or shorten) a fleet's trial by a number of days, relative to its
 * current trial end (or now, if none). Only meaningful while on the trial plan.
 */
export async function extendTrialAction(
  organizationId: string,
  days: number
): Promise<{ error?: string; ok?: boolean }> {
  await requirePlatformAdmin();

  if (!Number.isFinite(days) || days === 0) {
    return { error: 'Enter a non-zero number of days.' };
  }

  const admin = createAdminClient();

  const { data: org, error: readErr } = await admin
    .from('organizations')
    .select('trial_ends_at')
    .eq('id', organizationId)
    .single();

  if (readErr || !org) {
    return { error: 'Fleet not found.' };
  }

  const base = org.trial_ends_at ? new Date(org.trial_ends_at as string) : new Date();
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from('organizations')
    .update({ trial_ends_at: next.toISOString(), plan: 'trial', status: 'active' })
    .eq('id', organizationId);

  if (error) {
    console.error('extendTrialAction failed:', error);
    return { error: 'Could not extend the trial.' };
  }

  revalidatePath('/admin/fleets');
  return { ok: true };
}

/**
 * Suspend or reactivate a fleet. Suspending locks its dashboard behind the
 * upgrade screen; reactivating restores access on the current plan.
 */
export async function setFleetStatusAction(
  organizationId: string,
  status: 'active' | 'suspended'
): Promise<{ error?: string; ok?: boolean }> {
  await requirePlatformAdmin();

  if (status !== 'active' && status !== 'suspended') {
    return { error: 'Invalid status.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ status })
    .eq('id', organizationId);

  if (error) {
    console.error('setFleetStatusAction failed:', error);
    return { error: 'Could not update the fleet status.' };
  }

  revalidatePath('/admin/fleets');
  return { ok: true };
}
