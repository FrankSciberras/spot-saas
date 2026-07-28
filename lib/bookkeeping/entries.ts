// =============================================================================
// BOOKKEEPING ENTRY PERSISTENCE
// =============================================================================
// Shared by POST /api/bookkeeping and PUT /api/bookkeeping/[id]. Writing the
// amounts map is the only genuinely fiddly part of saving a period, so both
// routes go through here rather than each growing their own copy — which is
// how the old twelve-column list ended up duplicated in seven places.
//
// Period totals are NOT written here: a DB trigger recomputes them from these
// rows, so the stored figure cannot drift from the entries.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SyncResult {
  error: string | null;
  status?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Replace a period's entries with `amounts` (category id -> amount).
 *
 * Categories are verified to belong to `orgId` first. The foreign key only
 * proves a category EXISTS — without this check a caller could post another
 * fleet's category id and have it stamped with their own organization_id,
 * quietly linking one fleet's ledger to another's chart of accounts.
 *
 * Zero, negative and omitted amounts delete the row rather than storing 0, so
 * a period holds only the lines the operator actually filled in.
 */
export async function syncPeriodEntries(
  supabase: SupabaseClient,
  orgId: string,
  periodId: string,
  amounts: Record<string, number>,
): Promise<SyncResult> {
  const requestedIds = Object.keys(amounts ?? {});

  // ---- Verify every referenced category belongs to this fleet --------------
  let validIds = new Set<string>();
  if (requestedIds.length > 0) {
    const { data: owned, error: catError } = await supabase
      .from('org_finance_categories')
      .select('id')
      .eq('organization_id', orgId)
      .in('id', requestedIds);

    if (catError) {
      return { error: catError.message, status: 500 };
    }

    validIds = new Set((owned ?? []).map((c: { id: string }) => c.id));
    const unknown = requestedIds.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      return { error: 'One or more categories do not belong to this fleet', status: 400 };
    }
  }

  // ---- Split into rows to write and rows to remove -------------------------
  const toUpsert: { organization_id: string; period_id: string; category_id: string; amount: number }[] = [];
  const toDelete: string[] = [];

  for (const categoryId of requestedIds) {
    const amount = round2(Number(amounts[categoryId]) || 0);
    if (amount > 0) {
      toUpsert.push({
        organization_id: orgId,
        period_id: periodId,
        category_id: categoryId,
        amount,
      });
    } else {
      toDelete.push(categoryId);
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('bookkeeping_entries')
      .upsert(toUpsert, { onConflict: 'period_id,category_id' });
    if (error) {
      return { error: error.message, status: 500 };
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('bookkeeping_entries')
      .delete()
      .eq('period_id', periodId)
      .in('category_id', toDelete);
    if (error) {
      return { error: error.message, status: 500 };
    }
  }

  return { error: null };
}

/** Basic shape checks shared by create and update. */
export function validatePeriodDates(
  startDate: unknown,
  endDate: unknown,
): string | null {
  const isDate = (v: unknown): v is string =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.split('T')[0]);

  if (!isDate(startDate) || !isDate(endDate)) {
    return 'start_date and end_date must be YYYY-MM-DD dates';
  }
  if (endDate.split('T')[0] < startDate.split('T')[0]) {
    return 'end_date cannot be before start_date';
  }
  return null;
}

export const PERIOD_TYPES = ['week', 'month', 'custom'] as const;

export function isPeriodType(value: unknown): value is (typeof PERIOD_TYPES)[number] {
  return typeof value === 'string' && (PERIOD_TYPES as readonly string[]).includes(value);
}
