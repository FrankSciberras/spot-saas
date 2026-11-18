// =============================================================================
// EMAIL UNSUBSCRIBE — signed opt-out links for marketing email (server only)
// =============================================================================
// Every campaign email carries a personal unsubscribe link, plus RFC 8058
// one-click headers (List-Unsubscribe / List-Unsubscribe-Post) so Gmail and
// Yahoo show their own "Unsubscribe" button — both now require it for bulk
// senders, and EU rules require an easy opt-out on marketing mail.
//
// A link is /unsubscribe?u=<base64url email>&t=<HMAC of that email>. The HMAC
// means nobody can unsubscribe someone else by guessing a URL, and no database
// row is needed to issue one.
//
// Key: EMAIL_UNSUBSCRIBE_SECRET when set; otherwise derived from the same
// material as lib/crypto/secret-box (INTEGRATIONS_SECRET_KEY, then
// SUPABASE_SERVICE_ROLE_KEY) under a different label, so it works with zero
// setup. Rotating it invalidates links in emails already sent.
//
// SERVER ONLY. Never import this from a client component.
// =============================================================================

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/urls';
import { isValidEmail } from '@/lib/email/campaign-shared';

function signingKey(): Buffer {
  const material =
    process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.INTEGRATIONS_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) throw new Error('No unsubscribe signing key available (set EMAIL_UNSUBSCRIBE_SECRET).');
  return Buffer.from(hkdfSync('sha256', material, 'rovora-email', 'unsubscribe-v1', 32));
}

const normalise = (email: string) => email.trim().toLowerCase();

function tokenFor(email: string): string {
  return createHmac('sha256', signingKey()).update(normalise(email)).digest('base64url').slice(0, 32);
}

/** Query string identifying + authorising one address: `u=…&t=…`. */
function query(email: string): string {
  const e = normalise(email);
  return `u=${Buffer.from(e, 'utf8').toString('base64url')}&t=${tokenFor(e)}`;
}

/**
 * Links for one recipient:
 *  - `page`     the human page (shown in the email footer) with a confirm button
 *  - `oneClick` the RFC 8058 endpoint mail clients POST to
 */
export function unsubscribeLinks(email: string): { page: string; oneClick: string } {
  const q = query(email);
  const base = appUrl();
  return { page: `${base}/unsubscribe?${q}`, oneClick: `${base}/api/email/unsubscribe?${q}` };
}

/** Headers that make Gmail / Yahoo / Apple Mail show a native unsubscribe button. */
export function unsubscribeHeaders(email: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeLinks(email).oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Returns the address a `u`/`t` pair authorises, or null if it's forged or malformed. */
export function verifyUnsubscribe(u: string | null | undefined, t: string | null | undefined): string | null {
  if (!u || !t || u.length > 400 || t.length > 64) return null;
  let email: string;
  try {
    email = normalise(Buffer.from(u, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isValidEmail(email)) return null;
  const expected = Buffer.from(tokenFor(email));
  const given = Buffer.from(t);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return email;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function isUnsubscribed(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from('email_unsubscribes').select('email').eq('email', normalise(email)).maybeSingle();
  return Boolean(data);
}

/** Record an opt-out. Idempotent: unsubscribing twice keeps the first record. */
export async function recordUnsubscribe(email: string, source: 'link' | 'one_click' | 'admin'): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('email_unsubscribes')
    .upsert({ email: normalise(email), source }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) console.error('[email] recording unsubscribe failed:', error);
  return !error;
}

/** Undo an opt-out ("I clicked that by mistake"). */
export async function removeUnsubscribe(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from('email_unsubscribes').delete().eq('email', normalise(email));
  if (error) console.error('[email] removing unsubscribe failed:', error);
  return !error;
}
