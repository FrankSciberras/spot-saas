-- =============================================================================
-- FREE-TRIAL OFFER — admin-set trial length + optional time-limited campaign
-- =============================================================================
-- The trial a new fleet gets is now set by the platform admin in /admin →
-- Trials instead of being a hardcoded 30 days. It lives in one app_settings row
-- (platform org, key 'trial_offer') shaped like:
--   { "standardDays": 30,
--     "promo": { "days": 90, "endsOn": "2026-10-31", "label": "Autumn offer" } | null }
-- See lib/billing/trial-offer.ts.
--
-- The offer is printed on the public marketing pages, which render without a
-- signed-in user (and at build time), so this one row is readable by anyone.
-- Every other app_settings row keeps its members-only policy. Writes still go
-- through the server (service role) after a platform-admin check.
-- Also renames the default plan-card button (see the end). Safe to re-run.
-- =============================================================================

INSERT INTO public.app_settings (organization_id, key, value, description)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'trial_offer',
  '{"standardDays": 30, "promo": null}'::jsonb,
  'Free-trial length for new sign-ups, plus an optional time-limited campaign. Edited in /admin → Trials.'
)
ON CONFLICT (organization_id, key) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can read the public trial offer" ON public.app_settings;
CREATE POLICY "Anyone can read the public trial offer"
  ON public.app_settings FOR SELECT TO anon, authenticated
  USING (
    organization_id = '00000000-0000-0000-0000-000000000001'
    AND key = 'trial_offer'
  );

-- Customer-facing copy no longer says "trial" (it leads with "free"), so the
-- price-card buttons follow suit. Only rows still on the old default change;
-- a label the admin customised in /admin → Packages is left alone.
UPDATE public.plans
  SET cta_label = 'Get started free'
  WHERE cta_label = 'Start free trial';

SELECT 'trial_offer installed.' AS message;
