import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { sendEmail, renderBrandedEmail, appName } from '@/lib/email';
import type { UserRole } from '@/lib/types/database';

/**
 * POST /api/members/invite
 * Admin-only. Invites a person (by email) into the CALLER'S ACTIVE FLEET.
 *
 * Flow:
 *   1. Authorize: caller must be an admin of the active org (session.role is
 *      already resolved per active org by getSession / Phase 4b).
 *   2. Create the auth identity via Supabase invite (sends a "set your password"
 *      email). If the email already belongs to an existing user (e.g. they work
 *      at another fleet), reuse that user — no second account.
 *   3. Ensure a public.users profile row exists (memberships FK requires it).
 *   4. Insert a membership into session.organization_id with the requested role.
 *      RLS ("Org admins can insert memberships") would also enforce this, but we
 *      use the service-role client here, so we stamp the org explicitly.
 *
 * Returns { userId } so the caller (DriverForm/StaffForm) can create the linked
 * driver/staff record. Tenant isolation is preserved: a membership can only ever
 * be created in the admin's own active org.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only fleet admins can invite members' }, { status: 403 });
    }

    const body = await request.json();
    const email: string = (body.email || '').trim().toLowerCase();
    const fullName: string | null = body.full_name?.trim() || null;
    const role: UserRole = body.role === 'staff' || body.role === 'admin' ? body.role : 'driver';

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const redirectTo = appUrl ? `${appUrl}/auth/callback` : undefined;

    // --- 1. Create or find the auth user --------------------------------------
    // Supabase's own mailer (inviteUserByEmail) fails on this project with
    // "Error sending invite email" — same broken SMTP path as password recovery
    // (see lib/actions/auth-email.ts). generateLink creates the user and returns
    // the invite link WITHOUT sending anything; we deliver it via Resend below.
    let userId: string | null = null;
    let inviteLink: string | null = null;

    const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { full_name: fullName },
        redirectTo: redirectTo ? `${redirectTo}?type=invite` : undefined,
      },
    });

    if (invited?.user) {
      userId = invited.user.id;
      inviteLink = invited.properties?.action_link ?? null;
    } else if (inviteError) {
      // Already registered → reuse the existing user (they may work at another
      // fleet). Look them up by email rather than failing the whole invite.
      const alreadyExists = /already|registered|exists/i.test(inviteError.message);
      if (!alreadyExists) {
        console.error('invite generateLink failed:', inviteError);
        return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
      }
      const { data: existingProfile } = await admin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      userId = existingProfile?.id ?? null;
      if (!userId) {
        // Auth user exists but has no profile row yet (e.g. an earlier invite
        // died halfway). Resolve them via the auth admin API instead.
        const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
        userId = authList?.users?.find((u: { email?: string }) => u.email === email)?.id ?? null;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Could not resolve the invited user' }, { status: 500 });
    }

    // --- 1b. Deliver the invite email through Resend (new users only) ---------
    if (inviteLink) {
      const orgName = session.organization_name || appName();
      const roleLabel = role === 'driver' ? 'a driver' : `a ${role}`;
      const html = renderBrandedEmail({
        heading: `You're invited to ${orgName}`,
        greeting: fullName ? `Hi ${fullName},` : undefined,
        body:
          `${orgName} has invited you to join their fleet on ${appName()} as ${roleLabel}. ` +
          `Click the button below to accept the invitation and set your password.\n\n` +
          `Trouble with the button? Copy and paste this link into your browser:\n${inviteLink}`,
        actionUrl: inviteLink,
        actionLabel: 'Accept invitation',
      });
      const sent = await sendEmail({
        to: email,
        subject: `You're invited to join ${orgName} on ${appName()}`,
        html,
      });
      if (!sent) {
        // Roll back the just-created auth user so a retry starts clean.
        await admin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
      }
    }

    // --- 2. Ensure a profile row exists (memberships FK target) ---------------
    const { error: profileError } = await admin
      .from('users')
      .upsert(
        { id: userId, email, full_name: fullName, role },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    if (profileError) {
      console.error('profile upsert failed:', profileError);
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
    }

    // --- 3. Create the membership in the active fleet -------------------------
    const { error: membershipError } = await admin
      .from('memberships')
      .upsert(
        { organization_id: session.organization_id, user_id: userId, role },
        { onConflict: 'organization_id,user_id', ignoreDuplicates: false }
      );
    if (membershipError) {
      console.error('membership insert failed:', membershipError);
      return NextResponse.json({ error: 'Failed to add member to fleet' }, { status: 500 });
    }

    // --- 4. Audit -------------------------------------------------------------
    const actor = await getAuditActor(session.id);
    await createAuditLogEntry({
      actor,
      organizationId: session.organization_id,
      action: 'create',
      entityType: 'membership',
      entityId: userId,
      summary: `Invited ${email} as ${role}`,
      details: { email, role, full_name: fullName },
    });

    return NextResponse.json({ data: { userId } }, { status: 201 });
  } catch (err) {
    console.error('POST /api/members/invite error:', err);
    return NextResponse.json({ error: 'Failed to invite member' }, { status: 500 });
  }
}
