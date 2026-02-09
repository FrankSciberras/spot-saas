-- =============================================================================
-- Add damages resource to role_permissions
-- =============================================================================

-- Staff can view, create, and edit damages (not delete)
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('staff', 'damages', true, true, true, false)
ON CONFLICT DO NOTHING;

-- Drivers can view damages only
INSERT INTO role_permissions (role, resource, can_view, can_create, can_edit, can_delete)
VALUES ('driver', 'damages', true, false, false, false)
ON CONFLICT DO NOTHING;
