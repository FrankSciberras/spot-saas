-- =============================================================================
-- Vehicle Damages Table
-- =============================================================================

-- Damage severity enum
DO $$ BEGIN
  CREATE TYPE damage_severity AS ENUM ('minor', 'moderate', 'severe');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Damage status enum
DO $$ BEGIN
  CREATE TYPE damage_status AS ENUM ('open', 'repaired', 'monitoring');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle damages table
CREATE TABLE IF NOT EXISTS vehicle_damages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  zone TEXT NOT NULL,
  description TEXT NOT NULL,
  severity damage_severity NOT NULL DEFAULT 'minor',
  status damage_status NOT NULL DEFAULT 'open',
  repair_cost DECIMAL(10, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  images JSONB DEFAULT '[]'::jsonb,
  reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  repaired_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_vehicle_id ON vehicle_damages(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_zone ON vehicle_damages(zone);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_severity ON vehicle_damages(severity);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_status ON vehicle_damages(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_damages_reported_at ON vehicle_damages(reported_at DESC);

-- Enable RLS
ALTER TABLE vehicle_damages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view vehicle damages"
  ON vehicle_damages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage vehicle damages"
  ON vehicle_damages FOR ALL
  USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Staff can insert vehicle damages"
  ON vehicle_damages FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE POLICY "Staff can update vehicle damages"
  ON vehicle_damages FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_damages_updated_at
  BEFORE UPDATE ON vehicle_damages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
