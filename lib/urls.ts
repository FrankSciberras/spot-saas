// =============================================================================
// OUTBOUND URLS — the absolute origin for links that leave the app
// =============================================================================
// Emails, Stripe return URLs and push notifications all need a full origin: a
// relative path is meaningless once it's in someone's inbox.
//
// Every call site used to inline `process.env.NEXT_PUBLIC_APP_URL || ...` with
// its own fallback — half of them `'http://localhost:3000'`, half `''`. Both
// fail badly in production: a missing build variable baked localhost into
// password-reset links (unrecoverable for the recipient, and it silently
// "worked"), while `''` produced dead relative links in emails. Resolve it in
// one place instead, and never fall back to localhost outside development.
// =============================================================================

import { SITE_URL } from '@/lib/seo';

/**
 * Absolute origin for links we send out, with no trailing slash.
 *
 * `NEXT_PUBLIC_APP_URL` wins when set (that's how staging and local dev point
 * elsewhere). Otherwise: the real production origin, unless we know we're in
 * development. Localhost is never a production fallback.
 */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000';
  return SITE_URL;
}

/**
 * Origin for assets embedded in emails (logo, images).
 *
 * Always production: an inbox can't load `http://localhost:3000/logo-full.png`,
 * so dev and staging mail should still point at the live, publicly reachable
 * copy rather than shipping a broken image.
 */
export function assetUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
