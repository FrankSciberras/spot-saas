-- Allow drivers to also have staff access without changing their primary role.
-- A driver with also_staff = true can access both /driver and /admin dashboards,
-- and is subject to the same staff permission RLS (role_permissions table).

ALTER TABLE users ADD COLUMN IF NOT EXISTS also_staff boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.also_staff IS 'When true, a driver user can also access the admin/staff dashboard with staff-level permissions.';
