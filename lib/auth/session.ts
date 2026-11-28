import { cache } from 'react';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { countPendingInvites } from '@/lib/invites';
import { redirect } from 'next/navigation';
import { loadMemberships, pickActiveMembership } from '@/lib/auth/org-context';
import { hasArchivedDriverRecord } from '@/lib/members/archiveDriver';
import type { SessionUser, UserRole } from '@/lib/types/database';

/**
 * Gets the current authenticated user, scoped to their ACTIVE organization.
 *
 * The role + also_staff flag are resolved from the user's membership in the
 * active org (the source of truth post-SaaS migration), NOT from the global
 * users.role column (deprecated). Returns null if not authenticated OR if the
 * user has no memberships yet (in which case they need onboarding — handled by
 * requireAuth redirecting to /onboarding).
 *
 * Wrapped in React's cache(): one lookup per page render. A dashboard page
 * asks for the session at least twice (the /fleet layout, then the page), and
 * each lookup is three round-trips to Supabase made one after another, so the
 * repeats were pure waiting before anything could be sent to the browser.
 * cache() only remembers within a single server render. Server actions and
 * route handlers still read fresh every call, so nothing can go stale after a
 * fleet switch or a role change.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Two independent reads, so they run side by side rather than one after the
  // other: which fleets the user belongs to, and their identity/profile fields
  // (org-independent).
  const [memberships, { data: profile }] = await Promise.all([
    loadMemberships(supabase, user.id),
    supabase
      .from('users')
      .select('id, email, full_name, fleet_tour_completed_at')
      .eq('id', user.id)
      .single(),
  ]);

  // Resolve which fleet the user is currently acting within + their role there.
  const active = await pickActiveMembership(memberships);

  if (!active) {
    // Authenticated but belongs to no organization — needs onboarding.
    return null;
  }

  // If the user is a driver in the active org, resolve their driver_id there.
  let driver_id: string | undefined;
  if (active.role === 'driver') {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', active.organization_id)
      .single();
    driver_id = driver?.id;
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    role: active.role as UserRole,
    also_staff: active.also_staff,
    full_name: profile?.full_name ?? null,
    driver_id,
    organization_id: active.organization_id,
    organization_name: active.organization_name,
    memberships,
    fleet_tour_completed: !!(profile as { fleet_tour_completed_at?: string | null } | null)?.fleet_tour_completed_at,
  };
});

/**
 * Requires authentication. Redirects to login if not authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) {
    // Distinguish "not authenticated" from "authenticated but no fleet yet".
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Logged in but belongs to no organization. A fleet may have invited
      // them (e.g. via the driver app, which never passes /dashboard) — answer
      // that first, otherwise they'd set up a fleet of their own by mistake.
      if ((await countPendingInvites(createAdminClient(), user.id)) > 0) redirect('/invites');
      // A driver their fleet archived: tell them, rather than offering to set
      // up a fleet of their own.
      if (await hasArchivedDriverRecord(user.id)) redirect('/account-archived');
      redirect('/onboarding');
    }
    redirect('/login');
  }

  return session;
}

/**
 * Requires specific role(s). Redirects to appropriate page if unauthorized.
 */
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<SessionUser> {
  const session = await requireAuth();

  // Build the effective roles for this user
  const effectiveRoles: UserRole[] = [session.role];
  if (session.role === 'driver' && session.also_staff) {
    effectiveRoles.push('staff');
  }

  const hasAccess = effectiveRoles.some(r => allowedRoles.includes(r));

  if (!hasAccess) {
    // Redirect based on user's actual role
    if (session.role === 'driver') {
      redirect('/driver');
    } else if (session.role === 'staff' || session.role === 'admin') {
      redirect('/fleet');
    } else {
      redirect('/');
    }
  }
  
  return session;
}

/**
 * Checks if user has admin role.
 */
export function isAdmin(user: SessionUser): boolean {
  return user.role === 'admin';
}

/**
 * Checks if user has admin or staff role.
 */
export function isAdminOrStaff(user: SessionUser): boolean {
  return user.role === 'admin' || user.role === 'staff' || (user.role === 'driver' && user.also_staff);
}

/**
 * Checks if user is a driver.
 */
export function isDriver(user: SessionUser): boolean {
  return user.role === 'driver';
}
