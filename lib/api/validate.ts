// =============================================================================
// PUBLIC API — INPUT VALIDATION & PAGINATION
// =============================================================================
// Every write endpoint builds its database payload field-by-field through these
// helpers. Nothing from a request body is ever spread into an insert or update:
// an allow-list is the difference between "update this driver's phone number"
// and "update this driver's organization_id".
// =============================================================================

import { apiError } from './respond';

export class FieldErrors {
  private readonly errors: Record<string, string> = {};

  add(field: string, message: string): void {
    if (!this.errors[field]) this.errors[field] = message;
  }

  get any(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /** 422 with a per-field breakdown, so an integrator can fix it in one pass. */
  response(): Response {
    return apiError('validation_failed', 'One or more fields are invalid.', {
      details: { fields: this.errors },
    });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** A trimmed, length-checked string. `undefined` means "not supplied". */
export function optString(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
  opts: { max?: number; nullable?: boolean } = {},
): string | null | undefined {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (raw === null || raw === '') {
    if (opts.nullable === false) {
      errs.add(field, 'must not be empty');
      return undefined;
    }
    return null;
  }
  if (typeof raw !== 'string') {
    errs.add(field, 'must be a string');
    return undefined;
  }
  const value = raw.trim();
  if (value.length > (opts.max ?? 500)) {
    errs.add(field, `must be ${opts.max ?? 500} characters or fewer`);
    return undefined;
  }
  return value;
}

export function requiredString(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
  max = 200,
): string | undefined {
  const raw = body[field];
  if (typeof raw !== 'string' || !raw.trim()) {
    errs.add(field, 'is required');
    return undefined;
  }
  const value = raw.trim();
  if (value.length > max) {
    errs.add(field, `must be ${max} characters or fewer`);
    return undefined;
  }
  return value;
}

/** ISO calendar date (YYYY-MM-DD) — the format every date column here uses. */
export function optDate(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
    errs.add(field, 'must be a date in YYYY-MM-DD format');
    return undefined;
  }
  return raw;
}

export function optNumber(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number | null | undefined {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (raw === null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    errs.add(field, 'must be a number');
    return undefined;
  }
  if (opts.integer && !Number.isInteger(value)) {
    errs.add(field, 'must be a whole number');
    return undefined;
  }
  if (opts.min !== undefined && value < opts.min) {
    errs.add(field, `must be ${opts.min} or more`);
    return undefined;
  }
  if (opts.max !== undefined && value > opts.max) {
    errs.add(field, `must be ${opts.max} or less`);
    return undefined;
  }
  return value;
}

export function optEnum<T extends string>(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  opts: { nullable?: boolean } = {},
): T | null | undefined {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (raw === null || raw === '') {
    if (opts.nullable) return null;
    errs.add(field, `must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    errs.add(field, `must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return raw as T;
}

/** A UUID that must belong to this fleet — the caller verifies ownership. */
export function optUuid(
  errs: FieldErrors,
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  if (!(field in body)) return undefined;
  const raw = body[field];
  if (raw === null || raw === '') return null;
  if (!isUuid(raw)) {
    errs.add(field, 'must be a UUID');
    return undefined;
  }
  return raw;
}

/** Rejects any body key the endpoint does not understand, so typos surface. */
export function rejectUnknownFields(
  errs: FieldErrors,
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errs.add(key, 'is not a field on this resource');
  }
}

// ── Pagination ──────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface Pagination {
  limit: number;
  offset: number;
}

/** `?limit=` / `?offset=`, clamped so no caller can ask for the whole table. */
export function readPagination(url: URL): Pagination {
  const rawLimit = Number(url.searchParams.get('limit'));
  const rawOffset = Number(url.searchParams.get('offset'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

export function pageMeta(page: Pagination, total: number | null): Record<string, unknown> {
  const count = total ?? 0;
  return {
    limit: page.limit,
    offset: page.offset,
    total: count,
    has_more: page.offset + page.limit < count,
  };
}

/**
 * Makes a user-supplied search term safe to drop into a PostgREST `or=(…)`
 * filter.
 *
 * PostgREST's filter grammar uses `,` to separate conditions, `()` to group
 * them and `"` to quote values, and it does NOT honour backslash escaping
 * inside an unquoted value — so those characters are STRIPPED rather than
 * escaped. `%` and `_` go too: they are ILIKE wildcards, and a term full of
 * them is a table scan dressed up as a search.
 *
 * The result is lossy for punctuation-heavy searches, which is the right
 * trade: a search box must never be able to rewrite the query around it.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,()"'\\%_*:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}
