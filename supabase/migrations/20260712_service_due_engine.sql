-- =============================================================================
-- SERVICE-DUE AUTOMATION — template upgrade for the newly-executing trigger
-- =============================================================================
-- The rules engine now actually executes `service_due` (km AND date based) and
-- extends `document_expiry` to vehicle insurance / road licence. The old seeded
-- service_due template only made sense for km alerts ("... at {{mileage}} km"),
-- so:
--   1. Rules still carrying the untouched default template are upgraded to the
--      new {{due_info}} variable, which reads well for both trigger kinds
--      ("in ~500 km (at 45,000 km)" / "on 12 Aug 2026 (9 days left)").
--      Operator-customised templates are left alone.
--   2. The per-org seeder is updated so new fleets get the new template.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- 1. Upgrade untouched default templates (exact-match guard keeps custom text safe).
UPDATE notification_rules
SET body_template = '{{vehicle_reg}} is due for service {{due_info}}.',
    trigger_config = trigger_config || '{"days_before": 14}'::jsonb
WHERE trigger_type = 'service_due'
  AND body_template IN (
    '{{vehicle_reg}} is approaching its service at {{next_service_mileage}} km.',
    '{{vehicle_reg}} is approaching its next service at {{next_service_mileage}} km.'  -- older seed variant
  );

-- 2. Re-seed function with the new template for future orgs.
CREATE OR REPLACE FUNCTION public.seed_default_notification_rules(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org IS NULL THEN
    RETURN;
  END IF;

  -- Idempotent: only seed an org that has no rules yet.
  IF EXISTS (SELECT 1 FROM public.notification_rules WHERE organization_id = p_org) THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_rules
    (organization_id, name, description, trigger_type, channel, title_template, body_template, trigger_config, target_role, is_active)
  VALUES
    (p_org, 'Roster Published', 'Notify drivers when a new roster is published', 'roster_published', 'all',
      'New roster published', 'The roster {{roster_title}} is now available — check your shifts.', '{}'::jsonb, 'driver', true),
    (p_org, 'Roster Updated', 'Notify drivers when a published roster changes', 'roster_updated', 'all',
      'Roster updated', 'The roster {{roster_title}} was updated. Please review your shifts.', '{}'::jsonb, 'driver', true),
    (p_org, 'Shift Reminder', 'Remind drivers of an upcoming shift', 'shift_reminder', 'push',
      'Upcoming shift', 'Reminder: {{shift_name}} starts {{start_time}}.', '{"hours_before": 24}'::jsonb, 'driver', true),
    (p_org, 'Document Expiry Warning', 'Warn about expiring driver and vehicle documents', 'document_expiry', 'all',
      'Document expiring soon', 'Your {{document_type}} expires on {{expiry_date}} ({{days_left}} days left). Please renew it.', '{"days_before": 30}'::jsonb, 'driver', true),
    (p_org, 'Service Due Alert', 'Alert admins when a vehicle is due for service (by km or date)', 'service_due', 'app',
      'Vehicle service due', '{{vehicle_reg}} is due for service {{due_info}}.', '{"km_threshold": 2000, "days_before": 14}'::jsonb, 'admin', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_notification_rules(uuid) TO authenticated;

SELECT 'service_due engine templates upgraded.' AS message;
