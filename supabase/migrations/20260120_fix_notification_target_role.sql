-- =============================================================================
-- Fix Notification Target Role Issue
-- =============================================================================
-- Bug: Notifications with driver_id IS NULL were visible to ALL users (including drivers)
-- even when they were meant only for admins/staff (like service_due alerts).
--
-- Solution: Add target_role column to notifications table to properly filter
-- who should see broadcast notifications (driver_id IS NULL).

-- Add target_role column to notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'all';
-- Values: 'driver' (only drivers), 'admin' (only admins/staff), 'all' (everyone)

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role);

-- Update existing admin-targeted notifications (those with action_url pointing to admin pages)
-- These were incorrectly visible to drivers before
UPDATE notifications 
SET target_role = 'admin' 
WHERE driver_id IS NULL 
  AND (
    action_url LIKE '/admin/%' 
    OR title LIKE '%Service Due%'
    OR title LIKE '%Vehicle Service%'
  );

-- Drop existing driver SELECT policy
DROP POLICY IF EXISTS "Drivers can view own notifications" ON notifications;

-- Create new policy that respects target_role for broadcasts
-- Drivers can see:
-- 1. Notifications specifically for them (driver_id = their driver_id)
-- 2. Broadcast notifications where target_role is 'driver' or 'all' (NOT 'admin')
CREATE POLICY "Drivers can view own notifications"
  ON notifications FOR SELECT
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- Update the driver UPDATE policy as well to match
DROP POLICY IF EXISTS "Drivers can update own notifications" ON notifications;

CREATE POLICY "Drivers can update own notifications"
  ON notifications FOR UPDATE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  )
  WITH CHECK (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- =============================================================================
-- Add DELETE policy for drivers (they can delete their own notifications)
-- =============================================================================

DROP POLICY IF EXISTS "Drivers can delete own notifications" ON notifications;

CREATE POLICY "Drivers can delete own notifications"
  ON notifications FOR DELETE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR (
      driver_id IS NULL 
      AND target_role IN ('driver', 'all')
    )
  );

-- =============================================================================
-- Update driver-specific notifications to have target_role = 'driver'
-- =============================================================================

UPDATE notifications 
SET target_role = 'driver' 
WHERE driver_id IS NOT NULL 
  AND target_role IS NULL;

-- =============================================================================
-- Fix create_service_notification function to include target_role
-- =============================================================================

CREATE OR REPLACE FUNCTION create_service_notification(
  p_vehicle_id UUID,
  p_vehicle_reg TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'warning',
  p_action_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the notification for admins only (driver_id = NULL + target_role = 'admin')
  INSERT INTO notifications (driver_id, title, body, type, action_url, target_role)
  VALUES (NULL, p_title, p_body, p_type, p_action_url, 'admin')
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

SELECT 'Notification target_role fix applied successfully!' as message;
