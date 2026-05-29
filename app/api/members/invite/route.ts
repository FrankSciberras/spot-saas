import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
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
    let userId: string | null = null;

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });

    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteError) {
      // Already registered → reuse the existing user (they may work at another
      // fleet). Look them up by email rather than failing the whole invite.
      const alreadyExists = /already|registered|exists/i.test(inviteError.message);
      if (!alreadyExists) {
        console.error('inviteUserByEmail failed:', inviteError);
        return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
      }
      const { data: existingProfile } = await admin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      userId = existingProfile?.id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Could not resolve the invited user' }, { status: 500 });
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
