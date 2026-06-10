// =============================================================================
// STRIPE CLIENT (server only)
// =============================================================================
// A lazily-created Stripe SDK singleton plus a couple of env helpers. Importing
// this pulls in the secret key, so it must NEVER reach a client bundle — only
// use it from server actions and route handlers.
//
// Billing is OPTIONAL: if STRIPE_SECRET_KEY isn't set (e.g. local dev before the
// account exists) `isStripeEnabled()` returns false and callers fall back to the
// old stub activation, so the app keeps working without Stripe configured.
// =============================================================================

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/** True once the Stripe secret key is configured. */
export function isStripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * The shared Stripe client. Throws if called when Stripe isn't configured —
 * guard with isStripeEnabled() first where a fallback path exists.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set — Stripe is not configured.');
  }
  if (!_stripe) {
    // Pin nothing explicitly: use the SDK's bundled API version so the typed
    // surface and the wire version always match.
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** Absolute base URL for building Checkout/Portal return links. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000'
  );
}
