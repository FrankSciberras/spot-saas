// =============================================================================
// BILLING EVENTS LEDGER (server only)
// =============================================================================
// The organizations table only knows a fleet's CURRENT plan and status. The
// Analytics page also needs what HAPPENED: renewals, upgrades and downgrades,
// cancellations (with the reason the customer gave), failed payments and
// checkout problems. Those are written here, one row per thing that happened,
// into billing_events (supabase/migrations/20261123_analytics_insights.sql):
//
//   • the Stripe webhook records each one as it happens, and
//   • importStripeHistory() fills in the past from Stripe on demand
//     (Admin Console → Analytics → Revenue → "Import from Stripe").
//
// Every row has a deterministic `key`, so a webhook retry, or importing twice,
// never counts anything twice. Recording is best-effort: it never throws, so it
// can't break the webhook or a checkout.
// =============================================================================

import 'server-only';
import type Stripe from 'stripe';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { parseUserAgent } from '@/lib/analytics/classify';
import { getStripe } from './stripe';
import { isExtraVehicleItem } from './vehicle-billing';
import { isGpsTrackerItem } from './gps-billing';

export type BillingEventKind =
  | 'subscribed'
  | 'renewed'
  | 'upgraded'
  | 'downgraded'
  | 'cancel_scheduled'
  | 'reactivated'
  | 'cancelled'
  | 'payment_failed'
  | 'checkout_failed'
  | 'checkout_abandoned';

export interface BillingEventInput {
  key: string;
  kind: BillingEventKind;
  /** When it happened: a Date, an ISO string, or Stripe unix seconds. */
  at: Date | string | number;
  organizationId?: string | null;
  planFrom?: string | null;
  planTo?: string | null;
  /** Major units (EUR). */
  amount?: number | null;
  currency?: string | null;
  reason?: string | null;
  comment?: string | null;
  device?: string | null;
  attempts?: number | null;
  recovered?: boolean;
  customerId?: string | null;
  subscriptionId?: string | null;
}

const toIso = (at: BillingEventInput['at']) =>
  typeof at === 'number' ? new Date(at * 1000).toISOString() : at instanceof Date ? at.toISOString() : at;

let warnedMissing = false;
function isMissingTable(error: { code?: string; message?: string }): boolean {
  const m = error.message ?? '';
  return error.code === '42P01' || error.code === 'PGRST205' || (/billing_events/.test(m) && /does not exist|schema cache/.test(m));
}

/**
 * Write one event. `update: true` overwrites an existing row with the same key
 * (used for a failed payment's attempt count); otherwise a repeat is ignored.
 */
export async function recordBillingEvent(e: BillingEventInput, opts: { update?: boolean } = {}): Promise<boolean> {
  try {
    const row = {
      key: e.key.slice(0, 200),
      kind: e.kind,
      occurred_at: toIso(e.at),
      organization_id: e.organizationId ?? null,
      plan_from: e.planFrom ?? null,
      plan_to: e.planTo ?? null,
      amount: e.amount ?? null,
      currency: e.currency ? e.currency.toUpperCase() : null,
      reason: e.reason ? e.reason.slice(0, 200) : null,
      comment: e.comment ? e.comment.slice(0, 2000) : null,
      device: e.device ?? null,
      attempts: e.attempts ?? null,
      recovered: e.recovered ?? false,
      stripe_customer_id: e.customerId ?? null,
      stripe_subscription_id: e.subscriptionId ?? null,
    };
    const { error } = await createAdminClient()
      .from('billing_events')
      .upsert(row, { onConflict: 'key', ignoreDuplicates: !opts.update });
    if (error) {
      if (isMissingTable(error)) {
        if (!warnedMissing) console.warn('billing events: table missing — run supabase/migrations/20261123_analytics_insights.sql');
        warnedMissing = true;
      } else {
        console.error(`billing events: ${e.kind} not recorded:`, error.message);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(`billing events: ${e.kind} failed:`, err);
    return false;
  }
}

/** A failed invoice was paid in the end. */
export async function markPaymentRecovered(invoiceId: string): Promise<void> {
  try {
    await createAdminClient().from('billing_events').update({ recovered: true }).eq('key', `inv:${invoiceId}:failed`);
  } catch {
    /* best-effort */
  }
}

/** Desktop | Mobile | Tablet for the current request, or null outside one. */
export async function requestDevice(): Promise<string | null> {
  try {
    const ua = (await headers()).get('user-agent');
    return ua ? parseUserAgent(ua).device : null;
  } catch {
    return null;
  }
}

// ── Stripe helpers shared by the webhook and the import ──────────────────────

/** The plan line of a subscription — never an add-on (extra vehicles, GPS trackers). */
export function baseItem(items: Stripe.SubscriptionItem[] | undefined | null): Stripe.SubscriptionItem | undefined {
  const list = items ?? [];
  return list.find((it) => !isExtraVehicleItem(it) && !isGpsTrackerItem(it)) ?? list[0];
}

const itemMonthly = (it: Stripe.SubscriptionItem | undefined) => ((it?.price?.unit_amount ?? 0) * (it?.quantity ?? 1)) / 100;

interface PlanRow { key: string; stripe_price_id: string | null; stripe_product_id: string | null; price_amount: number | string | null }
let planCache: { at: number; rows: PlanRow[] } | null = null;
async function planRows(): Promise<PlanRow[]> {
  if (planCache && Date.now() - planCache.at < 60_000) return planCache.rows;
  const { data } = await createAdminClient().from('plans').select('key, stripe_price_id, stripe_product_id, price_amount');
  planCache = { at: Date.now(), rows: (data ?? []) as PlanRow[] };
  return planCache.rows;
}

/** Our plan key for a Stripe price — by exact Price id, then by its Product. */
export async function planKeyForPrice(price: Stripe.Price | undefined | null): Promise<string | null> {
  if (!price) return null;
  const rows = await planRows();
  const byPrice = rows.find((r) => r.stripe_price_id && r.stripe_price_id === price.id);
  if (byPrice) return byPrice.key;
  const productId = typeof price.product === 'string' ? price.product : price.product?.id;
  const byProduct = productId ? rows.find((r) => r.stripe_product_id === productId) : undefined;
  return byProduct?.key ?? null;
}

/** Why a subscription was cancelled: the customer's answer, else Stripe's reason. */
export function cancellationOf(sub: Stripe.Subscription): { reason: string | null; comment: string | null } {
  const d = sub.cancellation_details;
  return { reason: d?.feedback ?? d?.reason ?? null, comment: d?.comment ?? null };
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/** The organization a Stripe object belongs to. */
export async function orgFor(ref: { orgId?: string | null; subscriptionId?: string | null; customerId?: string | null }): Promise<string | null> {
  if (ref.orgId) return ref.orgId;
  const admin = createAdminClient();
  if (ref.subscriptionId) {
    const { data } = await admin.from('organizations').select('id').eq('stripe_subscription_id', ref.subscriptionId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (ref.customerId) {
    const { data } = await admin.from('organizations').select('id').eq('stripe_customer_id', ref.customerId).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

/** The subscription an invoice was raised for (new and old Stripe API shapes). */
export function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const fromParent = inv.parent?.subscription_details?.subscription;
  const legacy = (inv as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(fromParent ?? legacy ?? null);
}

/** Record a new paying subscription. */
export async function recordSubscribed(sub: Stripe.Subscription, extra: { orgId?: string | null; device?: string | null } = {}): Promise<void> {
  const base = baseItem(sub.items?.data);
  await recordBillingEvent({
    key: `sub:${sub.id}:created`,
    kind: 'subscribed',
    at: sub.start_date || sub.created,
    organizationId: await orgFor({ orgId: extra.orgId ?? sub.metadata?.organization_id, subscriptionId: sub.id, customerId: idOf(sub.customer) }),
    planTo: await planKeyForPrice(base?.price),
    amount: itemMonthly(base) || null,
    currency: base?.price?.currency ?? null,
    device: extra.device ?? null,
    customerId: idOf(sub.customer),
    subscriptionId: sub.id,
  });
}

/** Record that a subscription ended, with the reason the customer gave. */
export async function recordCancelled(sub: Stripe.Subscription): Promise<void> {
  const base = baseItem(sub.items?.data);
  const why = cancellationOf(sub);
  await recordBillingEvent({
    key: `sub:${sub.id}:cancelled`,
    kind: 'cancelled',
    at: sub.ended_at ?? sub.canceled_at ?? Math.floor(Date.now() / 1000),
    organizationId: await orgFor({ orgId: sub.metadata?.organization_id, subscriptionId: sub.id, customerId: idOf(sub.customer) }),
    planFrom: await planKeyForPrice(base?.price),
    amount: itemMonthly(base) || null,
    currency: base?.price?.currency ?? null,
    reason: why.reason,
    comment: why.comment,
    customerId: idOf(sub.customer),
    subscriptionId: sub.id,
  });
}

/**
 * A customer.subscription.updated event: a plan change (upgrade/downgrade, by
 * the base line's monthly amount), a cancellation being scheduled, or a
 * scheduled cancellation being taken back. Add-on quantity changes (extra cars,
 * trackers) aren't plan changes and are ignored here.
 */
export async function recordSubscriptionUpdate(event: Stripe.Event): Promise<void> {
  if (event.type !== 'customer.subscription.updated') return;
  const sub = event.data.object as Stripe.Subscription;
  const prev = (event.data.previous_attributes ?? {}) as Partial<Stripe.Subscription>;
  const customerId = idOf(sub.customer);
  const org = () => orgFor({ orgId: sub.metadata?.organization_id, subscriptionId: sub.id, customerId });

  if (prev.items?.data) {
    const before = baseItem(prev.items.data);
    const after = baseItem(sub.items?.data);
    if (before?.price?.id && after?.price?.id && before.price.id !== after.price.id) {
      const delta = itemMonthly(after) - itemMonthly(before);
      if (delta !== 0) {
        await recordBillingEvent({
          key: `evt:${event.id}`,
          kind: delta > 0 ? 'upgraded' : 'downgraded',
          at: event.created,
          organizationId: await org(),
          planFrom: await planKeyForPrice(before.price),
          planTo: await planKeyForPrice(after.price),
          amount: Math.round(delta * 100) / 100,
          currency: after.price.currency,
          customerId,
          subscriptionId: sub.id,
        });
      }
    }
  }

  const scheduled = (s: { cancel_at_period_end?: boolean | null; cancel_at?: number | null }) => !!s.cancel_at_period_end || !!s.cancel_at;
  const touched = 'cancel_at_period_end' in prev || 'cancel_at' in prev;
  if (touched && sub.status !== 'canceled') {
    const was = scheduled({
      cancel_at_period_end: 'cancel_at_period_end' in prev ? prev.cancel_at_period_end : sub.cancel_at_period_end,
      cancel_at: 'cancel_at' in prev ? prev.cancel_at : sub.cancel_at,
    });
    const now = scheduled(sub);
    if (now && !was) {
      const why = cancellationOf(sub);
      await recordBillingEvent({
        key: `sub:${sub.id}:cancel_scheduled:${sub.canceled_at ?? event.created}`,
        kind: 'cancel_scheduled',
        at: sub.canceled_at ?? event.created,
        organizationId: await org(),
        planFrom: await planKeyForPrice(baseItem(sub.items?.data)?.price),
        reason: why.reason,
        comment: why.comment,
        customerId,
        subscriptionId: sub.id,
      });
    } else if (!now && was) {
      await recordBillingEvent({
        key: `evt:${event.id}`,
        kind: 'reactivated',
        at: event.created,
        organizationId: await org(),
        planTo: await planKeyForPrice(baseItem(sub.items?.data)?.price),
        customerId,
        subscriptionId: sub.id,
      });
    }
  }
}

/** Why a charge was declined, when Stripe tells us (older API shapes only). */
async function declineReason(stripe: Stripe, inv: Stripe.Invoice): Promise<string | null> {
  const pi = (inv as unknown as { payment_intent?: string | { id: string } | null }).payment_intent;
  const piId = idOf(pi ?? null);
  if (piId) {
    try {
      const intent = await stripe.paymentIntents.retrieve(piId);
      const err = intent.last_payment_error;
      return err?.decline_code ?? err?.code ?? null;
    } catch {
      /* not critical */
    }
  }
  return inv.last_finalization_error?.code ?? null;
}

/** A renewal was paid (and, if it had failed before, it has now recovered). */
export async function recordInvoicePaid(inv: Stripe.Invoice): Promise<void> {
  if (!inv.id) return;
  const subId = invoiceSubscriptionId(inv);
  if (inv.attempt_count > 1) await markPaymentRecovered(inv.id);
  if (inv.billing_reason !== 'subscription_cycle') return;
  const customerId = idOf(inv.customer);
  await recordBillingEvent({
    key: `inv:${inv.id}:paid`,
    kind: 'renewed',
    at: inv.status_transitions?.paid_at ?? inv.created,
    organizationId: await orgFor({ orgId: inv.parent?.subscription_details?.metadata?.organization_id, subscriptionId: subId, customerId }),
    amount: inv.amount_paid / 100,
    currency: inv.currency,
    customerId,
    subscriptionId: subId,
  });
}

/** A charge for an invoice was declined. One row per invoice; retries bump `attempts`. */
export async function recordInvoiceFailed(inv: Stripe.Invoice, stripe: Stripe = getStripe()): Promise<void> {
  if (!inv.id) return;
  const subId = invoiceSubscriptionId(inv);
  const customerId = idOf(inv.customer);
  await recordBillingEvent(
    {
      key: `inv:${inv.id}:failed`,
      kind: 'payment_failed',
      at: inv.created,
      organizationId: await orgFor({ orgId: inv.parent?.subscription_details?.metadata?.organization_id, subscriptionId: subId, customerId }),
      amount: inv.amount_due / 100,
      currency: inv.currency,
      reason: await declineReason(stripe, inv),
      attempts: inv.attempt_count,
      recovered: inv.status === 'paid',
      customerId,
      subscriptionId: subId,
    },
    { update: true },
  );
}

/** Someone opened the Stripe payment page and left without paying. */
export async function recordCheckoutAbandoned(session: Stripe.Checkout.Session): Promise<void> {
  const orgId = session.metadata?.organization_id ?? session.client_reference_id ?? null;
  await recordBillingEvent({
    key: `cs:${session.id}:expired`,
    kind: 'checkout_abandoned',
    at: session.created,
    organizationId: orgId,
    planTo: session.metadata?.plan ?? null,
    amount: session.amount_total != null ? session.amount_total / 100 : null,
    currency: session.currency ?? null,
    device: session.metadata?.device ?? null,
    customerId: idOf(session.customer),
  });
}

// ── Import the past from Stripe ──────────────────────────────────────────────

/** How many Stripe records were looked at (each is recorded at most once). */
export interface ImportResult {
  subscriptions: number;
  invoices: number;
  planChanges: number;
}

/**
 * Fill billing_events from Stripe's own records: every subscription (start and
 * end, with cancellation reasons), the last 13 months of invoices (renewals and
 * failed payments) and the last 30 days of plan changes (Stripe only keeps
 * events that long). Safe to run any number of times.
 */
export async function importStripeHistory(): Promise<ImportResult> {
  const stripe = getStripe();
  const out: ImportResult = { subscriptions: 0, invoices: 0, planChanges: 0 };

  // Subscriptions — started, ended, or due to end.
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
    if (++out.subscriptions > 3000) break;
    if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') continue; // never paid
    await recordSubscribed(sub);
    if (sub.status === 'canceled') await recordCancelled(sub);
    else if (sub.cancel_at_period_end || sub.cancel_at) {
      const why = cancellationOf(sub);
      await recordBillingEvent({
        key: `sub:${sub.id}:cancel_scheduled:${sub.canceled_at ?? sub.created}`,
        kind: 'cancel_scheduled',
        at: sub.canceled_at ?? sub.created,
        organizationId: await orgFor({ orgId: sub.metadata?.organization_id, subscriptionId: sub.id, customerId: idOf(sub.customer) }),
        planFrom: await planKeyForPrice(baseItem(sub.items?.data)?.price),
        reason: why.reason,
        comment: why.comment,
        customerId: idOf(sub.customer),
        subscriptionId: sub.id,
      });
    }
  }

  // Invoices — renewals and failed charges.
  const since = Math.floor(Date.now() / 1000) - 400 * 86_400;
  for await (const inv of stripe.invoices.list({ created: { gte: since }, limit: 100 })) {
    if (++out.invoices > 5000) break;
    if (!invoiceSubscriptionId(inv)) continue;
    if (inv.status === 'paid') await recordInvoicePaid(inv);
    const failedOnce = inv.attempt_count > 1 || ((inv.status === 'open' || inv.status === 'uncollectible') && inv.attempted);
    if (failedOnce) await recordInvoiceFailed(inv, stripe);
  }

  // Plan changes — only the last 30 days still exist as events at Stripe.
  for await (const event of stripe.events.list({ type: 'customer.subscription.updated', limit: 100 })) {
    if (++out.planChanges > 2000) break;
    await recordSubscriptionUpdate(event);
  }

  return out;
}
