// =============================================================================
// PUBLIC API — FAILED-AUTH THROTTLE (per caller IP, in-process)
// =============================================================================
// The per-key rate limiter in Postgres can only start counting once a VALID key
// has been found. That leaves a gap: a caller sending garbage credentials is
// rejected, but each attempt still costs a database lookup, so an attacker (or
// a broken script in a retry loop) could hammer the database for free.
//
// This closes it. Failures are counted per source IP in memory and, past a
// threshold, the IP is refused with 429 BEFORE any database work happens.
//
// Why in memory and not Postgres: the whole point is to answer without touching
// the database, and Rovora runs as a single container. A restart clears the
// counters, which is an acceptable trade — this is a noise and load control,
// not the thing that keeps keys safe. Guessing a key is already impossible:
// they are 256 bits of CSPRNG output, so there is nothing to brute-force.
// =============================================================================

/** Failures allowed from one IP before it is refused outright. */
const MAX_FAILURES = 20;

/** How long the counter (and any block) lasts. */
const WINDOW_MS = 5 * 60 * 1000;

/** Safety valve so a spoofed-header flood can't grow the map without bound. */
const MAX_TRACKED_IPS = 10_000;

interface Entry {
  count: number;
  /** When this entry's window ends. */
  expires: number;
}

const failures = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [ip, entry] of failures) {
    if (entry.expires <= now) failures.delete(ip);
  }
}

/**
 * Is this IP currently blocked? Returns the seconds left when it is, or null
 * when the request may proceed. Call this FIRST, before any database work.
 */
export function authThrottleStatus(ip: string | null): number | null {
  if (!ip) return null;
  const entry = failures.get(ip);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expires <= now) {
    failures.delete(ip);
    return null;
  }
  if (entry.count < MAX_FAILURES) return null;

  return Math.max(1, Math.ceil((entry.expires - now) / 1000));
}

/** Record one authentication failure for this IP. */
export function recordAuthFailure(ip: string | null): void {
  if (!ip) return;
  const now = Date.now();

  // Sweep before growing, so expired entries are reclaimed under pressure
  // rather than the map being capped while full of dead rows.
  if (failures.size >= MAX_TRACKED_IPS) {
    sweep(now);
    if (failures.size >= MAX_TRACKED_IPS) return;
  }

  const entry = failures.get(ip);
  if (!entry || entry.expires <= now) {
    failures.set(ip, { count: 1, expires: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/** A successful authentication clears the IP's failure count. */
export function clearAuthFailures(ip: string | null): void {
  if (ip) failures.delete(ip);
}
