import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/users/create
 * Create a new user account (admin only)
 * Uses Supabase Admin API to create users without email verification
 */
export async function POST(request: Request) {
  try {
    // Authorize by membership role in the active fleet (not the deprecated
    // global users.role).
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 });
    }

    // Parse request
    const { email, password, full_name, role = 'driver' } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Never let this endpoint mint a global admin — only non-privileged roles.
    if (role !== 'driver' && role !== 'staff') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Create admin client with service role key
    const supabaseAdmin = createAdminClient();

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      }
    });

    if (authError) {
      // Check for duplicate email
      if (authError.message.includes('already')) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create the user profile in the users table
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: email,
        role: role,
        full_name: full_name || null,
      });

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        role,
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
