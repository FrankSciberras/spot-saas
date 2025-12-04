-- =============================================================================
-- ROLE PERMISSIONS SYSTEM
-- Run this in Supabase SQL Editor to add role-based permissions
-- =============================================================================

-- Role permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL, -- 'staff', 'driver'
  resource TEXT NOT NULL, -- 'drivers', 'vehicles', 'shifts', 'rosters', 'services', 'notifications', 'reports'
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, resource)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage permissions
DROP POLICY IF EXISTS "Admins can manage permissions" ON role_permissions;
CREATE POLICY "Admins can manage permissions"
  ON role_permissions FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Anyone authenticated can view permissions (needed to check their own)
DROP POLICY IF EXISTS "Users can view permissions" ON role_permissions;
CREATE POLICY "Users can view permissions"
  ON role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Insert default permissions for staff
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete) VALUES
  -- Staff permissions (more access than drivers)
  ('staff', 'dashboard', true, false, false, false),
  ('staff', 'drivers', true, true, true, false),
  ('staff', 'vehicles', true, true, true, false),
  ('staff', 'shifts', true, true, true, false),
  ('staff', 'rosters', true, true, true, false),
  ('staff', 'services', true, true, true, false),
  ('staff', 'notifications', true, true, false, false),
  ('staff', 'reports', true, false, false, false),
  ('staff', 'settings', false, false, false, false),
  
  -- Driver permissions (limited access)
  ('driver', 'dashboard', true, false, false, false),
  ('driver', 'drivers', false, false, false, false),
  ('driver', 'vehicles', false, false, false, false),
  ('driver', 'shifts', true, false, false, false),
  ('driver', 'rosters', true, false, false, false),
  ('driver', 'services', false, false, false, false),
  ('driver', 'notifications', true, false, false, false),
  ('driver', 'reports', false, false, false, false),
  ('driver', 'settings', false, false, false, false)
ON CONFLICT (role, resource) DO NOTHING;

SELECT 'Role permissions table created successfully!' as message;
