// =============================================================================
// STRIPE CHECKOUT HELPERS (server only)
// =============================================================================
// Shared by the in-app billing screen (activatePlanAction) and onboarding
// (completeOnboardingAction): turn a chosen paid plan into a Stripe Checkout
// Session URL the browser is redirected to. The plan only becomes active once
// Stripe fires checkout.session.completed → app/api/stripe/webhook.
//
// Uses the service-role admin client so it can read/write the org's billing
// columns regardless of RLS. Server-only — never import from a client bundle.
// =============================================================================

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import type { PlanDef } from './plans';
import { getStripe, appBaseUrl } from './stripe';

interface CheckoutOk {
  url: string;
}
interface CheckoutErr {
  error: string;
}

const CURRENCY = 'eur';

/** Is this Stripe price the monthly `cents` amount the plan advertises? */
function matchesPlan(p: Stripe.Price, cents: number): boolean {
  return (
    p.active &&
    p.currency === CURRENCY &&
    p.unit_amount === cents &&
    p.recurring?.interval === 'month' &&
    (p.recurring?.interval_count ?? 1) === 1
  );
}

/**
 * Keep the connected Stripe product in step with the plan as edited in /admin:
 * the price the site shows is the price checkout charges, and the product name
 * on the Stripe checkout page matches the plan name. A changed price gets a new
 * Stripe Price (prices are immutable) which becomes the product's default;
 * existing subscribers stay on whatever price they signed up at.
 */
async function syncProductPrice(
  stripe: Stripe,
  productId: string,
  plan: PlanDef
): Promise<string | null> {
  const cents = Math.round(plan.priceAmount * 100);
  const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
  const dp = product.default_price;
  const current = dp && typeof dp !== 'string' ? dp : null;

  if (product.name !== plan.name) {
    await stripe.products.update(productId, { name: plan.name });
  }
  if (cents <= 0) return current?.id ?? (typeof dp === 'string' ? dp : null);
  if (current && matchesPlan(current, cents)) return current.id;

  const existing = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const price =
    existing.data.find((p) => matchesPlan(p, cents)) ??
    (await stripe.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: cents,
      recurring: { interval: 'month' },
      metadata: { plan: plan.id },
    }));
  await stripe.products.update(productId, { default_price: price.id });
  return price.id;
}

/**
 * Resolve the recurring Stripe Price id to charge for a plan:
 *   1. an explicit `stripePriceId` (price_…) — used as-is (manual override).
 *   2. otherwise the connected `stripeProductId` (prod_…) — synced to the
 *      plan's price first, then its default price is used.
 *      (For convenience a `prod_…` value pasted into the price field also works.)
 * Returns the price id, or a { error } the caller can surface.
 */
async function resolvePriceId(
  stripe: Stripe,
  plan: PlanDef
): Promise<string | CheckoutErr> {
  const price = plan.stripePriceId?.trim();
  if (price && price.startsWith('price_')) return price;

  const productId =
    plan.stripeProductId?.trim() || (price?.startsWith('prod_') ? price : null);

  if (productId) {
    let resolved: string | null = null;
    try {
      resolved = await syncProductPrice(stripe, productId, plan);
    } catch (e) {
      // Never charge an amount the customer wasn't shown.
      console.error(`Stripe price sync failed for plan ${plan.id}:`, e);
      return { error: 'Could not start checkout. Please try again or contact support.' };
    }
    if (!resolved) {
      return { error: `${plan.name} has no default price set in Stripe.` };
    }
    return resolved;
  }

  return { error: `${plan.name} isn't connected to Stripe yet. Please contact support.` };
}

/**
 * Ensure the org has a Stripe customer, creating + persisting one if missing.
 * Returns the customer id.
 */
async function ensureCustomer(
  orgId: string,
  orgName: string | null,
  email: string | null
): Promise<string> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', orgId)
    .single();

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id as string;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org?.name ?? orgName ?? undefined,
    email: email ?? undefined,
    metadata: { organization_id: orgId },
  });

  await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId);

  return customer.id;
}

/**
 * Create a subscription Checkout Session for `plan` on behalf of `orgId`.
 * The caller is responsible for authorising the org/admin first.
 */
export async function createPlanCheckoutSession(opts: {
  orgId: string;
  orgName?: string | null;
  email?: string | null;
  plan: PlanDef;
}): Promise<CheckoutOk | CheckoutErr> {
  const { orgId, orgName = null, email = null, plan } = opts;

  const stripe = getStripe();

  // Resolve the recurring Price to charge: an explicit price wins, otherwise
  // fall back to the connected product's default price.
  const priceId = await resolvePriceId(stripe, plan);
  if (typeof priceId !== 'string') return priceId; // { error }

  const customerId = await ensureCustomer(orgId, orgName, email);
  const base = appBaseUrl();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Both the session and the resulting subscription carry the org + plan so
    // the webhook can map the payment back to the right fleet/tier.
    client_reference_id: orgId,
    metadata: { organization_id: orgId, plan: plan.id },
    subscription_data: {
      metadata: { organization_id: orgId, plan: plan.id },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    success_url: `${base}/billing?checkout=success`,
    cancel_url: `${base}/billing?checkout=cancelled`,
  });

  if (!session.url) {
    return { error: 'Could not start checkout. Please try again.' };
  }
  return { url: session.url };
}

/**
 * Create a Stripe Billing Portal session so an admin can change plan, update
 * their card or cancel. Returns the portal URL.
 */
export async function createBillingPortalSession(
  orgId: string
): Promise<CheckoutOk | CheckoutErr> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single();

  if (!org?.stripe_customer_id) {
    return { error: 'No billing account yet — choose a plan first.' };
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id as string,
    return_url: `${appBaseUrl()}/billing`,
  });

  return { url: session.url };
}
