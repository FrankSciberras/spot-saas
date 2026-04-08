import type { PermissionResource, RolePermission } from '@/lib/types/database';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type ResourcePermissions = Pick<
  RolePermission,
  'can_view' | 'can_create' | 'can_edit' | 'can_delete'
>;

export type PermissionRole = RolePermission['role'];

export const ALL_PERMISSION_RESOURCES: PermissionResource[] = [
  'dashboard',
  'drivers',
  'vehicles',
  'shifts',
  'rosters',
  'services',
  'damages',
  'notifications',
  'reports',
  'reminders',
  'settings',
];

export const ALL_PERMISSION_ROLES: PermissionRole[] = ['staff', 'driver'];

const NO_ACCESS: ResourcePermissions = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
};

const FULL_ACCESS: ResourcePermissions = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
};

const DEFAULT_PERMISSION_OVERRIDES: Partial<
  Record<PermissionRole, Partial<Record<PermissionResource, ResourcePermissions>>>
> = {
  staff: {
    damages: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
    },
    reminders: {
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
    },
  },
  driver: {
    damages: {
      can_view: true,
      can_create: false,
      can_edit: false,
      can_delete: false,
    },
  },
};

export function getDefaultResourcePermissions(
  role: PermissionRole,
  resource: PermissionResource
): ResourcePermissions {
  const overrides = DEFAULT_PERMISSION_OVERRIDES[role]?.[resource];

  return {
    ...NO_ACCESS,
    ...overrides,
  };
}

export function getFullResourcePermissions(): ResourcePermissions {
  return { ...FULL_ACCESS };
}

export function hasResourcePermission(
  permissions: ResourcePermissions,
  action: PermissionAction
): boolean {
  switch (action) {
    case 'view':
      return permissions.can_view;
    case 'create':
      return permissions.can_create;
    case 'edit':
      return permissions.can_edit;
    case 'delete':
      return permissions.can_delete;
    default:
      return false;
  }
}
