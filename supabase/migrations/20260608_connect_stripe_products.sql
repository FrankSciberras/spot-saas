-- =============================================================================
-- CONNECT STRIPE PRODUCTS TO PLANS
-- =============================================================================
-- A plan can be wired to Stripe by either:
--   stripe_price_id    a specific recurring Price (price_...), OR
--   stripe_product_id  a Product (prod_...) — checkout resolves its default price
-- Using the product id is the friendlier option: rotate the price in Stripe
-- without touching the app. Checkout/webhook handle either.
--
-- This migration adds stripe_product_id and connects the three live products to
-- the existing tiers (in catalogue order): starter←Lite, growth←Pro, scale←Ent.
-- It also makes `scale` self-serve buyable (was sales-led "Book a demo").
-- =============================================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_plans_stripe_product ON plans(stripe_product_id);

-- Connect products to tiers by their stable catalogue key.
UPDATE plans SET stripe_product_id = 'prod_Uf999ueRGGYrsl' WHERE key = 'starter';
UPDATE plans SET stripe_product_id = 'prod_Uf9APKwDNkv8j6' WHERE key = 'growth';
UPDATE plans SET stripe_product_id = 'prod_Uf9AkcaZJzIqiR' WHERE key = 'scale';

-- Enterprise (scale) should now be purchasable via Checkout like the others,
-- so flip it off custom/sales-led and let it self-activate.
UPDATE plans
SET is_custom = false
WHERE key = 'scale';

SELECT 'Stripe products connected to plans.' AS message;
