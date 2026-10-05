// =============================================================================
// MEMBERSHIP INVITES — adding someone who already has a Rovora account
// =============================================================================
// A fleet can't pull an existing account into its fleet on its own say-so: the
// invite waits as `pending` until that person accepts at /invites
// (lib/actions/invites.ts). See supabase/migrations/20261005_membership_invites.sql
// for why nothing — not even the drivers row — exists in the fleet before then.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, renderBrandedEmail, appName } from '@/lib/email';
import { appUrl } from '@/lib/urls';
import type { UserRole } from '@/lib/types/database';
import type { PendingInviteItem } from '@/components/fleet/PendingInvites';

// Any service-role client (the invite route builds its own).
type AdminClient = SupabaseClient;

/** Unanswered invites lapse after this long (they stop showing anywhere). */
export const INVITE_TTL_DAYS = 30;
/** After someone declines, the same fleet can't re-invite them for this long. */
export const DECLINE_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface InviteRow {
  id: string;
  organization_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  driver_details: DriverDetails;
  status: InviteStatus;
  created_at: string;
  responded_at: string | null;
}

// ─── Driver details carried on the invite ────────────────────────────────────
// Only plain drivers-table columns the add-driver forms collect. Anything else
// (vehicles, documents) needs the drivers row to exist, so the fleet adds it
// after acceptance.

const DETAIL_FIELDS = [
  'phone',
  'address',
  'employment_type',
  'status',
  'id_card_number',
  'id_card_expiry_date',
  'police_conduct_expiry_date',
  'driving_license_number',
  'driving_license_expiry_date',
  'notes',
] as const;

export type DriverDetails = Partial<Record<(typeof DETAIL_FIELDS)[number], string>>;

/** Keeps known fields with non-empty string values, trimmed and length-capped. */
export function sanitizeDriverDetails(input: unknown): DriverDetails {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: DriverDetails = {};
  for (const key of DETAIL_FIELDS) {
    const v = src[key];
    if (typeof v !== 'string') continue;
    const clean = v.trim().slice(0, key === 'notes' ? 2000 : 200);
    if (clean) out[key] = clean;
  }
  return out;
}

// ─── Creating an invite (fleet side) ─────────────────────────────────────────

interface CreateInviteInput {
  organizationId: string;
  organizationName: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  driverDetails: DriverDetails;
  invitedBy: string;
}

export type CreateInviteResult = { ok: true } | { ok: false; status: number; error: string };

export async function createPendingInvite(admin: AdminClient, input: CreateInviteInput): Promise<CreateInviteResult> {
  const { organizationId, userId } = input;

  // Lapsed invites would otherwise hold the one-pending-per-person slot forever.
  await admin
    .from('membership_invites')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('created_at', daysAgo(INVITE_TTL_DAYS));

  const { data: recent } = await admin
    .from('membership_invites')
    .select('status, created_at, responded_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .in('status', ['pending', 'declined'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.status === 'pending') {
    return { ok: false, status: 409, error: 'They’ve already been invited — waiting for them to accept.' };
  }
  if (recent?.status === 'declined' && recent.responded_at && recent.responded_at > daysAgo(DECLINE_COOLDOWN_DAYS)) {
    const again = new Date(Date.parse(recent.responded_at) + DECLINE_COOLDOWN_DAYS * DAY_MS);
    return {
      ok: false,
      status: 409,
      error: `They declined your invitation recently. You can invite them again from ${again.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`,
    };
  }

  const { data: invite, error } = await admin
    .from('membership_invites')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      driver_details: input.driverDetails,
      invited_by: input.invitedBy,
    })
    .select('id')
    .single();

  if (error || !invite) {
    // Two admins inviting the same person at once trip the unique index.
    if (error?.code === '23505') {
      return { ok: false, status: 409, error: 'They’ve already been invited — waiting for them to accept.' };
    }
    console.error('createPendingInvite insert failed:', error);
    return { ok: false, status: 500, error: 'Failed to send invitation' };
  }

  const sent = await sendInviteEmail(input);
  if (!sent) {
    await admin.from('membership_invites').delete().eq('id', invite.id);
    return { ok: false, status: 500, error: 'Failed to send invitation' };
  }
  return { ok: true };
}

function roleLabel(role: UserRole): string {
  return role === 'driver' ? 'a driver' : role === 'admin' ? 'an admin' : 'a staff member';
}

async function sendInviteEmail(input: CreateInviteInput): Promise<boolean> {
  const org = input.organizationName || 'A fleet';
  const html = renderBrandedEmail({
    heading: `${org} wants to add you`,
    greeting: input.fullName ? `Hi ${input.fullName},` : undefined,
    preheader: `${org} has invited you to join their fleet on ${appName()}. Accept or decline.`,
    body:
      `${org} has invited you to join their fleet on ${appName()} as ${roleLabel(input.role)}. ` +
      `You already have a ${appName()} account, so nothing changes unless you accept.\n\n` +
      `If you accept, ${org} is added to your account and you can switch between your fleets from the menu. ` +
      `Your other fleets can’t see anything you do for ${org}, and ${org} can’t see your work for them.`,
    actionUrl: `${appUrl()}/invites`,
    actionLabel: 'Review invitation',
    footnote: `Don’t know ${org}? Decline, or just ignore this email — they get no access to your account either way.`,
  });
  return sendEmail({ to: input.email, subject: `${org} invited you to join them on ${appName()}`, html });
}

// ─── Reading invites ─────────────────────────────────────────────────────────

export interface InviteForUser extends InviteRow {
  organization_name: string;
}

/** Open invites addressed to this user, newest first. */
export async function pendingInvitesForUser(admin: AdminClient, userId: string): Promise<InviteForUser[]> {
  const { data } = await admin
    .from('membership_invites')
    .select('*, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', daysAgo(INVITE_TTL_DAYS))
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return { ...(row as InviteRow), organization_name: (org?.name as string) || 'A fleet' };
  });
}

/** How many open invites are waiting for this user (cheap — for banners). */
export async function countPendingInvites(admin: AdminClient, userId: string): Promise<number> {
  const { count } = await admin
    .from('membership_invites')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gte('created_at', daysAgo(INVITE_TTL_DAYS));
  return count ?? 0;
}

/**
 * A fleet's outstanding invites for the given roles: still pending, or declined
 * recently (so the admin learns the answer instead of waiting forever).
 */
export async function invitesForOrg(admin: AdminClient, organizationId: string, roles: UserRole[]): Promise<InviteRow[]> {
  const { data } = await admin
    .from('membership_invites')
    .select('*')
    .eq('organization_id', organizationId)
    .in('role', roles)
    .or(
      `and(status.eq.pending,created_at.gte."${daysAgo(INVITE_TTL_DAYS)}"),` +
        `and(status.eq.declined,responded_at.gte."${daysAgo(DECLINE_COOLDOWN_DAYS)}")`
    )
    .order('created_at', { ascending: false });
  return (data ?? []) as InviteRow[];
}

/** invitesForOrg, trimmed to what the fleet's "Invitations" list renders. */
export async function pendingInviteItems(
  admin: AdminClient,
  organizationId: string,
  roles: UserRole[]
): Promise<PendingInviteItem[]> {
  const rows = await invitesForOrg(admin, organizationId, roles);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    status: r.status === 'declined' ? 'declined' : 'pending',
    created_at: r.created_at,
  }));
}
