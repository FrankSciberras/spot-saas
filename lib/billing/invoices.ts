// =============================================================================
// INVOICES (server only) — a fleet's Stripe invoice history
// =============================================================================
// Read straight from Stripe at request time (no local copy to drift), scoped
// to the fleet's own Stripe customer. Returns [] when Stripe isn't configured
// or the fleet has never paid, so pages can render an empty state.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { getStripe, isStripeEnabled } from './stripe';

export interface FleetInvoice {
  id: string;
  /** Stripe's human number, e.g. "A1B2C3D4-0007". */
  number: string | null;
  /** ISO date the invoice was created. */
  date: string;
  /** Amount due in EUR (major units). */
  amount: number;
  currency: string;
  /** 'paid' | 'open' | 'draft' | 'uncollectible' | 'void' */
  status: string;
  /** Plan / line description, e.g. "Pro × 1". */
  description: string;
  /** Stripe-hosted page to view/pay the invoice. */
  hostedUrl: string | null;
  /** Direct PDF download. */
  pdfUrl: string | null;
}

/** Latest invoices for a fleet, newest first. */
export async function listFleetInvoices(orgId: string, limit = 24): Promise<FleetInvoice[]> {
  if (!isStripeEnabled()) return [];

  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single();
  const customer = org?.stripe_customer_id as string | null | undefined;
  if (!customer) return [];

  try {
    const stripe = getStripe();
    const res = await stripe.invoices.list({ customer, limit });
    return res.data
      .filter((inv) => inv.status !== 'draft')
      .map((inv) => {
        const lines = inv.lines?.data ?? [];
        const description =
          lines
            .map((l) => l.description)
            .filter(Boolean)
            .join(', ') || 'Subscription';
        return {
          id: inv.id,
          number: inv.number ?? null,
          date: new Date(inv.created * 1000).toISOString(),
          amount: (inv.amount_due ?? inv.total ?? 0) / 100,
          currency: (inv.currency || 'eur').toUpperCase(),
          status: inv.status ?? 'open',
          description,
          hostedUrl: inv.hosted_invoice_url ?? null,
          pdfUrl: inv.invoice_pdf ?? null,
        };
      });
  } catch (err) {
    console.error('listFleetInvoices failed:', err);
    return [];
  }
}

/** True when the fleet already has a Stripe customer (so the portal can open). */
export async function hasBillingAccount(orgId: string): Promise<boolean> {
  if (!isStripeEnabled()) return false;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single();
  return !!org?.stripe_customer_id;
}
