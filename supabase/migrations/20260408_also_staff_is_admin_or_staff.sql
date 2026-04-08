-- =============================================================================
-- Treat driver accounts with also_staff as staff in shared RLS helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_staff(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = user_id
      AND (
        role IN ('admin', 'staff')
        OR (role = 'driver' AND COALESCE(also_staff, false))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_staff(uuid) TO authenticated;
