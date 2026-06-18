-- =============================================================================
-- PER-VEHICLE ADD-ON PRICING + repriced launch catalogue
-- =============================================================================
-- Adds an "included vehicles + price per extra vehicle" model to each package,
-- so the marketing pricing page can show a live price as an operator adds cars,
-- and reprices the three seeded tiers to the launch-friendly structure:
--   Starter €9  (3 incl, +€4/car)  — capture tier, no settlements/financials
--   Pro     €35 (10 incl, +€3/car) — the hero: full GPS + driver pay + books
--   Fleet   €99 (unlimited)        — anchor: everything, hands-on onboarding
-- IDEMPOTENT: re-runnable.
-- =============================================================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS included_vehicles integer;  -- covered by base price; NULL = unlimited included
ALTER TABLE plans ADD COLUMN IF NOT EXISTS per_vehicle_price numeric;  -- cost per vehicle beyond included; NULL = no add-on

-- ── Starter ──────────────────────────────────────────────────────────────────
UPDATE plans SET
  name = 'Starter',
  blurb = 'For solo owners & very small fleets getting off spreadsheets.',
  price_label = '€9', price_unit = '/ mo', price_amount = 9,
  included_vehicles = 3, per_vehicle_price = 4,
  billing_note = '3 vehicles included · €4 per extra car',
  cap_label = 'Up to 6 vehicles',
  max_drivers = 6, max_vehicles = 6,
  features = ARRAY[
    'Vehicles, drivers & shifts',
    'Weekly rosters',
    'Live GPS map (basic)',
    'Service & damage logging',
    'Free driver app',
    'Email support'
  ],
  color = 'var(--text-2)', cta_label = 'Start free trial', cta_href = NULL,
  is_custom = false, is_popular = false, is_published = true
WHERE key = 'starter';

-- ── Pro (key stays 'growth' — organizations.plan already references it) ───────
UPDATE plans SET
  name = 'Pro',
  blurb = 'For working fleets that pay drivers weekly. Our most popular plan.',
  price_label = '€35', price_unit = '/ mo', price_amount = 35,
  included_vehicles = 10, per_vehicle_price = 3,
  billing_note = '10 vehicles included · €3 per extra car',
  cap_label = 'Up to 40 vehicles',
  max_drivers = 40, max_vehicles = 40,
  features = ARRAY[
    'Everything in Starter',
    'Full GPS: zones, speed & route playback',
    'Speeding & lost-signal alerts',
    'Driver settlements & weekly pay',
    'Financials & bookkeeping',
    'Full document-expiry alerts',
    'Priority support'
  ],
  color = 'var(--accent)', cta_label = 'Start free trial', cta_href = NULL,
  is_custom = false, is_popular = true, is_published = true
WHERE key = 'growth';

-- ── Fleet (key stays 'scale'; now a real self-serve €99 flat, not custom) ────
UPDATE plans SET
  name = 'Fleet',
  blurb = 'For larger operators who want everything, with hands-on onboarding.',
  price_label = '€99', price_unit = '/ mo', price_amount = 99,
  included_vehicles = NULL, per_vehicle_price = NULL,
  billing_note = 'Unlimited vehicles · billed monthly',
  cap_label = 'Unlimited drivers & vehicles',
  max_drivers = NULL, max_vehicles = NULL,
  features = ARRAY[
    'Everything in Pro',
    'Unlimited vehicles',
    'We import your data for you',
    'First in line for Uber & Bolt integrations',
    'Dedicated account manager'
  ],
  color = '#a78bfa', cta_label = 'Start free trial', cta_href = NULL,
  is_custom = false, is_popular = false, is_published = true
WHERE key = 'scale';

SELECT 'Per-vehicle add-on pricing applied; Starter/Pro/Fleet repriced.' AS message;
