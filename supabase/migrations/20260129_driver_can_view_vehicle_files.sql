-- Allow drivers to view vehicle-owned documents so they can access insurance/road license/logbook files.
-- Drivers already have read access to vehicles via existing policy "Authenticated users can view vehicles".

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers can view vehicle files" ON public.files;
CREATE POLICY "Drivers can view vehicle files"
  ON public.files FOR SELECT
  USING (
    owner_type = 'vehicle'
    AND get_user_role(auth.uid()) = 'driver'
  );
