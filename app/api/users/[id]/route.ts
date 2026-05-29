import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { removeMemberFromOrg } from '@/lib/members/removeMember';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]
 * Get a user by ID (admin only)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can view users' }, { status: 403 });
    }

    const { data: targetUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ data: targetUser });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/users/[id]
 * Update a user (admin only)
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update users' }, { status: 403 });
    }

    const body = await request.json();
    const { full_name, password, also_staff } = body;

    // Create admin client for password updates
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: password
      });

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
    }

    // Update profile in users table
    const updateData: Record<string, unknown> = {};
    if (full_name !== undefined) {
      updateData.full_name = full_name;
    }
    if (also_staff !== undefined) {
      updateData.also_staff = !!also_staff;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    // Fetch updated user
    const { data: updatedUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Removes a member from the CALLER'S ACTIVE FLEET (admin only).
 *
 * Two paths:
 *   - Dual-role driver+staff: only revoke the staff side (soft) so they keep
 *     their driver account in the fleet.
 *   - Everyone else: full removal from this org. Their driver row + membership
 *     are deleted, and if they belong to no other fleet their account (profile
 *     + auth identity) is hard-deleted — so getting them back requires a fresh
 *     invite, never a silent re-activation.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 });
    }

    // Prevent removing yourself
    if (id === session.id) {
      return NextResponse.json({ error: 'You cannot remove your own account' }, { status: 400 });
    }

    const orgId = session.organization_id;

    // Create admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Resolve the target's role IN THIS FLEET (the source of truth post-SaaS).
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Member not found in this fleet' }, { status: 404 });
    }

    // Dual-role driver+staff → only revoke staff access (keep them as a driver).
    if (membership.role === 'driver') {
      const { data: targetProfile } = await supabaseAdmin
        .from('users')
        .select('also_staff')
        .eq('id', id)
        .maybeSingle();

      if (targetProfile?.also_staff) {
        const { error: revokeError } = await supabaseAdmin
          .from('users')
          .update({ also_staff: false })
          .eq('id', id);

        if (revokeError) {
          return NextResponse.json({ error: revokeError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, action: 'revoked_staff_access' });
      }
    }

    // Full removal from this fleet (hard-deletes the account if it's their last).
    const result = await removeMemberFromOrg({ targetUserId: id, organizationId: orgId });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    const actor = await getAuditActor(session.id);
    await createAuditLogEntry({
      actor,
      organizationId: orgId,
      action: 'delete',
      entityType: 'membership',
      entityId: id,
      summary: result.fullyDeleted
        ? 'Removed member and deleted their account'
        : 'Removed member from fleet',
      details: { fullyDeleted: result.fullyDeleted, role: membership.role },
    });

    return NextResponse.json({ success: true, fullyDeleted: result.fullyDeleted });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
