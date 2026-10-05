'use server';

// =============================================================================
// INVITE RESPONSES — accept / decline (the invited person), cancel (the fleet)
// =============================================================================
// Each action re-checks who is asking against the invite row itself before
// writing with the service role, so an id lifted from somewhere can't be used to
// answer someone else's invite or cancel another fleet's.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { setActiveOrgCookie } from '@/lib/auth/org-context';
import { getSession } from '@/lib/auth/session';
import { findOpenShift } from '@/lib/auth/open-shift';
import { checkCapacityToAdd } from '@/lib/billing/fleet-billing';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { INVITE_TTL_DAYS, type InviteRow } from '@/lib/invites';

type Result = { ok: true } | { ok: false; error: string };

/** The signed-in user's open invite with this id, or null. */
async function loadOwnPendingInvite(inviteId: string): Promise<{ invite: InviteRow; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !inviteId) return null;

  const { data } = await createAdminClient()
    .from('membership_invites')
    .select('*')
    .eq('id', inviteId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (!data) return null;

  const invite = data as InviteRow;
  const ageDays = (Date.now() - Date.parse(invite.created_at)) / 86_400_000;
  if (ageDays > INVITE_TTL_DAYS) return null;
  return { invite, userId: user.id };
}

const GONE = 'This invitation is no longer available — it may have been cancelled or already answered.';

/**
 * Join the fleet: membership, then (for drivers) the drivers row built from the
 * details the fleet entered, then make it the active fleet.
 */
export async function acceptInviteAction(inviteId: string): Promise<Result> {
  const found = await loadOwnPendingInvite(inviteId);
  if (!found) return { ok: false, error: GONE };
  const { invite, userId } = found;
  const admin = createAdminClient();

  // Check the plan BEFORE changing anything: over the driver limit the fleet
  // can't take them yet, and a half-joined state would be worse than waiting.
  if (invite.role === 'driver') {
    const { data: existingDriver } = await admin
      .from('drivers')
      .select('id')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existingDriver) {
      const capacity = await checkCapacityToAdd(invite.organization_id, 'drivers');
      if (!capacity.ok) {
        return {
          ok: false,
          error: 'This fleet has reached its plan’s driver limit. Let them know — once they upgrade, accept again here.',
        };
      }
    }
  }

  // Claim the invite first (pending → accepted, atomically) so a double-click
  // or a second tab can't run the setup below twice. Put back on failure.
  const { data: claimed } = await admin
    .from('membership_invites')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed?.length) return { ok: false, error: GONE };
  const unclaim = () =>
    admin.from('membership_invites').update({ status: 'pending', responded_at: null }).eq('id', invite.id);

  // Existing membership wins: never change a role someone already holds.
  const { data: newMembership, error: memberErr } = await admin
    .from('memberships')
    .upsert(
      { organization_id: invite.organization_id, user_id: userId, role: invite.role },
      { onConflict: 'organization_id,user_id', ignoreDuplicates: true }
    )
    .select('id');
  if (memberErr) {
    console.error('acceptInviteAction membership failed:', memberErr);
    await unclaim();
    return { ok: false, error: 'Could not join the fleet. Please try again.' };
  }

  if (invite.role === 'driver') {
    const { data: existingDriver } = await admin
      .from('drivers')
      .select('id')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingDriver) {
      const d = invite.driver_details ?? {};
      const { data: profile } = await admin.from('users').select('full_name').eq('id', userId).maybeSingle();
      const { error: driverErr } = await admin.from('drivers').insert({
        organization_id: invite.organization_id,
        user_id: userId,
        full_name: invite.full_name || profile?.full_name || invite.email,
        status: d.status || 'active',
        employment_type: d.employment_type || null,
        phone: d.phone || null,
        address: d.address || null,
        id_card_number: d.id_card_number || null,
        id_card_expiry_date: d.id_card_expiry_date || null,
        police_conduct_expiry_date: d.police_conduct_expiry_date || null,
        driving_license_number: d.driving_license_number || null,
        driving_license_expiry_date: d.driving_license_expiry_date || null,
        notes: d.notes || null,
      });
      if (driverErr) {
        console.error('acceptInviteAction driver insert failed:', driverErr);
        // Undo what this attempt created so a retry starts clean.
        if (newMembership?.length) {
          await admin.from('memberships').delete().eq('id', newMembership[0].id);
        }
        await unclaim();
        return { ok: false, error: 'Could not set up your driver profile. Please try again.' };
      }
    }
  }

  // Land them in the fleet they just joined — unless they're mid-shift for
  // another fleet (same rule as the switcher); it's in their menu either way.
  const open = await findOpenShift(userId);
  if (!open || open.organizationId === invite.organization_id) {
    await setActiveOrgCookie(invite.organization_id);
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function declineInviteAction(inviteId: string): Promise<Result> {
  const found = await loadOwnPendingInvite(inviteId);
  if (!found) return { ok: false, error: GONE };

  await createAdminClient()
    .from('membership_invites')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', found.invite.id)
    .eq('status', 'pending');

  revalidatePath('/invites');
  return { ok: true };
}

/** A fleet admin withdraws an invite (or clears a declined one from the list). */
export async function cancelInviteAction(inviteId: string): Promise<Result> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { ok: false, error: 'Only fleet admins can manage invitations.' };

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('membership_invites')
    .select('id, email, role, status')
    .eq('id', inviteId)
    .eq('organization_id', session.organization_id)
    .in('status', ['pending', 'declined'])
    .maybeSingle();
  if (!invite) return { ok: false, error: GONE };

  await admin
    .from('membership_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', invite.id);

  const actor = await getAuditActor(session.id);
  await createAuditLogEntry({
    actor,
    organizationId: session.organization_id,
    action: 'delete',
    entityType: 'membership',
    entityId: invite.id,
    summary: `Cancelled invitation for ${invite.email}`,
    details: { email: invite.email, role: invite.role, previous_status: invite.status },
  });

  revalidatePath('/fleet/drivers');
  revalidatePath('/fleet/staff');
  return { ok: true };
}
