// =============================================================================
// STRIPE DASHBOARD LINKS (server-only)
// =============================================================================
// Builds deep-links into the Stripe dashboard for the PLATFORM admin (Frank), so
// he can jump straight from an operator to that customer's real invoices, payment
// methods and subscription in Stripe. Test-vs-live is inferred from the secret
// key prefix so the link lands in the right mode. Reads env → call server-side.
// =============================================================================

/** True when the configured Stripe secret key is a live-mode key. */
function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live');
}

/**
 * Dashboard URL for a Stripe customer (their invoices, payments, subscription),
 * or null when the operator has no Stripe customer yet (e.g. admin-created or
 * still on trial). Lands in test mode automatically when using test keys.
 */
export function stripeCustomerUrl(customerId: string | null | undefined): string | null {
  if (!customerId) return null;
  const modePrefix = isLiveMode() ? '' : 'test/';
  return `https://dashboard.stripe.com/${modePrefix}customers/${customerId}`;
}
