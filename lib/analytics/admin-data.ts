// =============================================================================
// Shared readers for the Admin Console → Analytics API routes (server only).
// =============================================================================
// The sign-up funnel (/api/admin/analytics/signups) and the business numbers
// (/api/admin/analytics/business) both need "who signed up for themselves in
// this period" — the same definition in both places, so the numbers agree.
// =============================================================================

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PAGE = 1000;
const MAX_PAGES = 30;

/** Read every row of a query, 1000 at a time (PostgREST caps a single response). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string | null;
  invited_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown>;
}

export interface Membership {
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
}

/** Every auth account (Auth is the only place an unverified or fleet-less account exists). */
export async function listAuthUsers(admin: SupabaseClient): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    users.push(...(data.users as unknown as AuthUser[]));
    if (data.users.length < PAGE) break;
  }
  return users;
}

/**
 * Self-serve sign-ups among `users`: people who created an account for their
 * own fleet. Leaves out anyone a fleet (or we) invited, drivers and staff added
 * to an existing fleet, and the platform's own admins.
 */
export async function selfServeSignups(
  admin: SupabaseClient,
  users: AuthUser[],
): Promise<{ signups: AuthUser[]; byUser: Map<string, Membership[]> }> {
  const ids = users.map((u) => u.id);
  const memberships: Membership[] = [];
  const invited = new Set<string>();
  for (const part of chunk(ids, 150)) {
    memberships.push(
      ...(await fetchAll<Membership>((a, b) =>
        admin.from('memberships').select('user_id, organization_id, role, created_at').in('user_id', part).range(a, b),
      )),
    );
    // Invited to someone else's fleet and not answered yet — not a sign-up of their own.
    const { data: inv } = await admin.from('membership_invites').select('user_id').in('user_id', part).eq('status', 'pending');
    for (const r of (inv ?? []) as { user_id: string }[]) invited.add(r.user_id);
    // Nor are the people who run the platform.
    const { data: staff } = await admin.from('platform_admins').select('user_id').in('user_id', part);
    for (const r of (staff ?? []) as { user_id: string }[]) invited.add(r.user_id);
  }
  const byUser = new Map<string, Membership[]>();
  for (const m of memberships) byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);

  const signups = users.filter((u) => {
    if (u.invited_at || invited.has(u.id)) return false;
    const ms = byUser.get(u.id) ?? [];
    return ms.length === 0 || ms.some((m) => m.role === 'admin');
  });
  return { signups, byUser };
}

/** Accounts created in [from, to). */
export const createdIn = (users: AuthUser[], from: Date, to: Date) =>
  users.filter((u) => {
    const t = Date.parse(u.created_at);
    return t >= from.getTime() && t < to.getTime();
  });
