// =============================================================================
// NOTIFICATION RECIPIENTS (server only) — org-scoped recipient resolution.
// =============================================================================
// Service-role queries bypass RLS, so any recipient lookup MUST filter by
// organization_id explicitly or it leaks across tenants. This helper resolves a
// single org's admin/staff users via memberships (the post-SaaS source of truth)
// — use it everywhere a notification needs to reach "the fleet's admins".
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface RecipientUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

/** Admin + staff users of one organization (deduped). */
export async function orgAdminStaffUsers(admin: AdminClient, organizationId: string): Promise<RecipientUser[]> {
  const { data: mems } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('role', ['admin', 'staff']);

  const ids = Array.from(new Set(((mems ?? []) as { user_id: string }[]).map((m) => m.user_id)));
  if (ids.length === 0) return [];

  const { data: users } = await admin.from('users').select('id, email, full_name').in('id', ids);
  return ((users ?? []) as RecipientUser[]);
}
