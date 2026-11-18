// =============================================================================
// XERO — the "state" that ties a sign-in at Xero back to who started it
// =============================================================================
// Before sending an admin to Xero we put a random value in the URL (Xero hands
// it back) and the same value, with who and which fleet, in an encrypted,
// http-only cookie. The callback only proceeds when the two match and the
// signed-in person is still that admin of that fleet — so a link crafted by
// someone else can never attach THEIR Xero organisation to YOUR fleet.
// =============================================================================

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openSecret, sealSecret } from '@/lib/crypto/secret-box';

export const XERO_STATE_COOKIE = 'rovora_xero_oauth';
export const XERO_STATE_MAX_AGE = 600; // seconds

interface StatePayload {
  state: string;
  org: string;
  user: string;
  exp: number;
}

export function newOauthState(orgId: string, userId: string): { state: string; cookie: string } {
  const state = randomBytes(24).toString('base64url');
  const payload: StatePayload = { state, org: orgId, user: userId, exp: Date.now() + XERO_STATE_MAX_AGE * 1000 };
  return { state, cookie: sealSecret(JSON.stringify(payload)) };
}

/** The org and user a callback belongs to, or null if the state is missing, forged or expired. */
export function readOauthState(cookie: string | undefined, stateParam: string | null): { org: string; user: string } | null {
  if (!cookie || !stateParam) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(openSecret(cookie)) as StatePayload;
  } catch {
    return null;
  }
  if (!payload?.state || !payload.org || !payload.user || typeof payload.exp !== 'number') return null;
  if (Date.now() > payload.exp) return null;
  const a = Buffer.from(payload.state);
  const b = Buffer.from(stateParam);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { org: payload.org, user: payload.user };
}
