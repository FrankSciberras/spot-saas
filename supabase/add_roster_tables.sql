-- =============================================================================
-- ADD ROSTER TABLES
-- Run this in Supabase SQL Editor to add roster functionality
-- =============================================================================

-- Roster status enum
DO $$ BEGIN
  CREATE TYPE roster_status AS ENUM ('draft', 'published');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Rosters table (weekly rosters)
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  title TEXT,
  status roster_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(week_start)
);

CREATE INDEX IF NOT EXISTS idx_rosters_week_start ON rosters(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_rosters_status ON rosters(status);

-- Roster assignments (driver-vehicle-day assignments)
CREATE TABLE IF NOT EXISTS roster_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  assignment_date DATE NOT NULL,
  day_of_week INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(roster_id, vehicle_id, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_roster_assignments_roster_id ON roster_assignments(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_vehicle_id ON roster_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_driver_id ON roster_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_date ON roster_assignments(assignment_date);

-- Enable RLS on roster tables
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_assignments ENABLE ROW LEVEL SECURITY;

-- Rosters policies
DROP POLICY IF EXISTS "Authenticated users can view published rosters" ON rosters;
CREATE POLICY "Authenticated users can view published rosters"
  ON rosters FOR SELECT
  USING (auth.uid() IS NOT NULL AND (status = 'published' OR is_admin_or_staff(auth.uid())));

DROP POLICY IF EXISTS "Admins/Staff can insert rosters" ON rosters;
CREATE POLICY "Admins/Staff can insert rosters"
  ON rosters FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update rosters" ON rosters;
CREATE POLICY "Admins/Staff can update rosters"
  ON rosters FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete rosters" ON rosters;
CREATE POLICY "Admins/Staff can delete rosters"
  ON rosters FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- Roster assignments policies
DROP POLICY IF EXISTS "Authenticated users can view assignments of published rosters" ON roster_assignments;
CREATE POLICY "Authenticated users can view assignments of published rosters"
  ON roster_assignments FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM rosters 
      WHERE rosters.id = roster_assignments.roster_id 
      AND (rosters.status = 'published' OR is_admin_or_staff(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admins/Staff can insert roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can insert roster assignments"
  ON roster_assignments FOR INSERT
  WITH CHECK (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can update roster assignments"
  ON roster_assignments FOR UPDATE
  USING (is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can delete roster assignments" ON roster_assignments;
CREATE POLICY "Admins/Staff can delete roster assignments"
  ON roster_assignments FOR DELETE
  USING (is_admin_or_staff(auth.uid()));

-- Done!
SELECT 'Roster tables created successfully!' as message;
