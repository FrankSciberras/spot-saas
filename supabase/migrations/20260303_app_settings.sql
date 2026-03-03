-- App Settings table for feature toggles
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read settings
CREATE POLICY "Authenticated users can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can update settings (enforced at API level, but service role bypasses RLS)
CREATE POLICY "Service role can manage settings"
  ON app_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed the package update check toggle
INSERT INTO app_settings (key, value, description)
VALUES (
  'package_update_check_enabled',
  'true'::jsonb,
  'When enabled, a weekly cron job checks for npm package updates and emails the admin.'
)
ON CONFLICT (key) DO NOTHING;
