import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeEnabled, appBaseUrl } from '@/lib/billing/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, renderBrandedEmail, isEmailConfigured } from '@/lib/email';

// Stripe needs the Node runtime (crypto) and the raw, unbuffered request body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 *
 * The ONLY place a paid plan is granted. Stripe calls this after a successful
 * Checkout and on every subscription change; we verify the signature, then
 * mirror the subscription state onto the organization with the service-role
 * client. Never trust the browser to activate a plan — only this endpoint does.
 *
 * Handled events:
 *   checkout.session.completed     → activate the chosen plan
 *   customer.subscription.updated  → mirror status / plan / period end
 *   customer.subscription.deleted  → mark the fleet cancelled (locks dashboard)
 */
export async function POST(request: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not set' }, { status: 500 });
  }

  const stripe = getStripe();
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error('stripe webhook: signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(stripe, session);
        break;
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, false);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, true);
        break;
      }
      default:
        // Unhandled events are fine — acknowledge so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(`stripe webhook: handler for ${event.type} failed:`, err);
    // 500 so Stripe retries — the event wasn't durably applied.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Resolve our internal plan key from a subscription's price — first by exact
 * Price id, then by the Price's parent Product id (plans are usually connected
 * by product so a rotated price still maps).
 */
async function planKeyForPrice(price: Stripe.Price | undefined | null): Promise<string | null> {
  if (!price) return null;
  const admin = createAdminClient();

  if (price.id) {
    const { data } = await admin
      .from('plans')
      .select('key')
      .eq('stripe_price_id', price.id)
      .maybeSingle();
    if (data?.key) return data.key as string;
  }

  const productId = typeof price.product === 'string' ? price.product : price.product?.id;
  if (productId) {
    const { data } = await admin
      .from('plans')
      .select('key')
      .eq('stripe_product_id', productId)
      .maybeSingle();
    if (data?.key) return data.key as string;
  }

  return null;
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  // `current_period_end` is a unix timestamp (seconds) when present.
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof end === 'number' ? new Date(end * 1000).toISOString() : null;
}

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  const orgId =
    session.metadata?.organization_id ?? (session.client_reference_id || undefined);
  if (!orgId) {
    console.error('stripe webhook: checkout.session.completed without organization_id');
    return;
  }

  const subId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  // Prefer the plan recorded at checkout; fall back to mapping the subscription's price.
  let planKey = session.metadata?.plan ?? null;
  let subStatus: string | null = null;
  let periodEnd: string | null = null;

  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    subStatus = sub.status;
    periodEnd = periodEndIso(sub);
    if (!planKey) {
      planKey = await planKeyForPrice(sub.items.data[0]?.price);
    }
  }

  if (!planKey) {
    console.error('stripe webhook: could not resolve plan for checkout session', session.id);
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      plan: planKey,
      status: 'active',
      plan_activated_at: new Date().toISOString(),
      stripe_subscription_id: subId ?? null,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      subscription_status: subStatus ?? 'active',
      current_period_end: periodEnd,
    })
    .eq('id', orgId);

  if (error) {
    console.error('stripe webhook: failed to activate plan:', error);
    throw error;
  }

  // Best-effort confirmation email — never let a mail failure fail the webhook
  // (that would make Stripe retry and re-activate).
  await sendPaymentConfirmationEmail(stripe, session, orgId, planKey);
}

/** Send the "your plan is active" email to the paying customer. Never throws. */
async function sendPaymentConfirmationEmail(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  orgId: string,
  planKey: string
) {
  try {
    if (!isEmailConfigured()) return;

    const admin = createAdminClient();
    const [{ data: plan }, { data: org }] = await Promise.all([
      admin.from('plans').select('name, price_unit').eq('key', planKey).maybeSingle(),
      admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    ]);

    // The email used at checkout is the most reliable recipient.
    let email = session.customer_details?.email ?? null;
    if (!email && session.customer) {
      const custId = typeof session.customer === 'string' ? session.customer : session.customer.id;
      const cust = await stripe.customers.retrieve(custId);
      if (!('deleted' in cust)) email = cust.email ?? null;
    }
    if (!email) {
      console.warn('stripe webhook: no recipient email for confirmation', session.id);
      return;
    }

    const planName = (plan?.name as string | undefined) ?? planKey;
    const amount =
      session.amount_total != null
        ? new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency: (session.currency ?? 'eur').toUpperCase(),
          }).format(session.amount_total / 100)
        : null;
    const priceUnit = (plan?.price_unit as string | null | undefined) ?? null;
    const amountLine = amount ? ` (${amount}${priceUnit ? ` ${priceUnit}` : ''})` : '';

    const html = renderBrandedEmail({
      heading: 'Payment received',
      greeting: org?.name ? `Hi ${org.name} team,` : undefined,
      body:
        `Your payment was successful and your ${planName} plan is now active${amountLine}.\n\n` +
        `You can manage your subscription, update your card or view invoices any time from the billing screen.`,
      actionUrl: `${appBaseUrl()}/billing`,
      actionLabel: 'Go to billing',
      footnote: 'Thanks for subscribing. A receipt from Stripe may also arrive separately.',
    });

    await sendEmail({ to: email, subject: `Your ${planName} plan is active`, html });
  } catch (err) {
    console.error('stripe webhook: payment confirmation email failed:', err);
  }
}

async function handleSubscriptionChange(sub: Stripe.Subscription, deleted: boolean) {
  const orgId = sub.metadata?.organization_id;
  const admin = createAdminClient();

  const patch: Record<string, unknown> = {
    subscription_status: sub.status,
    current_period_end: periodEndIso(sub),
  };

  if (deleted || sub.status === 'canceled') {
    // Subscription ended — lock the fleet behind the upgrade screen.
    patch.status = 'cancelled';
  } else if (sub.status === 'active' || sub.status === 'trialing') {
    patch.status = 'active';
    const planKey = await planKeyForPrice(sub.items.data[0]?.price);
    if (planKey) patch.plan = planKey;
  }

  // Locate the org by metadata, falling back to the stored subscription id.
  const query = admin.from('organizations').update(patch);
  const { error } = orgId
    ? await query.eq('id', orgId)
    : await query.eq('stripe_subscription_id', sub.id);

  if (error) {
    console.error('stripe webhook: failed to sync subscription change:', error);
    throw error;
  }
}
