// =============================================================================
// RECURRING COSTS → LEDGER (repeating bills)
// =============================================================================
// A vehicle_recurring_costs row is a template: "€400 lease, monthly, from
// 1 March". Before the ledger existed it was prorated by day into whichever
// period the operator happened to open. Now it behaves like a repeating bill
// in Xero / QuickBooks: on each due date the app posts ONE finance_transactions
// line for the full amount, tagged source = 'recurring' so it can be told
// apart from (and never double-posted over) what a human typed.
//
// Posting is idempotent two ways: the DB has a unique index on
// (source_ref, txn_date) for recurring lines, and `posted_through` on the cost
// records the last due date handled, so the daily cron and the page-load
// catch-up can both run without stepping on each other.
//
// Due-date maths (pure, exported for tests / UI "next due" hints):
//   weekly  — every 7 days from start_date
//   monthly — the same day-of-month as start_date, clamped to month end
//             (a cost that starts on the 31st falls on the 28th in February)
//   yearly  — same month and day each year
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseDate, toISODate, type CostFrequency } from '@/lib/utils/bookkeepingPeriods';

export interface RecurringCostRow {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  category_id: string;
  label: string;
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  posted_through: string | null;
}

const MS_PER_DAY = 86_400_000;

function addDaysISO(iso: string, days: number): string {
  return toISODate(new Date(parseDate(iso).getTime() + days * MS_PER_DAY));
}

/** The n-th due date (0 = start_date) for a cost. */
export function nthDueDate(startISO: string, frequency: CostFrequency, n: number): string {
  const start = parseDate(startISO);
  if (frequency === 'weekly') {
    return addDaysISO(startISO, 7 * n);
  }
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonth = frequency === 'monthly' ? m + n : m;
  const targetYear = frequency === 'yearly' ? y + n : y;
  // Day 0 of the following month = last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return toISODate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

/**
 * Every due date strictly after `after` (or from start_date when null) and on
 * or before `through`, respecting the cost's own end_date. Bounded so a
 * mistyped start date in 1990 cannot spin forever.
 */
export function dueDatesBetween(
  cost: Pick<RecurringCostRow, 'start_date' | 'end_date' | 'frequency'>,
  after: string | null,
  through: string,
  limit = 400,
): string[] {
  const start = cost.start_date.split('T')[0];
  const last = cost.end_date ? cost.end_date.split('T')[0] : null;
  const dates: string[] = [];

  for (let n = 0; n < limit * 4; n += 1) {
    const due = nthDueDate(start, cost.frequency, n);
    if (due > through) break;
    if (last && due > last) break;
    if (after && due <= after) continue;
    dates.push(due);
    if (dates.length >= limit) break;
  }
  return dates;
}

/** The next date this cost will post on, or null if it has ended / is paused. */
export function nextDueDate(
  cost: Pick<RecurringCostRow, 'start_date' | 'end_date' | 'frequency' | 'posted_through' | 'is_active'>,
): string | null {
  if (!cost.is_active) return null;
  const start = cost.start_date.split('T')[0];
  const last = cost.end_date ? cost.end_date.split('T')[0] : null;
  const after = cost.posted_through ? cost.posted_through.split('T')[0] : null;
  for (let n = 0; n < 2000; n += 1) {
    const due = nthDueDate(start, cost.frequency, n);
    if (last && due > last) return null;
    if (!after || due > after) return due;
  }
  return null;
}

export interface PostResult {
  costsChecked: number;
  posted: number;
  errors: string[];
}

/**
 * Post every due-but-unposted line for the given fleet (or all fleets when
 * orgId is omitted) up to and including `through` (default: today, UTC).
 * Uses the service-role client — call only from server code that has already
 * verified the caller (cron secret / admin session).
 */
export async function postDueRecurringCosts(
  admin: SupabaseClient,
  orgId: string | null,
  through: string = toISODate(new Date()),
): Promise<PostResult> {
  const result: PostResult = { costsChecked: 0, posted: 0, errors: [] };

  let query = admin
    .from('vehicle_recurring_costs')
    .select('id, organization_id, vehicle_id, category_id, label, amount, frequency, start_date, end_date, is_active, posted_through')
    .eq('is_active', true)
    .lte('start_date', through);
  if (orgId) query = query.eq('organization_id', orgId);

  const { data: costs, error } = await query;
  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const cost of (costs ?? []) as RecurringCostRow[]) {
    result.costsChecked += 1;
    if (!(Number(cost.amount) > 0)) continue;

    const due = dueDatesBetween(cost, cost.posted_through, through);
    if (due.length === 0) continue;

    const rows = due.map((txnDate) => ({
      organization_id: cost.organization_id,
      txn_date: txnDate,
      category_id: cost.category_id,
      amount: Number(cost.amount),
      description: cost.label,
      payment_method: 'bank',
      vehicle_id: cost.vehicle_id,
      source: 'recurring',
      source_ref: cost.id,
    }));

    // ignoreDuplicates + uq_finance_txns_generated_once = at most one line per
    // due date even if two posters race.
    const { error: insErr } = await admin
      .from('finance_transactions')
      .upsert(rows, { onConflict: 'source_ref,txn_date,category_id', ignoreDuplicates: true });

    if (insErr) {
      result.errors.push(`${cost.label}: ${insErr.message}`);
      continue;
    }

    const { error: updErr } = await admin
      .from('vehicle_recurring_costs')
      .update({ posted_through: due[due.length - 1] })
      .eq('id', cost.id);

    if (updErr) {
      result.errors.push(`${cost.label}: ${updErr.message}`);
      continue;
    }
    result.posted += rows.length;
  }

  return result;
}
