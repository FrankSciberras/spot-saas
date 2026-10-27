// =============================================================================
// STRIPE — EXTRA-VEHICLE CHARGES (server only)
// =============================================================================
// Each plan covers `includedVehicles`; every vehicle beyond that costs
// `perVehiclePrice` a month. In Stripe that's a second subscription item on its
// own product per plan ("Pro — extra vehicles") whose quantity is the number of
// extra vehicles. The product gets a fixed id (rovora_extra_vehicles_<plan>) so
// it can be found again without storing anything in the DB.
//
// syncExtraVehicleBilling() reconciles that item with the fleet's vehicle count
// and current plan. It's idempotent and called after a vehicle is added or
// removed, after checkout, and on every subscription change from the webhook.
// Changes are prorated onto the next invoice.
// =============================================================================

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlanDef, type PlanDef } from './plans';
import { getPlans } from './plans-data';
import { getStripe, isStripeEnabled } from './stripe';

const CURRENCY = 'eur';
const EXTRA_PRODUCT_PREFIX = 'rovora_extra_vehicles_';
/** Subscription states where the fleet is still being billed. */
const BILLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Is this subscription item the extra-vehicles add-on (not the base plan)? */
export function isExtraVehicleItem(item: Stripe.SubscriptionItem): boolean {
  const product = item.price.product;
  const id = typeof product === 'string' ? product : product?.id;
  return !!id && id.startsWith(EXTRA_PRODUCT_PREFIX);
}

/** Vehicles the fleet pays extra for on this plan. */
export function extraVehicleCount(plan: PlanDef, vehicles: number): number {
  if (plan.isCustom || plan.includedVehicles == null) return 0;
  if (!plan.perVehiclePrice || plan.perVehiclePrice <= 0) return 0;
  return Math.max(0, vehicles - plan.includedVehicles);
}

/**
 * The monthly Stripe Price for one extra vehicle on `plan`, creating the
 * add-on product / a new price when the plan's per-vehicle price changed.
 * null when the plan has no per-vehicle charge.
 */
export async function ensureExtraVehiclePrice(
  stripe: Stripe,
  plan: PlanDef
): Promise<string | null> {
  if (plan.isCustom || plan.includedVehicles == null) return null;
  if (!plan.perVehiclePrice || plan.perVehiclePrice <= 0) return null;
  const cents = Math.round(plan.perVehiclePrice * 100);
  const productId = `${EXTRA_PRODUCT_PREFIX}${plan.id}`;
  const name = `${plan.name} — extra vehicles`;

  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(productId);
    if (product.name !== name || !product.active) {
      product = await stripe.products.update(productId, { name, active: true });
    }
  } catch (e) {
    if ((e as { code?: string }).code !== 'resource_missing') throw e;
    product = await stripe.products.create({
      id: productId,
      name,
      metadata: { plan: plan.id, kind: 'extra_vehicles' },
    });
  }

  const dp = product.default_price;
  const defaultId = typeof dp === 'string' ? dp : dp?.id ?? null;
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const matches = (p: Stripe.Price) =>
    p.currency === CURRENCY &&
    p.unit_amount === cents &&
    p.recurring?.interval === 'month' &&
    (p.recurring?.interval_count ?? 1) === 1;
  const price =
    prices.data.find((p) => p.id === defaultId && matches(p)) ??
    prices.data.find(matches) ??
    (await stripe.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: cents,
      recurring: { interval: 'month' },
      metadata: { plan: plan.id, kind: 'extra_vehicles' },
    }));
  if (price.id !== defaultId) {
    await stripe.products.update(productId, { default_price: price.id });
  }
  return price.id;
}

/** How many vehicles the fleet has (every status counts, same as the plan cap). */
export async function countFleetVehicles(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  return count ?? 0;
}

/**
 * Make the subscription's extra-vehicles item match the fleet right now.
 * `planKey` overrides the org's stored plan (used mid plan-change).
 * No-op without Stripe, a live subscription, or a known plan. Throws on Stripe
 * errors — callers that must not fail (vehicle add/remove) wrap it.
 */
export async function syncExtraVehicleBilling(
  orgId: string,
  opts: { planKey?: string } = {}
): Promise<void> {
  if (!isStripeEnabled()) return;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('plan, stripe_subscription_id')
    .eq('id', orgId)
    .maybeSingle();
  const subId = org?.stripe_subscription_id as string | null | undefined;
  if (!subId) return;

  const plan = getPlanDef(await getPlans(), opts.planKey ?? (org?.plan as string));
  if (!plan) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  if (!BILLED_STATUSES.has(sub.status)) return;

  await reconcileExtraVehicleItem(stripe, sub, plan, await countFleetVehicles(orgId));
}

/** The Stripe half of the sync: fix the add-on item on `sub` for `vehicles` cars on `plan`. */
export async function reconcileExtraVehicleItem(
  stripe: Stripe,
  sub: Stripe.Subscription,
  plan: PlanDef,
  vehicles: number
): Promise<void> {
  const subId = sub.id;
  const quantity = extraVehicleCount(plan, vehicles);
  const priceId = quantity > 0 ? await ensureExtraVehiclePrice(stripe, plan) : null;
  const extras = sub.items.data.filter(isExtraVehicleItem);
  const keep = priceId ? extras.find((it) => it.price.id === priceId) : undefined;

  // Drop add-on items for another plan / an old price, or when none are owed.
  for (const it of extras) {
    if (it !== keep) {
      await stripe.subscriptionItems.del(it.id, { proration_behavior: 'create_prorations' });
    }
  }
  if (!priceId) return;
  if (keep) {
    if (keep.quantity !== quantity) {
      await stripe.subscriptionItems.update(keep.id, {
        quantity,
        proration_behavior: 'create_prorations',
      });
    }
  } else {
    await stripe.subscriptionItems.create({
      subscription: subId,
      price: priceId,
      quantity,
      proration_behavior: 'create_prorations',
    });
  }
}

/** Fire-and-forget wrapper for vehicle add/remove: billing never blocks fleet work. */
export async function syncExtraVehicleBillingSafe(orgId: string): Promise<void> {
  try {
    await syncExtraVehicleBilling(orgId);
  } catch (e) {
    console.error(`extra-vehicle billing sync failed for org ${orgId}:`, e);
  }
}
