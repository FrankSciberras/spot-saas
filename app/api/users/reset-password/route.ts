import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/users/reset-password
 * Admin endpoint to reset a user's password without knowing the current one.
 *
 * Authorization: the caller must be an admin of their ACTIVE fleet (membership
 * role — the post-SaaS source of truth, NOT the deprecated global users.role),
 * and the target user MUST be a member of that same fleet. Without the org
 * check, any fleet admin could reset any user's password platform-wide.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can reset passwords' }, { status: 403 });
    }

    // Parse request
    const { user_id, new_password } = await request.json();

    if (!user_id || !new_password) {
      return NextResponse.json({ error: 'User ID and new password are required' }, { status: 400 });
    }

    if (new_password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Create admin client with service role key
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

    // The target MUST belong to the caller's active fleet — otherwise an admin
    // of one fleet could take over accounts in any other tenant.
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('user_id')
      .eq('organization_id', session.organization_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'User not found in this fleet' }, { status: 404 });
    }

    // Update the user's password using admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error('Error resetting password:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
