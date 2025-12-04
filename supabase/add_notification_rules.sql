-- =============================================================================
-- NOTIFICATION RULES & TEMPLATES
-- Run this in Supabase SQL Editor to add notification management
-- =============================================================================

-- Notification trigger types
DO $$ BEGIN
  CREATE TYPE notification_trigger AS ENUM (
    'roster_published',
    'roster_updated',
    'shift_reminder',
    'document_expiry',
    'service_due',
    'weekly_summary',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification channel types
DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM (
    'app',
    'push',
    'email',
    'all'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Notification rules/templates table
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type notification_trigger NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'app',
  is_active BOOLEAN DEFAULT true,
  
  -- Trigger configuration (JSON for flexibility)
  trigger_config JSONB DEFAULT '{}',
  -- e.g., { "days_before": 7 } for document expiry
  -- e.g., { "hours_before": 24 } for shift reminder
  -- e.g., { "km_threshold": 2000 } for service due
  
  -- Template content
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  -- Templates can use variables like {{driver_name}}, {{vehicle_reg}}, etc.
  
  -- Targeting
  target_role TEXT DEFAULT 'driver', -- 'driver', 'admin', 'all'
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification log (sent notifications history)
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  
  channel notification_channel NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_rules_trigger ON notification_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);

-- Enable RLS
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Policies for notification_rules
CREATE POLICY "Admins can manage notification rules"
  ON notification_rules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Staff can view notification rules"
  ON notification_rules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Policies for notification_log
CREATE POLICY "Admins can view all logs"
  ON notification_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can view their own logs"
  ON notification_log FOR SELECT
  USING (recipient_id = auth.uid());

-- Insert default notification rules
INSERT INTO notification_rules (name, description, trigger_type, channel, title_template, body_template, trigger_config, target_role) VALUES
  ('Roster Published', 'Notify drivers when a new roster is published', 'roster_published', 'all', 'New Roster Published', 'The roster for {{roster_title}} is now available. Check your shifts!', '{}', 'driver'),
  ('Roster Updated', 'Notify drivers when a published roster is updated', 'roster_updated', 'all', 'Roster Updated', 'The roster for {{roster_title}} has been updated. Please check for changes.', '{}', 'driver'),
  ('Shift Reminder', 'Remind drivers of upcoming shifts', 'shift_reminder', 'push', 'Shift Tomorrow', 'You have a shift scheduled for tomorrow with {{vehicle_reg}}.', '{"hours_before": 24}', 'driver'),
  ('Document Expiry Warning', 'Alert about expiring documents', 'document_expiry', 'all', 'Document Expiring Soon', 'Your {{document_type}} expires on {{expiry_date}}. Please renew it.', '{"days_before": 30}', 'driver'),
  ('Service Due Alert', 'Alert about vehicles needing service', 'service_due', 'app', 'Vehicle Service Due', '{{vehicle_reg}} is due for service at {{next_service_mileage}} km.', '{"km_threshold": 2000}', 'admin'),
  ('Weekly Summary', 'Weekly summary for admins', 'weekly_summary', 'email', 'Weekly Fleet Summary', 'Here is your weekly fleet summary for the week of {{week_start}}.', '{"day_of_week": 1}', 'admin')
ON CONFLICT DO NOTHING;

SELECT 'Notification rules tables created successfully!' as message;
