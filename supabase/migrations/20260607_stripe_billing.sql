-- =============================================================================
-- STRIPE BILLING — wire real payments into the plan catalogue + fleets
-- =============================================================================
-- Until now plan activation was a stub: an admin set organizations.plan directly
-- with no charge (see 20260530_saas_07_trials.sql). This migration adds the
-- columns Stripe needs so a real Checkout + webhook flow can drive the plan:
--
--   plans.stripe_price_id          the recurring Price a fleet subscribes to
--   organizations.stripe_subscription_id    the fleet's active subscription
--   organizations.subscription_status       mirror of Stripe's sub status
--   organizations.current_period_end         when the paid period renews/ends
--
-- organizations.stripe_customer_id already exists (20260529_saas_01).
--
-- The webhook (app/api/stripe/webhook) writes these with the service-role admin
-- client, so no new RPC/RLS is needed here — only columns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plans — map each self-serve package to its Stripe recurring Price.
-- Custom-priced tiers (is_custom) have no price and stay sales-led.
-- -----------------------------------------------------------------------------
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- -----------------------------------------------------------------------------
-- organizations — track the live subscription mirrored from Stripe.
-- -----------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS subscription_status    TEXT;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_subscription
  ON organizations(stripe_subscription_id);

SELECT 'Stripe billing columns installed.' AS message;
