-- =============================================================================
-- VEHICLE SERVICES TABLE
-- Run this in Supabase SQL Editor to add vehicle service tracking
-- =============================================================================

-- Service type enum
DO $$ BEGIN
  CREATE TYPE service_type AS ENUM (
    'oil_change',
    'tire_rotation',
    'tire_replacement',
    'brake_service',
    'brake_pads',
    'brake_discs',
    'air_filter',
    'cabin_filter',
    'spark_plugs',
    'battery',
    'transmission',
    'coolant_flush',
    'timing_belt',
    'general_inspection',
    'annual_service',
    'major_service',
    'repair',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle services table
CREATE TABLE IF NOT EXISTS vehicle_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type service_type NOT NULL DEFAULT 'other',
  mileage_at_service INTEGER NOT NULL,
  next_service_mileage INTEGER,
  next_service_date DATE,
  cost DECIMAL(10, 2),
  currency TEXT DEFAULT 'EUR',
  service_provider TEXT,
  description TEXT,
  parts_replaced TEXT,
  invoice_url TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_services_vehicle_id ON vehicle_services(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_service_date ON vehicle_services(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_next_service_mileage ON vehicle_services(next_service_mileage);
CREATE INDEX IF NOT EXISTS idx_vehicle_services_next_service_date ON vehicle_services(next_service_date);

-- Enable RLS
ALTER TABLE vehicle_services ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view services"
  ON vehicle_services FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins/Staff can insert services"
  ON vehicle_services FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/Staff can update services"
  ON vehicle_services FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins can delete services"
  ON vehicle_services FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

SELECT 'Vehicle services table created successfully!' as message;
