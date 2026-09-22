// =============================================================================
// PUBLIC API — RESPONSE ENVELOPE
// =============================================================================
// Every v1 response has the same shape so a client can write ONE error handler:
//
//   success  { "data": …, "meta": { … } }
//   failure  { "error": { "code": "…", "message": "…", "details": … } }
//
// `code` is a stable machine-readable string. `message` is for humans and may
// be reworded at any time — clients must branch on `code`, and the docs say so.
// =============================================================================

import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'unauthorized'
  | 'invalid_key'
  | 'key_expired'
  | 'key_revoked'
  | 'ip_not_allowed'
  | 'forbidden'
  | 'insufficient_scope'
  | 'plan_upgrade_required'
  | 'plan_limit'
  | 'module_disabled'
  | 'account_suspended'
  | 'not_found'
  | 'method_not_allowed'
  | 'validation_failed'
  | 'invalid_json'
  | 'payload_too_large'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error';

/** HTTP status that goes with each failure code. */
const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_key: 401,
  key_expired: 401,
  key_revoked: 401,
  ip_not_allowed: 403,
  forbidden: 403,
  insufficient_scope: 403,
  plan_upgrade_required: 403,
  module_disabled: 403,
  account_suspended: 403,
  plan_limit: 402,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  validation_failed: 422,
  invalid_json: 400,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
};

export interface ApiMeta {
  [key: string]: unknown;
}

/** Headers applied to every v1 response. */
function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    // Fleet data is per-key and must never be held by a shared cache.
    'Cache-Control': 'no-store, private',
    // The API is server-to-server: there is no browser origin we want to grant.
    // Sending no CORS headers means a browser page cannot read a response, which
    // is the point — an API key does not belong in front-end code.
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

export function apiSuccess<T>(
  data: T,
  init?: { status?: number; meta?: ApiMeta; headers?: Record<string, string> },
): NextResponse {
  const body: Record<string, unknown> = { data };
  if (init?.meta) body.meta = init.meta;
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: baseHeaders(init?.headers),
  });
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  init?: { details?: unknown; status?: number; headers?: Record<string, string> },
): NextResponse {
  const error: Record<string, unknown> = { code, message };
  if (init?.details !== undefined) error.details = init.details;
  return NextResponse.json(
    { error },
    { status: init?.status ?? STATUS[code], headers: baseHeaders(init?.headers) },
  );
}

/** Standard 204 for a successful DELETE. */
export function apiNoContent(headers?: Record<string, string>): NextResponse {
  return new NextResponse(null, { status: 204, headers: baseHeaders(headers) });
}
