import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
 * Delete a user (admin only)
 */
export async function DELETE(request: Request, context: RouteContext) {
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
      return NextResponse.json({ error: 'Only admins can delete users' }, { status: 403 });
    }

    // Prevent deleting yourself
    if (id === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

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

    // Check if user exists and is a staff member
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('role, also_staff')
      .eq('id', id)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'driver' && targetUser.also_staff) {
      const { error: revokeError } = await supabaseAdmin
        .from('users')
        .update({ also_staff: false })
        .eq('id', id);

      if (revokeError) {
        return NextResponse.json({ error: revokeError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'revoked_staff_access' });
    }

    if (targetUser.role !== 'staff') {
      return NextResponse.json({ error: 'User is not a staff account' }, { status: 400 });
    }

    // Delete from users table first
    const { error: deleteProfileError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);

    if (deleteProfileError) {
      return NextResponse.json({ error: deleteProfileError.message }, { status: 500 });
    }

    // Delete from auth
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteAuthError) {
      console.error('Error deleting auth user:', deleteAuthError);
      // Profile already deleted, log but don't fail
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
