// =============================================================================
// PUBLIC API — PLAN ENTITLEMENTS (server only)
// =============================================================================
// API access is a paid-tier benefit, and WHICH tiers get it is data, not code:
// the platform admin edits api_enabled / the two rate limits / api_max_keys on
// each package at /admin. This module reads that catalogue and answers two
// questions:
//
//   * may this fleet use the API at all, and
//   * what ceilings apply to its keys.
//
// The API is a PAID Fleet-tier benefit, so unlike every other feature it is NOT
// part of the free trial: a trial fleet is told to upgrade, the same as one on
// a tier that doesn't include it. That is deliberate — an API key is the one
// thing worth signing up for a throwaway 30-day trial to get.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { TRIAL_PLAN } from '@/lib/billing/plans';

export interface ApiEntitlement {
  enabled: boolean;
  /** Why it is off, for the error message. null when enabled. */
  reason:
    | null
    | 'plan_not_included'
    | 'trial_expired'
    | 'account_suspended'
    | 'no_organization';
  /** Requests per minute per key. null = unlimited. */
  perMinute: number | null;
  /** Requests per day per key. null = unlimited. */
  perDay: number | null;
  /** How many live keys this fleet may hold. */
  maxKeys: number;
  /** The plan key in force ('trial' for trialling fleets). */
  planKey: string;
  /** Display name of the plan in force. */
  planName: string;
  /** Name of the cheapest package that DOES include the API, for upsell copy. */
  lowestApiPlanName: string | null;
}

interface PlanApiRow {
  key: string;
  name: string;
  api_enabled: boolean;
  api_rate_limit_per_min: number | null;
  api_rate_limit_per_day: number | null;
  api_max_keys: number | null;
  sort_order: number;
}

const OFF = (
  reason: NonNullable<ApiEntitlement['reason']>,
  planKey: string,
  planName: string,
  lowestApiPlanName: string | null,
): ApiEntitlement => ({
  enabled: false,
  reason,
  perMinute: 0,
  perDay: 0,
  maxKeys: 0,
  planKey,
  planName,
  lowestApiPlanName,
});

/**
 * Resolve a fleet's API entitlement from its organization row and the plan
 * catalogue. Uses the service-role client because it runs on requests that have
 * no user session (API-key calls) as well as inside the dashboard.
 */
export async function getApiEntitlement(organizationId: string): Promise<ApiEntitlement> {
  const admin = createAdminClient();

  const [orgRes, plansRes] = await Promise.all([
    admin
      .from('organizations')
      .select('plan, status, trial_ends_at')
      .eq('id', organizationId)
      .maybeSingle(),
    admin
      .from('plans')
      .select('key, name, api_enabled, api_rate_limit_per_min, api_rate_limit_per_day, api_max_keys, sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
  ]);

  const org = orgRes.data as { plan: string | null; status: string | null; trial_ends_at: string | null } | null;
  if (!org) return OFF('no_organization', 'unknown', 'Unknown', null);

  // The cheapest api-enabled package, purely for "upgrade to X" copy.
  const lowestName =
    ((plansRes.data as PlanApiRow[] | null) ?? []).find((p) => p.api_enabled)?.name ?? null;

  const planKey = org.plan ?? TRIAL_PLAN;

  if (org.status === 'suspended' || org.status === 'cancelled') {
    return OFF('account_suspended', planKey, planKey, lowestName);
  }

  // Trial: no API. It is a paid-tier benefit, not part of the free 30 days.
  if (planKey === TRIAL_PLAN) {
    const expired = !org.trial_ends_at || new Date() > new Date(org.trial_ends_at);
    return OFF(expired ? 'trial_expired' : 'plan_not_included', planKey, 'Free trial', lowestName);
  }

  const all = (plansRes.data as PlanApiRow[] | null) ?? [];
  const current = all.find((p) => p.key === planKey);
  if (!current || !current.api_enabled) {
    return OFF('plan_not_included', planKey, current?.name ?? planKey, lowestName);
  }

  return {
    enabled: true,
    reason: null,
    perMinute: current.api_rate_limit_per_min,
    perDay: current.api_rate_limit_per_day,
    maxKeys: current.api_max_keys ?? 0,
    planKey,
    planName: current.name,
    lowestApiPlanName: lowestName,
  };
}

/**
 * The fleet's enabled product modules, read with the service-role client (the
 * dashboard helper in lib/modules/server.ts is cookie-bound and cannot be used
 * on an API-key request).
 */
export async function getApiEnabledModules(organizationId: string): Promise<Set<string>> {
  const { resolveEnabledModules } = await import('@/lib/modules/catalog');
  const admin = createAdminClient();
  const { data } = await admin
    .from('org_modules')
    .select('module_key, is_enabled')
    .eq('organization_id', organizationId);
  return resolveEnabledModules(data ?? []);
}
