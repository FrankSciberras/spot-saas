// =============================================================================
// PUBLIC API — LEDGER WRITE MAPPING & MODULE GUARD
// =============================================================================
// Shared by the /v1/financials/transactions endpoints. Alongside the usual
// allow-list this holds the module guard: Bookkeeping is a switchable module,
// and a fleet that has turned it off should not have an API key quietly writing
// into a ledger nobody in the fleet can see.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getApiEnabledModules } from '@/lib/api/entitlements';
import { apiError } from '@/lib/api/respond';
import type { CategoryRef } from '@/lib/api/serializers';
import { FieldErrors, optDate, optEnum, optNumber, optString, optUuid } from '@/lib/api/validate';

export const BOOKKEEPING_MODULE = 'bookkeeping';

/**
 * Returns a 403 response when the fleet has the Bookkeeping module switched
 * off, or null when the call may proceed.
 */
export async function guardBookkeeping(organizationId: string): Promise<Response | null> {
  const modules = await getApiEnabledModules(organizationId);
  if (modules.has(BOOKKEEPING_MODULE)) return null;
  return apiError(
    'module_disabled',
    'The Bookkeeping module is switched off for this fleet. Turn it on under Modules & integrations in Rovora to use the financials endpoints.',
  );
}

/**
 * The fleet's chart of accounts, keyed by id. Loaded once per request and
 * handed to the transaction serializer, which is both cheaper than embedding
 * the category on every ledger row and immune to join-syntax surprises.
 */
export async function loadCategoryMap(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Map<string, CategoryRef>> {
  const { data } = await admin
    .from('org_finance_categories')
    .select('id, key, name, kind')
    .eq('organization_id', organizationId);

  const map = new Map<string, CategoryRef>();
  for (const row of (data ?? []) as CategoryRef[]) {
    map.set(String(row.id), {
      id: String(row.id),
      key: String(row.key ?? ''),
      name: String(row.name ?? ''),
      kind: String(row.kind ?? 'expense'),
    });
  }
  return map;
}

export const TRANSACTION_WRITABLE_FIELDS = [
  'txn_date',
  'category_id',
  'amount',
  'description',
  'counterparty',
  'payment_method',
  'vehicle_id',
  'driver_id',
] as const;

const PAYMENT_METHODS = ['cash', 'card', 'bank', 'other'] as const;

export function buildTransactionPayload(
  errs: FieldErrors,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    if (value !== undefined) out[field] = value;
  };

  set('txn_date', optDate(errs, body, 'txn_date'));
  set('category_id', optUuid(errs, body, 'category_id'));
  // The column is CHECK (amount > 0): direction comes from the category, so a
  // negative figure here would mean "a negative expense", which is nonsense.
  set('amount', optNumber(errs, body, 'amount', { min: 0.01, max: 99_999_999 }));
  set('description', optString(errs, body, 'description', { max: 500 }));
  set('counterparty', optString(errs, body, 'counterparty', { max: 200 }));
  set('payment_method', optEnum(errs, body, 'payment_method', PAYMENT_METHODS));
  set('vehicle_id', optUuid(errs, body, 'vehicle_id'));
  set('driver_id', optUuid(errs, body, 'driver_id'));

  // Money with more than two decimals silently rounds in a numeric(12,2)
  // column, so say so rather than storing something the caller did not send.
  if (typeof out.amount === 'number' && Math.round(out.amount * 100) !== out.amount * 100) {
    errs.add('amount', 'must have at most 2 decimal places');
  }

  return out;
}

/**
 * Every id a transaction points at must belong to the caller's fleet. Without
 * this a key could file its own spending against another fleet's category.
 */
export async function verifyTransactionLinks(
  admin: SupabaseClient,
  organizationId: string,
  payload: Record<string, unknown>,
  errs: FieldErrors,
): Promise<void> {
  const checks: PromiseLike<void>[] = [];

  if (typeof payload.category_id === 'string') {
    checks.push(
      admin
        .from('org_finance_categories')
        .select('id')
        .eq('id', payload.category_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) errs.add('category_id', 'is not a category in this fleet');
        }),
    );
  }

  if (typeof payload.vehicle_id === 'string') {
    checks.push(
      admin
        .from('vehicles')
        .select('id')
        .eq('id', payload.vehicle_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) errs.add('vehicle_id', 'is not a vehicle in this fleet');
        }),
    );
  }

  if (typeof payload.driver_id === 'string') {
    checks.push(
      admin
        .from('drivers')
        .select('id')
        .eq('id', payload.driver_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) errs.add('driver_id', 'is not a driver in this fleet');
        }),
    );
  }

  await Promise.all(checks);
}
