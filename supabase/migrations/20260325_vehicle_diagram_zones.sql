-- Vehicle diagram zone configurations
-- Stores interactive zone polygons for each car model and view type
CREATE TABLE IF NOT EXISTS vehicle_diagram_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL,           -- e.g. 'yaris-cross'
  view_type text NOT NULL,           -- e.g. 'side', 'top'
  svg_path text,                     -- path to SVG outline file, e.g. '/vehicle-diagrams/yaris cross outline.svg'
  zones jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "front_left_door": { "path": "M ...", "points": [{x,y},...] }, ... }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_key, view_type)
);

-- RLS
ALTER TABLE vehicle_diagram_zones ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read diagram configs
CREATE POLICY "Authenticated users can view diagram zones"
  ON vehicle_diagram_zones FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage diagram zones"
  ON vehicle_diagram_zones FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );
