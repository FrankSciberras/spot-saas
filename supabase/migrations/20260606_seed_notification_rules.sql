-- =============================================================================
-- DEFAULT NOTIFICATION RULES PER ORG — alerts that work out of the box
-- =============================================================================
-- New fleets were created with ZERO notification_rules, so the rules engine and
-- the roster/service routes had nothing to fire (or fell back to a random org's
-- rule). This seeds a sensible, EDITABLE default rule set for each org:
--   * roster_published / roster_updated  (event-based, fired on publish)
--   * shift_reminder                      (cron, 24h before)
--   * document_expiry                     (cron, 30 days before)
--   * service_due                         (on mileage update)
-- Operators tune channel / timing / target / on-off in their Notifications page.
-- =============================================================================

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
    (p_org, 'Document Expiry Warning', 'Warn drivers about expiring documents', 'document_expiry', 'all',
      'Document expiring soon', 'Your {{document_type}} expires on {{expiry_date}} ({{days_left}} days left). Please renew it.', '{"days_before": 30}'::jsonb, 'driver', true),
    (p_org, 'Service Due Alert', 'Alert admins when a vehicle is due for service', 'service_due', 'app',
      'Vehicle service due', '{{vehicle_reg}} is approaching its service at {{next_service_mileage}} km.', '{"km_threshold": 2000}'::jsonb, 'admin', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_notification_rules(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Seed on org creation: recreate create_organization_with_owner with a call to
-- the seeder just before it returns. (Body mirrors 20260530_saas_07_trials.sql.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_email     TEXT;
  v_org_id    UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_organization_with_owner: no authenticated user';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  INSERT INTO public.users (id, email, role)
  VALUES (v_uid, COALESCE(v_email, v_uid::text || '@unknown.local'), 'admin')
  ON CONFLICT (id) DO NOTHING;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'create_organization_with_owner: name is required';
  END IF;

  v_base_slug := lower(regexp_replace(
                   COALESCE(NULLIF(trim(p_slug), ''), p_name),
                   '[^a-z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'fleet';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.organizations (name, slug, plan, trial_started_at, trial_ends_at)
  VALUES (trim(p_name), v_slug, 'trial', NOW(), NOW() + INTERVAL '30 days')
  RETURNING id INTO v_org_id;

  INSERT INTO public.memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  -- Give the new fleet a working set of default notification rules.
  PERFORM public.seed_default_notification_rules(v_org_id);

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Backfill: every existing org that has no rules gets the defaults.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_notification_rules(r.id);
  END LOOP;
END $$;

SELECT 'Default notification rules seeded.' AS message;
