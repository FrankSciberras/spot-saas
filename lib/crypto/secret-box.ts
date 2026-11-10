// =============================================================================
// SECRET BOX — encrypts third-party credentials before they reach the database
// =============================================================================
// Fleets hand us secrets that belong to OTHER services (their Bolt API key
// secret, later Uber / Xero tokens). Unlike our own API keys we cannot store
// just a hash — we have to present the secret back to the other service — so it
// is encrypted with AES-256-GCM and only ever decrypted in server memory, at
// the moment of the outbound call.
//
// Key: INTEGRATIONS_SECRET_KEY when set (any long random string). When it is
// not set we derive the key from SUPABASE_SERVICE_ROLE_KEY, so the feature
// works with zero extra setup — the service-role key is already the secret
// that guards the whole database. Changing whichever value is in use makes
// stored secrets unreadable; affected fleets simply reconnect.
//
// SERVER ONLY. Never import this from a client component.
// =============================================================================

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function encryptionKey(): Buffer {
  const material = process.env.INTEGRATIONS_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) {
    throw new Error('No encryption key available (set INTEGRATIONS_SECRET_KEY).');
  }
  return Buffer.from(hkdfSync('sha256', material, 'rovora-integrations', 'secret-box-v1', 32));
}

/** Encrypts a secret for storage. Output is safe to keep in a text column. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/**
 * Decrypts a value produced by sealSecret. Throws if the value was tampered
 * with or the encryption key has changed since it was stored.
 */
export function openSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Stored secret is not in a recognised format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
