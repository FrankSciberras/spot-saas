import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import {
  ALL_PERMISSION_RESOURCES,
  ALL_PERMISSION_ROLES,
  getDefaultResourcePermissions,
} from '@/lib/permissions-config';

/**
 * Role permissions are PER-FLEET (scoped to organization_id). Every handler
 * here operates only on the caller's active fleet, and the caller must be an
 * admin OF THAT FLEET (resolved from memberships via getSession, not the
 * deprecated global users.role column). Writes go through the service-role
 * client with an explicit organization_id stamp + filter so one fleet can never
 * read or mutate another fleet's matrix.
 */

// GET - Fetch this fleet's permissions (auto-creates missing resource rows)
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const orgId = session.organization_id;
    const supabase = createAdminClient();

    // Fetch existing permissions for this fleet.
    const { data: existing, error } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('organization_id', orgId)
      .order('role')
      .order('resource');

    if (error) throw error;

    // Determine which role+resource combos are missing for this fleet.
    const existingKeys = new Set(
      (existing || []).map((p: { role: string; resource: string }) => `${p.role}:${p.resource}`)
    );

    const missing: {
      organization_id: string;
      role: string;
      resource: string;
      can_view: boolean;
      can_create: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }[] = [];
    for (const role of ALL_PERMISSION_ROLES) {
      for (const resource of ALL_PERMISSION_RESOURCES) {
        if (!existingKeys.has(`${role}:${resource}`)) {
          const defaults = getDefaultResourcePermissions(role, resource);
          missing.push({
            organization_id: orgId,
            role,
            resource,
            can_view: defaults.can_view,
            can_create: defaults.can_create,
            can_edit: defaults.can_edit,
            can_delete: defaults.can_delete,
          });
        }
      }
    }

    // Insert any missing rows for this fleet.
    if (missing.length > 0) {
      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(missing);

      if (insertError) {
        console.error('Error seeding missing permissions:', insertError);
      }

      const { data: refreshed, error: refreshError } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('organization_id', orgId)
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

// PUT - Update a single permission (scoped to this fleet)
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const orgId = session.organization_id;
    const supabase = createAdminClient();

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
      .eq('organization_id', orgId) // never touch another fleet's row
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating permission:', error);
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}

// POST - Bulk update permissions for a role (scoped to this fleet)
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const orgId = session.organization_id;
    const supabase = createAdminClient();

    const body = await request.json();
    const { permissions } = body; // Array of permission updates

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
        .eq('id', perm.id)
        .eq('organization_id', orgId); // never touch another fleet's row

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating permissions:', error);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
