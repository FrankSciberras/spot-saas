import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import type { PermissionResource, SessionUser, UserRole } from '@/lib/types/database';
import {
  getDefaultResourcePermissions,
  getFullResourcePermissions,
  type PermissionRole,
  type ResourcePermissions,
} from '@/lib/permissions-config';

export function getEffectivePermissionRole(
  user: { role: UserRole; also_staff?: boolean }
): PermissionRole | null {
  if (user.role === 'admin') {
    return null;
  }

  if (user.role === 'staff' || (user.role === 'driver' && user.also_staff)) {
    return 'staff';
  }

  return 'driver';
}

export async function getResourcePermissionsForUser(
  user: Pick<SessionUser, 'id' | 'role' | 'also_staff'>,
  resource: PermissionResource
): Promise<ResourcePermissions> {
  if (user.role === 'admin') {
    return getFullResourcePermissions();
  }

  const permissionRole = getEffectivePermissionRole(user);
  if (!permissionRole) {
    return getFullResourcePermissions();
  }

  const fallback = getDefaultResourcePermissions(permissionRole, resource);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('role_permissions')
    .select('can_view, can_create, can_edit, can_delete')
    .eq('role', permissionRole)
    .eq('resource', resource)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load permissions for ${permissionRole}:${resource}`, error);
    return fallback;
  }

  if (!data) {
    return fallback;
  }

  return {
    can_view: !!data.can_view,
    can_create: !!data.can_create,
    can_edit: !!data.can_edit,
    can_delete: !!data.can_delete,
  };
}
