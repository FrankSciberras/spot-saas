// =============================================================================
// PUBLIC API — SECRET GENERATION & HASHING (server only)
// =============================================================================
// A Rovora API key looks like:
//
//     rvk_live_7f2a9c31d4e8b60a5c1f93ab27de4051f6c8b3a9e2d7401c5b8f6a3d9e0c2b14
//     └──┬──┘ └──────────────────────────────┬──────────────────────────────┘
//      prefix                     64 hex chars = 32 random bytes
//
// Only the SHA-256 of the whole string is stored. The secret is shown exactly
// once, when it is created, and cannot be recovered afterwards — if it is lost
// the operator revokes it and makes a new one.
//
// Why plain SHA-256 and not bcrypt/argon2: the secret is 256 bits of CSPRNG
// output, not a human password, so there is nothing to brute-force and no
// dictionary to run. What we DO need is a single indexed lookup on every
// request, which a deterministic hash gives us and a salted KDF does not.
// =============================================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Environment marker in the key. Kept in the string so a test key is obvious. */
const KEY_ENV = process.env.NODE_ENV === 'production' ? 'live' : 'test';

/** How much of the key is stored in clear so operators can tell keys apart. */
const PREFIX_LENGTH = 16;

export interface GeneratedKey {
  /** The full secret. Show once, never store. */
  secret: string;
  /** Stored in clear, e.g. 'rvk_live_7f2a9c31'. */
  prefix: string;
  /** Stored instead of the secret. */
  hash: string;
}

export function generateApiKey(): GeneratedKey {
  const secret = `rvk_${KEY_ENV}_${randomBytes(32).toString('hex')}`;
  return {
    secret,
    prefix: secret.slice(0, PREFIX_LENGTH),
    hash: hashApiKey(secret),
  };
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Pulls the bearer token out of a request. Accepts the standard
 * `Authorization: Bearer <key>` header, and `X-API-Key: <key>` as a fallback
 * for clients (and no-code tools) that cannot set Authorization.
 */
export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const alt = headers.get('x-api-key');
  return alt ? alt.trim() : null;
}

/** Cheap shape check before we hit the database, so junk never costs a query. */
export function looksLikeApiKey(secret: string): boolean {
  return /^rvk_(live|test)_[0-9a-f]{64}$/.test(secret);
}

/**
 * Constant-time equality for two hex hashes. The lookup is by indexed hash so
 * an attacker cannot time their way to a key, but the re-check after the read
 * costs nothing and keeps the comparison honest.
 */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
