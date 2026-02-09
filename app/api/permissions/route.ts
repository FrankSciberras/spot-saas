import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// All resources that should have permission rows — add new ones here
const ALL_RESOURCES = [
  'dashboard', 'drivers', 'vehicles', 'shifts', 'rosters',
  'services', 'damages', 'notifications', 'reports', 'settings',
];
const ALL_ROLES = ['staff', 'driver'];

// GET - Fetch all permissions (auto-creates missing resource rows)
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch existing permissions
    const { data: existing, error } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role')
      .order('resource');

    if (error) throw error;

    // Determine which role+resource combos are missing
    const existingKeys = new Set(
      (existing || []).map((p: { role: string; resource: string }) => `${p.role}:${p.resource}`)
    );

    const missing: { role: string; resource: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }[] = [];
    for (const role of ALL_ROLES) {
      for (const resource of ALL_RESOURCES) {
        if (!existingKeys.has(`${role}:${resource}`)) {
          missing.push({
            role,
            resource,
            can_view: false,
            can_create: false,
            can_edit: false,
            can_delete: false,
          });
        }
      }
    }

    // Insert any missing rows
    if (missing.length > 0) {
      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(missing);

      if (insertError) {
        console.error('Error seeding missing permissions:', insertError);
      }

      // Re-fetch so the response includes the new rows
      const { data: refreshed, error: refreshError } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role')
        .order('resource');

      if (refreshError) throw refreshError;
      return NextResponse.json(refreshed);
    }

    return NextResponse.json(existing);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}

// PUT - Update a permission
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { id, can_view, can_create, can_edit, can_delete } = body;

    const { data, error } = await supabase
      .from('role_permissions')
      .update({
        can_view,
        can_create,
        can_edit,
        can_delete,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating permission:', error);
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}

// POST - Bulk update permissions for a role
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Check if user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { permissions } = body; // Array of permission updates

    // Update each permission
    for (const perm of permissions) {
      const { error } = await supabase
        .from('role_permissions')
        .update({
          can_view: perm.can_view,
          can_create: perm.can_create,
          can_edit: perm.can_edit,
          can_delete: perm.can_delete,
          updated_at: new Date().toISOString(),
        })
        .eq('id', perm.id);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating permissions:', error);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
