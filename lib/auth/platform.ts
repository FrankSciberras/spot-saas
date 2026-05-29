// =============================================================================
// PLATFORM ADMIN AUTH (Tier 1 — the SaaS operator)
// =============================================================================
// Platform admins sit above per-fleet memberships. Membership in the
// `platform_admins` allow-list table — NOT a membership role — grants access to
// the cross-fleet platform dashboard at /admin.
//
// The check runs through the service-role admin client so it works even for a
// platform admin who has no fleet membership at all (and so a session — which is
// membership-scoped — would be null for them).
// =============================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export interface PlatformAdmin {
  id: string;
  email: string;
}

/**
 * Returns the current authenticated user IF they are a platform admin, else null.
 * Does not redirect — callers decide what to do.
 */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Service-role read: RLS would also allow the user to see their own row, but
  // using the admin client keeps this independent of session/RLS edge cases.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  return { id: user.id, email: user.email ?? '' };
}

/** Convenience boolean check. */
export async function isPlatformAdmin(): Promise<boolean> {
  return (await getPlatformAdmin()) !== null;
}

/**
 * Requires the caller to be a platform admin. Redirects non-admins:
 *   - unauthenticated  -> /login
 *   - authenticated    -> / (their own dashboard router)
 */
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const platformAdmin = await getPlatformAdmin();
  if (!platformAdmin) redirect('/');

  return platformAdmin;
}
