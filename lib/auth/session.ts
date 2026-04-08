import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { SessionUser, UserRole } from '@/lib/types/database';

/**
 * Gets the current authenticated user with their role and driver info.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return null;
  }

  // Get user profile with role
  const { data: profile } = await supabase
    .from('users')
    .select('id, email, role, full_name, also_staff')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return null;
  }

  // If user is a driver (or has also_staff), get their driver_id
  let driver_id: string | undefined;
  if (profile.role === 'driver') {
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();
    driver_id = driver?.id;
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role as UserRole,
    also_staff: profile.also_staff ?? false,
    full_name: profile.full_name,
    driver_id,
  };
}

/**
 * Requires authentication. Redirects to login if not authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  
  if (!session) {
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
      redirect('/admin');
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
