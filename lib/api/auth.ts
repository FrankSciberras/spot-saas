// =============================================================================
// PUBLIC API — AUTHENTICATION, RATE LIMITING & LOGGING (server only)
// =============================================================================
// `withApiAuth(scope, handler)` is the single front door for every /api/v1
// route. Nothing in v1 talks to the database until this has run, and it fails
// closed at every step:
//
//   1. Bearer token present and well-formed            → else 401
//   2. SHA-256 lookup finds a LIVE key                 → else 401
//   3. Key not revoked, not expired                    → else 401
//   4. Caller IP on the key's allow-list (if set)      → else 403
//   5. Fleet active + on a package that includes API   → else 403
//   6. Rate limit consumed atomically in Postgres      → else 429
//   7. Key holds the scope this endpoint needs         → else 403
//
// Only then does the handler run, and it receives a context whose
// `organizationId` came from the KEY ROW — never from the request. Handlers
// filter every query by it explicitly, so a key can only ever see its own
// fleet even though the queries run with the service role.
// =============================================================================

import { after, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { extractApiKey, hashApiKey, hashesMatch, looksLikeApiKey } from './keys';
import { getApiEntitlement } from './entitlements';
import { grants, type ApiScope } from './scopes';
import { apiError, type ApiErrorCode } from './respond';
import { authThrottleStatus, clearAuthFailures, recordAuthFailure } from './throttle';

/** Largest request body v1 accepts. Generous for a record, tiny for an attack. */
export const MAX_BODY_BYTES = 256 * 1024;

export interface ApiContext {
  /** api_keys.id — the credential that made this call. */
  keyId: string;
  /** The ONLY tenant this request may touch. Comes from the key, not the URL. */
  organizationId: string;
  scopes: string[];
  planKey: string;
  planName: string;
  /** Correlation id echoed in X-Request-Id and stored on the log line. */
  requestId: string;
  ip: string | null;
  /** Rate-limit headers to merge into whatever the handler returns. */
  rateHeaders: Record<string, string>;
}

interface KeyRow {
  id: string;
  organization_id: string;
  key_hash: string;
  scopes: string[] | null;
  allowed_ips: string[] | null;
  rate_limit_per_min: number | null;
  rate_limit_per_day: number | null;
  expires_at: string | null;
  revoked_at: string | null;
}

/**
 * Caller IP. Behind Coolify/Traefik the real address is the FIRST entry of
 * X-Forwarded-For; everything after it is proxy chain. Used for the per-key
 * allow-list and the request log only — never for authentication on its own.
 */
function callerIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}

/**
 * Was this request actually delivered over HTTPS?
 *
 * Coolify/Traefik terminates TLS and forwards over plain HTTP inside the box,
 * so the request URL says `http:` even for a perfectly secure call — the proxy
 * records the real scheme in `x-forwarded-proto`. An API key travels in a
 * header in clear text, so a genuinely plaintext request has already leaked the
 * credential and must be refused (and the key rotated).
 *
 * Only enforced in production: local development has no TLS and no real keys.
 */
function isSecureRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const proto = req.headers.get('x-forwarded-proto');
  // Take the FIRST hop: a chain like "https,http" still reached us securely
  // from the client, which is the hop that matters for the credential.
  if (proto) return proto.split(',')[0].trim().toLowerCase() === 'https';
  return new URL(req.url).protocol === 'https:';
}

/** Lower of two ceilings, treating null as "no ceiling". */
function tighter(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

interface LogLine {
  organizationId: string | null;
  keyId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  userAgent: string | null;
  errorCode: string | null;
}

/**
 * Write one audit line. Deliberately body-free: a leak of this table exposes
 * traffic shape, never fleet data. Runs after the response is flushed so it
 * costs the caller nothing.
 */
function logRequest(line: LogLine): void {
  after(async () => {
    try {
      const admin = createAdminClient();
      await admin.from('api_request_logs').insert({
        organization_id: line.organizationId,
        key_id: line.keyId,
        method: line.method,
        path: line.path,
        status: line.status,
        duration_ms: line.durationMs,
        ip: line.ip,
        user_agent: line.userAgent?.slice(0, 255) ?? null,
        error_code: line.errorCode,
      });
    } catch {
      // Logging must never break a working request.
    }
  });
}

/** Bump the key's "last seen" counters once the response is out the door. */
function touchKey(keyId: string, ip: string | null): void {
  after(async () => {
    try {
      const admin = createAdminClient();
      // Read-modify-write on a counter nobody reads transactionally; an
      // occasional lost increment under concurrency is acceptable here and
      // avoids a lock on the auth hot path.
      const { data } = await admin
        .from('api_keys')
        .select('request_count')
        .eq('id', keyId)
        .maybeSingle();
      await admin
        .from('api_keys')
        .update({
          last_used_at: new Date().toISOString(),
          last_used_ip: ip,
          request_count: Number(data?.request_count ?? 0) + 1,
        })
        .eq('id', keyId);
    } catch {
      /* best effort */
    }
  });
}

type Handler<P> = (
  req: NextRequest,
  ctx: ApiContext,
  routeCtx: P,
) => Promise<Response> | Response;

/**
 * Wraps a v1 route handler with authentication, plan gating, rate limiting,
 * scope enforcement and request logging.
 */
export function withApiAuth<P = unknown>(scope: ApiScope | null, handler: Handler<P>) {
  return async (req: NextRequest, routeCtx: P): Promise<Response> => {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    const ip = callerIp(req);
    const path = new URL(req.url).pathname;
    const method = req.method;
    const userAgent = req.headers.get('user-agent');

    const fail = (
      code: ApiErrorCode,
      message: string,
      extra?: { organizationId?: string | null; keyId?: string | null; headers?: Record<string, string>; details?: unknown },
    ): Response => {
      const res = apiError(code, message, {
        details: extra?.details,
        headers: { 'X-Request-Id': requestId, ...(extra?.headers ?? {}) },
      });
      logRequest({
        organizationId: extra?.organizationId ?? null,
        keyId: extra?.keyId ?? null,
        method,
        path,
        status: res.status,
        durationMs: Date.now() - started,
        ip,
        userAgent,
        errorCode: code,
      });
      return res;
    };

    try {
      // ── 0. HTTPS only ────────────────────────────────────────────────────
      // Checked before anything else: if the key arrived in the clear there is
      // nothing worth doing with the request except telling the caller.
      if (!isSecureRequest(req)) {
        return fail(
          'forbidden',
          'The Rovora API is HTTPS only. This request arrived over plain HTTP, so treat the key you sent as compromised: revoke it in Rovora and create a new one.',
        );
      }

      // ── 0b. Has this IP been failing repeatedly? ─────────────────────────
      // Answered from memory, before any database work, so a flood of bad
      // credentials cannot be used to hammer the database.
      const blockedFor = authThrottleStatus(ip);
      if (blockedFor !== null) {
        return fail('rate_limited', 'Too many failed authentication attempts. Try again shortly.', {
          headers: { 'Retry-After': String(blockedFor) },
        });
      }

      // ── 1. Credential present ────────────────────────────────────────────
      const secret = extractApiKey(req.headers);
      if (!secret) {
        recordAuthFailure(ip);
        return fail('unauthorized', 'Missing API key. Send it as "Authorization: Bearer <key>".', {
          headers: { 'WWW-Authenticate': 'Bearer realm="Rovora API"' },
        });
      }
      if (!looksLikeApiKey(secret)) {
        // Wrong shape can never match a real key — reject without a query.
        recordAuthFailure(ip);
        return fail('invalid_key', 'That API key is not valid.');
      }

      // ── 2. Look the key up by hash ───────────────────────────────────────
      const admin = createAdminClient();
      const presentedHash = hashApiKey(secret);
      const { data: keyData, error: keyErr } = await admin
        .from('api_keys')
        .select('id, organization_id, key_hash, scopes, allowed_ips, rate_limit_per_min, rate_limit_per_day, expires_at, revoked_at')
        .eq('key_hash', presentedHash)
        .maybeSingle();

      if (keyErr) {
        console.error('[api/v1] key lookup failed:', keyErr);
        return fail('internal_error', 'Could not verify the API key. Try again.');
      }

      const key = keyData as KeyRow | null;
      if (!key || !hashesMatch(key.key_hash, presentedHash)) {
        recordAuthFailure(ip);
        return fail('invalid_key', 'That API key is not valid.');
      }

      // A real key was presented — this IP is not guessing.
      clearAuthFailures(ip);

      // ── 3. Still live? ───────────────────────────────────────────────────
      if (key.revoked_at) {
        return fail('key_revoked', 'This API key has been revoked.', {
          organizationId: key.organization_id,
          keyId: key.id,
        });
      }
      if (key.expires_at && new Date(key.expires_at) <= new Date()) {
        return fail('key_expired', 'This API key has expired. Create a new one in Rovora.', {
          organizationId: key.organization_id,
          keyId: key.id,
        });
      }

      // ── 4. IP allow-list ─────────────────────────────────────────────────
      const allowed = key.allowed_ips ?? [];
      if (allowed.length > 0 && (!ip || !allowed.includes(ip))) {
        return fail('ip_not_allowed', 'This API key may not be used from this IP address.', {
          organizationId: key.organization_id,
          keyId: key.id,
        });
      }

      // ── 5. Plan entitlement ──────────────────────────────────────────────
      const ent = await getApiEntitlement(key.organization_id);
      if (!ent.enabled) {
        const message =
          ent.reason === 'account_suspended'
            ? 'This Rovora account is not active. Contact support.'
            : ent.reason === 'trial_expired'
              ? 'Your free period has ended. Choose a plan to keep using the API.'
              : `The API is not included in your ${ent.planName} plan.${ent.lowestApiPlanName ? ` Upgrade to ${ent.lowestApiPlanName} or higher to enable it.` : ''}`;
        return fail(
          ent.reason === 'account_suspended' ? 'account_suspended' : 'plan_upgrade_required',
          message,
          { organizationId: key.organization_id, keyId: key.id },
        );
      }

      // ── 6. Rate limit (atomic, in Postgres) ──────────────────────────────
      // Per-key ceilings can only make a key STRICTER than its plan.
      const perMinute = tighter(ent.perMinute, key.rate_limit_per_min);
      const perDay = tighter(ent.perDay, key.rate_limit_per_day);

      const { data: rlData, error: rlErr } = await admin.rpc('api_rate_limit_consume', {
        p_key_id: key.id,
        p_minute_limit: perMinute,
        p_day_limit: perDay,
      });

      if (rlErr) {
        console.error('[api/v1] rate limiter failed:', rlErr);
        return fail('internal_error', 'Could not apply the rate limit. Try again.', {
          organizationId: key.organization_id,
          keyId: key.id,
        });
      }

      const rl = (Array.isArray(rlData) ? rlData[0] : rlData) as
        | {
            allowed: boolean;
            minute_count: number;
            day_count: number;
            minute_reset: string;
            day_reset: string;
          }
        | undefined;

      const minuteReset = rl ? Math.ceil(new Date(rl.minute_reset).getTime() / 1000) : 0;
      const dayReset = rl ? Math.ceil(new Date(rl.day_reset).getTime() / 1000) : 0;
      const rateHeaders: Record<string, string> = {
        'X-RateLimit-Limit': perMinute === null ? 'unlimited' : String(perMinute),
        'X-RateLimit-Remaining':
          perMinute === null ? 'unlimited' : String(Math.max(0, perMinute - (rl?.minute_count ?? 0))),
        'X-RateLimit-Reset': String(minuteReset),
        'X-RateLimit-Limit-Day': perDay === null ? 'unlimited' : String(perDay),
        'X-RateLimit-Remaining-Day':
          perDay === null ? 'unlimited' : String(Math.max(0, perDay - (rl?.day_count ?? 0))),
        'X-RateLimit-Reset-Day': String(dayReset),
      };

      if (rl && !rl.allowed) {
        const dayExceeded = perDay !== null && rl.day_count > perDay;
        const retryAfter = Math.max(
          1,
          (dayExceeded ? dayReset : minuteReset) - Math.floor(Date.now() / 1000),
        );
        touchKey(key.id, ip);
        return fail(
          'rate_limited',
          dayExceeded
            ? `Daily limit of ${perDay} requests reached. It resets at midnight UTC.`
            : `Rate limit of ${perMinute} requests per minute exceeded. Slow down and retry.`,
          {
            organizationId: key.organization_id,
            keyId: key.id,
            headers: { ...rateHeaders, 'Retry-After': String(retryAfter) },
          },
        );
      }

      // ── 7. Scope ─────────────────────────────────────────────────────────
      const held = key.scopes ?? [];
      // `scope: null` is used only by /v1/me, which reports what a key CAN do
      // and so must be callable by any live key.
      if (scope !== null && !grants(held, scope)) {
        touchKey(key.id, ip);
        return fail('insufficient_scope', `This API key is missing the "${scope}" scope.`, {
          organizationId: key.organization_id,
          keyId: key.id,
          headers: rateHeaders,
          details: { required: scope, granted: held },
        });
      }

      // ── Run the endpoint ─────────────────────────────────────────────────
      const ctx: ApiContext = {
        keyId: key.id,
        organizationId: key.organization_id,
        scopes: held,
        planKey: ent.planKey,
        planName: ent.planName,
        requestId,
        ip,
        rateHeaders,
      };

      const res = await handler(req, ctx, routeCtx);

      // Merge the rate-limit + correlation headers onto whatever came back.
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(rateHeaders)) headers.set(k, v);
      headers.set('X-Request-Id', requestId);

      logRequest({
        organizationId: key.organization_id,
        keyId: key.id,
        method,
        path,
        status: res.status,
        durationMs: Date.now() - started,
        ip,
        userAgent,
        errorCode: res.status >= 400 ? 'handler_error' : null,
      });
      touchKey(key.id, ip);

      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      console.error('[api/v1] unhandled error:', err);
      return fail('internal_error', 'Something went wrong on our side. Try again.');
    }
  };
}

/**
 * Reads at most `max` bytes of the request body, aborting the stream the moment
 * it goes over. Returns null when the limit is breached.
 *
 * Content-Length is NOT trusted for this: it is caller-supplied, and a chunked
 * request need not send one at all. Buffering first and measuring afterwards
 * would mean a single request could put a gigabyte in the server's memory
 * before we noticed — so the cap is applied while reading, not after.
 */
async function readCappedBody(req: NextRequest, max: number): Promise<string | null> {
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

/**
 * Parses and size-checks a JSON request body. Returns either the parsed value
 * or a ready-to-send error response — callers do `if ('response' in r) return r.response`.
 */
export async function readJsonBody(
  req: NextRequest,
): Promise<{ value: Record<string, unknown> } | { response: Response }> {
  const tooLarge = apiError(
    'payload_too_large',
    `Request body must be under ${MAX_BODY_BYTES / 1024} KB.`,
  );

  // Cheap pre-check on the declared size, so an honest oversized upload is
  // refused without streaming it at all.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response: tooLarge };
  }

  let raw: string | null;
  try {
    raw = await readCappedBody(req, MAX_BODY_BYTES);
  } catch {
    return { response: apiError('invalid_json', 'Could not read the request body.') };
  }

  if (raw === null) return { response: tooLarge };
  if (!raw.trim()) {
    return { response: apiError('invalid_json', 'A JSON request body is required.') };
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { response: apiError('invalid_json', 'The request body must be a JSON object.') };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { response: apiError('invalid_json', 'The request body is not valid JSON.') };
  }
}
