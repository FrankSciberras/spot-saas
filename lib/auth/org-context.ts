// =============================================================================
// ORGANIZATION CONTEXT (multi-tenant active-org resolution)
// =============================================================================
// A user can belong to several fleets (organizations) with a different role in
// each. At runtime exactly ONE organization is "active" — the fleet the user is
// currently looking at. The active org is chosen by:
//   1. the `active_org` cookie, IF the user is actually a member of that org;
//   2. otherwise the user's first membership (auto-select — the common case,
//      since most users belong to a single fleet).
//
// Tenant ISOLATION is enforced by Postgres RLS (Phase 3): a user can never read
// another fleet's rows regardless of cookie value. This module only decides
// WHICH of the user's own orgs is in focus, and resolves the role for it.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { MembershipInfo } from '@/lib/types/database';

export const ACTIVE_ORG_COOKIE = 'active_org';
// 1 year — the active org is a UX preference, not a security token.
const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Loads every organization the given user is a member of (RLS-scoped, so it can
 * only ever return the caller's own memberships). Reuses an existing Supabase
 * client + userId to avoid extra auth round-trips.
 */
export async function loadMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<MembershipInfo[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role, also_staff, organizations(name, slug)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((m) => {
    // `organizations` comes back as an object (to-one) but supabase-js types it
    // as a possible array depending on the relationship inference; normalize.
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
    return {
      organization_id: m.organization_id as string,
      organization_name: (org?.name as string) ?? '',
      organization_slug: (org?.slug as string) ?? '',
      role: m.role,
      also_staff: m.also_staff ?? false,
    };
  });
}

/**
 * Picks the active membership from a user's membership list using the
 * `active_org` cookie, falling back to the first membership. Returns null only
 * when the user has no memberships at all (needs onboarding).
 */
export async function pickActiveMembership(
  memberships: MembershipInfo[]
): Promise<MembershipInfo | null> {
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0];

  const cookieStore = await cookies();
  const desired = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (desired) {
    const match = memberships.find((m) => m.organization_id === desired);
    if (match) return match;
  }
  return memberships[0];
}

/**
 * Convenience: resolve the active organization id for the current request.
 * Returns null if unauthenticated or the user has no memberships.
 * Use this in API route handlers when stamping organization_id on writes.
 */
export async function getActiveOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const memberships = await loadMemberships(supabase, user.id);
  const active = await pickActiveMembership(memberships);
  return active?.organization_id ?? null;
}

/**
 * Persists the chosen active organization to the `active_org` cookie.
 * MUST be called from a Server Action or Route Handler (where cookies are
 * writable). The caller is responsible for verifying membership first.
 */
export async function setActiveOrgCookie(organizationId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });
}
