-- =============================================================================
-- SERVICE DUE NOTIFICATION RULE UPDATE
-- Updates the default service_due rule with correct threshold and templates
-- =============================================================================

-- Update the Service Due Alert rule to use 2000km threshold (configurable in UI)
UPDATE notification_rules 
SET 
  trigger_config = '{"km_threshold": 2000}'::jsonb,
  title_template = 'Vehicle Service Due: {{vehicle_reg}}',
  body_template = '{{vehicle_reg}} is approaching its next service at {{next_service_mileage}} km.',
  description = 'Alert when vehicle mileage approaches service due (triggered when driver starts shift)',
  is_active = true
WHERE trigger_type = 'service_due';

-- If the rule doesn't exist, create it
INSERT INTO notification_rules (name, description, trigger_type, channel, title_template, body_template, trigger_config, target_role, is_active)
SELECT 
  'Service Due Alert',
  'Alert when vehicle mileage approaches service due (triggered when driver starts shift)',
  'service_due',
  'app',
  'Vehicle Service Due: {{vehicle_reg}}',
  '{{vehicle_reg}} is approaching its next service at {{next_service_mileage}} km.',
  '{"km_threshold": 2000}'::jsonb,
  'admin',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM notification_rules WHERE trigger_type = 'service_due'
);

SELECT 'Service due notification rule configured successfully!' as message;
