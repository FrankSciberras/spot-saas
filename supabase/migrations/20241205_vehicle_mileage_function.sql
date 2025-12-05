-- =============================================================================
-- VEHICLE MILEAGE UPDATE FUNCTION
-- Allows any authenticated user to update vehicle mileage (for driver shifts)
-- =============================================================================

-- Create a function that updates vehicle mileage with SECURITY DEFINER
-- This bypasses RLS and allows drivers to update mileage when submitting shifts
CREATE OR REPLACE FUNCTION update_vehicle_mileage(
  p_vehicle_id UUID,
  p_mileage INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only update if new mileage is >= current mileage (prevent rollback)
  UPDATE vehicles 
  SET 
    mileage = p_mileage,
    updated_at = NOW()
  WHERE id = p_vehicle_id
    AND (mileage IS NULL OR mileage <= p_mileage);
    
  -- If no rows updated, check if it's because mileage was higher
  IF NOT FOUND THEN
    -- Check if vehicle exists
    IF NOT EXISTS (SELECT 1 FROM vehicles WHERE id = p_vehicle_id) THEN
      RAISE EXCEPTION 'Vehicle not found';
    END IF;
    -- Otherwise mileage was higher, which is fine - silently succeed
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_vehicle_mileage(UUID, INTEGER) TO authenticated;

-- =============================================================================
-- CREATE SERVICE NOTIFICATION FUNCTION
-- Allows drivers to create service due notifications (bypasses RLS)
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

  -- Insert the notification (driver_id = NULL means it's for admins)
  INSERT INTO notifications (driver_id, title, body, type, action_url)
  VALUES (NULL, p_title, p_body, p_type, p_action_url)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_service_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

SELECT 'Vehicle mileage and notification functions created successfully!' as message;
