import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loadMemberships, pickActiveMembership } from '@/lib/auth/org-context';
import type { SessionUser, UserRole } from '@/lib/types/database';

/**
 * Gets the current authenticated user, scoped to their ACTIVE organization.
 *
 * The role + also_staff flag are resolved from the user's membership in the
 * active org (the source of truth post-SaaS migration), NOT from the global
 * users.role column (deprecated). Returns null if not authenticated OR if the
 * user has no memberships yet (in which case they need onboarding — handled by
 * requireAuth redirecting to /onboarding).
 */
export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Resolve which fleet the user is currently acting within + their role there.
  const memberships = await loadMemberships(supabase, user.id);
  const active = await pickActiveMembership(memberships);

  if (!active) {
    // Authenticated but belongs to no organization — needs onboarding.
    return null;
  }

  // Identity/profile fields (org-independent).
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', user.id)
    .single();

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
  };
}

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
      // Logged in but belongs to no organization — send to onboarding.
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
