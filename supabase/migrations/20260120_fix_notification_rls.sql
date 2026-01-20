-- =============================================================================
-- Fix Notification RLS Policy for Broadcast Notifications
-- =============================================================================
-- Issue: Drivers cannot mark broadcast notifications (driver_id IS NULL) as read
-- because the original policy only matched driver_id = get_driver_id(auth.uid())
-- which is always FALSE when driver_id IS NULL.

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Drivers can update own notifications" ON notifications;

-- Create new policy that allows drivers to update:
-- 1. Notifications specifically for them (driver_id = their driver_id)
-- 2. Broadcast notifications (driver_id IS NULL)
CREATE POLICY "Drivers can update own notifications"
  ON notifications FOR UPDATE
  USING (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  )
  WITH CHECK (
    driver_id = get_driver_id(auth.uid()) 
    OR driver_id IS NULL
  );
