// =============================================================================
// PUBLIC API — SCOPES (client-safe: no server imports)
// =============================================================================
// A key can only do what its scopes allow. Read and write are separate on
// purpose: the common integration is a read-only mirror into a BI tool or an
// accountant's system, and that key should be useless to anyone who steals it.
//
// Scope strings are stored verbatim in api_keys.scopes and are part of the
// public contract — never rename one, only add.
// =============================================================================

export const API_SCOPES = [
  'drivers:read',
  'drivers:write',
  'vehicles:read',
  'vehicles:write',
  'financials:read',
  'financials:write',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ScopeGroup {
  /** Resource label shown in the key-creation UI and the docs. */
  resource: string;
  read: ApiScope;
  write: ApiScope;
  /** What this resource covers, in plain English. */
  blurb: string;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  {
    resource: 'Drivers',
    read: 'drivers:read',
    write: 'drivers:write',
    blurb: 'Driver records, contact details, licence and document expiry dates, vehicle assignment.',
  },
  {
    resource: 'Vehicles',
    read: 'vehicles:read',
    write: 'vehicles:write',
    blurb: 'Vehicle records, registration, make and model, mileage, insurance and road-licence expiry.',
  },
  {
    resource: 'Financials',
    read: 'financials:read',
    write: 'financials:write',
    blurb: 'The bookkeeping ledger: income and expense transactions, categories and period totals.',
  },
];

/** Narrowing guard for untrusted input (request bodies, form posts). */
export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === 'string' && (API_SCOPES as readonly string[]).includes(value);
}

/** Keeps only valid, de-duplicated scopes. Unknown values are dropped. */
export function sanitizeScopes(values: unknown): ApiScope[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<ApiScope>();
  for (const v of values) if (isApiScope(v)) seen.add(v);
  return API_SCOPES.filter((s) => seen.has(s));
}

/** `drivers:write` implies `drivers:read` — writing blind would be unusable. */
export function grants(held: readonly string[], required: ApiScope): boolean {
  if (held.includes(required)) return true;
  if (required.endsWith(':read')) {
    return held.includes(required.replace(/:read$/, ':write'));
  }
  return false;
}
