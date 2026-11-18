// =============================================================================
// STRIPE — ROVORA GPS TRACKER CHARGES (server only)
// =============================================================================
// Every tracker on Rovora's own GPS server (gps_devices.provider = 'rovora')
// costs ROVORA_GPS_PRICE_EUR a month (default €3). In Stripe that's one more
// subscription item, on a product with the FIXED id `rovora_gps_trackers`,
// whose quantity is the fleet's tracker count — the same pattern as the
// extra-vehicles add-on (lib/billing/vehicle-billing.ts).
//
// syncGpsTrackerBilling() is idempotent. It runs after a tracker is added or
// removed, after checkout and on every subscription change (webhook). A fleet
// without a live subscription (e.g. still in its free first month) isn't
// charged; the item is added when it subscribes. Changes are prorated.
// Trackers from a fleet's OWN GPS company (Wialon, flespi…) are never charged.
// =============================================================================

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { hostedGpsConfig } from '@/lib/gps/hosted/config';
import { getStripe, isStripeEnabled } from './stripe';

export const GPS_TRACKER_PRODUCT_ID = 'rovora_gps_trackers';
const CURRENCY = 'eur';
const BILLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isGpsTrackerItem(item: Stripe.SubscriptionItem): boolean {
  const product = item.price.product;
  const id = typeof product === 'string' ? product : product?.id;
  return id === GPS_TRACKER_PRODUCT_ID;
}

/** Monthly price per tracker in EUR, or null when Rovora GPS isn't set up / is free. */
export function gpsTrackerPriceEur(): number | null {
  const cfg = hostedGpsConfig();
  return cfg && cfg.priceEur > 0 ? cfg.priceEur : null;
}

export async function countHostedTrackers(orgId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('gps_devices')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('provider', 'rovora');
  return error ? 0 : (count ?? 0);
}

/** The Stripe Price for one tracker a month (creates product / new price when the amount changed). */
export async function ensureGpsTrackerPrice(stripe: Stripe): Promise<string | null> {
  const eur = gpsTrackerPriceEur();
  if (!eur) return null;
  const cents = Math.round(eur * 100);
  const name = 'Rovora GPS — trackers';

  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(GPS_TRACKER_PRODUCT_ID);
    if (product.name !== name || !product.active) {
      product = await stripe.products.update(GPS_TRACKER_PRODUCT_ID, { name, active: true });
    }
  } catch (e) {
    if ((e as { code?: string }).code !== 'resource_missing') throw e;
    product = await stripe.products.create({
      id: GPS_TRACKER_PRODUCT_ID,
      name,
      metadata: { kind: 'gps_trackers' },
    });
  }

  const dp = product.default_price;
  const defaultId = typeof dp === 'string' ? dp : dp?.id ?? null;
  const prices = await stripe.prices.list({ product: GPS_TRACKER_PRODUCT_ID, active: true, limit: 100 });
  const matches = (p: Stripe.Price) =>
    p.currency === CURRENCY &&
    p.unit_amount === cents &&
    p.recurring?.interval === 'month' &&
    (p.recurring?.interval_count ?? 1) === 1;
  const price =
    prices.data.find((p) => p.id === defaultId && matches(p)) ??
    prices.data.find(matches) ??
    (await stripe.prices.create({
      product: GPS_TRACKER_PRODUCT_ID,
      currency: CURRENCY,
      unit_amount: cents,
      recurring: { interval: 'month' },
      metadata: { kind: 'gps_trackers' },
    }));
  if (price.id !== defaultId) {
    await stripe.products.update(GPS_TRACKER_PRODUCT_ID, { default_price: price.id });
  }
  return price.id;
}

/** Make the subscription's tracker item match the fleet's tracker count right now. */
export async function syncGpsTrackerBilling(orgId: string): Promise<void> {
  if (!isStripeEnabled()) return;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_subscription_id')
    .eq('id', orgId)
    .maybeSingle();
  const subId = org?.stripe_subscription_id as string | null | undefined;
  if (!subId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  if (!BILLED_STATUSES.has(sub.status)) return;

  const quantity = await countHostedTrackers(orgId);
  const priceId = quantity > 0 ? await ensureGpsTrackerPrice(stripe) : null;
  const items = sub.items.data.filter(isGpsTrackerItem);
  const keep = priceId ? items.find((it) => it.price.id === priceId) : undefined;

  for (const it of items) {
    if (it !== keep) await stripe.subscriptionItems.del(it.id, { proration_behavior: 'create_prorations' });
  }
  if (!priceId) return;
  if (keep) {
    if (keep.quantity !== quantity) {
      await stripe.subscriptionItems.update(keep.id, { quantity, proration_behavior: 'create_prorations' });
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

/** Fire-and-forget wrapper: billing never blocks adding or removing a tracker. */
export async function syncGpsTrackerBillingSafe(orgId: string): Promise<void> {
  try {
    await syncGpsTrackerBilling(orgId);
  } catch (e) {
    console.error(`GPS tracker billing sync failed for org ${orgId}:`, e);
  }
}
