CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_dva_driver_id ON public.driver_vehicle_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_dva_vehicle_id ON public.driver_vehicle_assignments(vehicle_id);

INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id)
SELECT d.id, d.assigned_vehicle_id
FROM drivers d
WHERE d.assigned_vehicle_id IS NOT NULL
ON CONFLICT (driver_id, vehicle_id) DO NOTHING;

INSERT INTO public.driver_vehicle_assignments (driver_id, vehicle_id)
SELECT v.assigned_driver_id, v.id
FROM vehicles v
WHERE v.assigned_driver_id IS NOT NULL
ON CONFLICT (driver_id, vehicle_id) DO NOTHING;

ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Staff can view driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can view driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR SELECT
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can insert driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can insert driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can update driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete driver vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Admins/Staff can delete driver vehicle assignments"
  ON public.driver_vehicle_assignments FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Drivers can view own vehicle assignments" ON public.driver_vehicle_assignments;
CREATE POLICY "Drivers can view own vehicle assignments"
  ON public.driver_vehicle_assignments FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM drivers WHERE user_id = auth.uid()
    )
  );
