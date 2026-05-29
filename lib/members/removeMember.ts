import { createAdminClient } from '@/lib/supabase/server';

export interface RemoveMemberResult {
  success: boolean;
  /** HTTP status to surface when success is false. */
  status?: number;
  error?: string;
  /**
   * True when the user had no other memberships and was fully deleted
   * (profile + auth identity). False when they were only detached from this
   * fleet but still belong to another org.
   */
  fullyDeleted?: boolean;
}

/**
 * Completely removes a member from a single fleet.
 *
 * "Removed" means the person is gone from THIS organization and, if they
 * belonged to no other fleet, their account is hard-deleted (profile + auth)
 * so that getting them back requires a fresh invite — never a silent
 * re-activation of a lingering account.
 *
 * Steps (all via the service-role admin client, scoped to organizationId):
 *   1. Verify the target actually belongs to this org.
 *   2. Refuse to remove the org's last admin (would orphan the fleet).
 *   3. Delete the org-scoped driver row (cascades shifts/earnings/etc.).
 *   4. Delete the membership row.
 *   5. If the user now has zero memberships anywhere, delete the users row
 *      and the auth identity.
 *
 * Self-removal must be guarded by the caller (compare to the acting user).
 */
export async function removeMemberFromOrg(params: {
  targetUserId: string;
  organizationId: string;
}): Promise<RemoveMemberResult> {
  const { targetUserId, organizationId } = params;
  const admin = createAdminClient();

  // --- 1. Verify membership in this org ------------------------------------
  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (membershipError) {
    return { success: false, status: 500, error: membershipError.message };
  }
  if (!membership) {
    return { success: false, status: 404, error: 'Member not found in this fleet' };
  }

  // --- 2. Protect the last admin -------------------------------------------
  if (membership.role === 'admin') {
    const { count } = await admin
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('role', 'admin');

    if ((count ?? 0) <= 1) {
      return {
        success: false,
        status: 400,
        error: 'You cannot remove the last admin of the fleet',
      };
    }
  }

  // --- 3. Delete the org-scoped driver row (cascades) ----------------------
  const { error: driverError } = await admin
    .from('drivers')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId);

  if (driverError) {
    return { success: false, status: 500, error: driverError.message };
  }

  // --- 4. Delete the membership --------------------------------------------
  const { error: removeMembershipError } = await admin
    .from('memberships')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', targetUserId);

  if (removeMembershipError) {
    return { success: false, status: 500, error: removeMembershipError.message };
  }

  // --- 5. Hard-delete the account if no memberships remain -----------------
  const { count: remaining, error: countError } = await admin
    .from('memberships')
    .select('organization_id', { count: 'exact', head: true })
    .eq('user_id', targetUserId);

  if (countError) {
    // Membership is already gone; surface the issue but don't leave a dangling
    // account silently — treat as a soft removal.
    console.error('Failed to count remaining memberships:', countError);
    return { success: true, fullyDeleted: false };
  }

  if ((remaining ?? 0) > 0) {
    // Still belongs to another fleet — leave the global account intact.
    return { success: true, fullyDeleted: false };
  }

  // No other fleet: delete the profile, then the auth identity.
  const { error: deleteProfileError } = await admin
    .from('users')
    .delete()
    .eq('id', targetUserId);

  if (deleteProfileError) {
    return { success: false, status: 500, error: deleteProfileError.message };
  }

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteAuthError) {
    // Profile is already gone; log but don't fail the request.
    console.error('Error deleting auth user:', deleteAuthError);
  }

  return { success: true, fullyDeleted: true };
}
