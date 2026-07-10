-- =============================================================================
-- PRICING — cap the Fleet tier + add a sales-assisted Enterprise tier
-- =============================================================================
-- Retires the "€99 flat, unlimited vehicles" Fleet plan. That plan contradicted
-- the "per-vehicle pricing" promise and gave away the largest fleets (a 50-car
-- operator paid the same €99 as a 5-car one). Fleet now includes 30 vehicles at
-- €99 and charges €2 per extra car, capped at 75 vehicles. Fleets above 75 move
-- onto a new custom-priced Enterprise tier (contact sales) — that's where the
-- done-for-you onboarding + dedicated account manager now live.
-- Starter (€9) and Pro (€35) are unchanged.
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- ── Fleet (key 'scale') — cap at 75, add per-vehicle overage ──────────────────
UPDATE plans SET
  name = 'Fleet',
  blurb = 'For larger operators who want everything, with guided onboarding.',
  price_label = '€99', price_unit = '/ mo', price_amount = 99,
  included_vehicles = 30, per_vehicle_price = 2,
  billing_note = '30 vehicles included · €2 per extra car',
  cap_label = 'Up to 75 vehicles',
  max_drivers = 75, max_vehicles = 75,
  features = ARRAY[
    'Everything in Pro',
    'Up to 75 vehicles',
    'Guided onboarding',
    'We import your data for you',
    'First in line for Uber & Bolt integrations'
  ],
  color = '#a78bfa', cta_label = 'Start free trial', cta_href = NULL,
  is_custom = false, is_popular = false, is_published = true
WHERE key = 'scale';

-- ── Enterprise (new custom tier for 75+ vehicles) ─────────────────────────────
INSERT INTO plans (
  key, name, blurb, price_label, price_unit, price_amount,
  included_vehicles, per_vehicle_price, billing_note, cap_label,
  max_drivers, max_vehicles, features, color, cta_label, cta_href,
  is_custom, is_popular, is_published, sort_order
) VALUES (
  'enterprise', 'Enterprise',
  'For larger operators who want custom terms and hands-on support.',
  'Let''s talk', NULL, 0,
  NULL, NULL,
  'Custom pricing for 75+ vehicles',
  '75+ vehicles',
  NULL, NULL,
  ARRAY[
    'Everything in Fleet',
    'Unlimited vehicles',
    'Custom volume pricing',
    'Dedicated account manager',
    'White-glove onboarding & data import',
    'Priority integration access'
  ],
  '#a78bfa', 'Talk to us', '/contact',
  true, false, true, 4
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  blurb = EXCLUDED.blurb,
  price_label = EXCLUDED.price_label,
  price_unit = EXCLUDED.price_unit,
  price_amount = EXCLUDED.price_amount,
  included_vehicles = EXCLUDED.included_vehicles,
  per_vehicle_price = EXCLUDED.per_vehicle_price,
  billing_note = EXCLUDED.billing_note,
  cap_label = EXCLUDED.cap_label,
  max_drivers = EXCLUDED.max_drivers,
  max_vehicles = EXCLUDED.max_vehicles,
  features = EXCLUDED.features,
  color = EXCLUDED.color,
  cta_label = EXCLUDED.cta_label,
  cta_href = EXCLUDED.cta_href,
  is_custom = EXCLUDED.is_custom,
  is_popular = EXCLUDED.is_popular,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order;

SELECT 'Fleet capped at 75; Enterprise tier added.' AS message;
