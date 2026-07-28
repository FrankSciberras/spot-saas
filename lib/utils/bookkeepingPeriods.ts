// =============================================================================
// BOOKKEEPING PERIODS — period maths for week / month / custom bookkeeping
// =============================================================================
// Bookkeeping used to be week-only in name but not in fact: the table stored an
// arbitrary date range and "Week 24" was free text the operator typed. These
// helpers make the intent explicit so the UI can default sensibly, label
// consistently, and split a period correctly across month boundaries.
//
// All date maths is done in UTC on YYYY-MM-DD strings, so a period never shifts
// by a day when the server and the operator are in different timezones, and DST
// transitions cannot change a day count.
// Pure functions only — safe on both server and client.
// =============================================================================

export type PeriodType = 'week' | 'month' | 'custom';
export type CostFrequency = 'weekly' | 'monthly' | 'yearly';

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD (or ISO timestamp) into a UTC-midnight Date. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Render a UTC Date back to YYYY-MM-DD. */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Days covered by a period, counting BOTH endpoints (Mon–Sun = 7, not 6). */
export function daysInclusive(start: string, end: string): number {
  const diff = (parseDate(end).getTime() - parseDate(start).getTime()) / MS_PER_DAY;
  return Math.max(0, Math.round(diff)) + 1;
}

/** Do two closed date ranges share at least one day? */
export function periodsOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  return parseDate(aStart) <= parseDate(bEnd) && parseDate(bStart) <= parseDate(aEnd);
}

// -----------------------------------------------------------------------------
// Deriving a period from a date the operator picked
// -----------------------------------------------------------------------------

/**
 * Given any date inside the period, return the period's bounds.
 *
 * - `week`  — the Mon–Sun week containing the date.
 * - `month` — the 1st to the last day of that month.
 * - `custom`— left to the caller; returns the date unchanged as both bounds.
 */
export function derivePeriodBounds(
  type: PeriodType,
  anchorISO: string,
): { start: string; end: string } {
  const anchor = parseDate(anchorISO);

  if (type === 'week') {
    // getUTCDay(): 0 = Sunday. Shift so Monday is day 0.
    const offset = (anchor.getUTCDay() + 6) % 7;
    const start = addDays(anchor, -offset);
    return { start: toISODate(start), end: toISODate(addDays(start, 6)) };
  }

  if (type === 'month') {
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    // Day 0 of the NEXT month is the last day of this one.
    return {
      start: toISODate(new Date(Date.UTC(y, m, 1))),
      end: toISODate(new Date(Date.UTC(y, m + 1, 0))),
    };
  }

  return { start: anchorISO, end: anchorISO };
}

// -----------------------------------------------------------------------------
// Labelling
// -----------------------------------------------------------------------------

function fmtDay(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  });
}

/**
 * The default label for a period. Weeks carry the year on the end date (the
 * old client-side fallback dropped it, so "05 Jan - 11 Jan" was ambiguous
 * across years); months read as "July 2026".
 */
export function formatPeriodLabel(type: PeriodType, start: string, end: string): string {
  if (type === 'month') {
    return parseDate(start).toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }
  const endWithYear = parseDate(end).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return `${fmtDay(start)} - ${endWithYear}`;
}

/** Compact range for lists and chart axes, e.g. "08 Jun – 14 Jun". */
export function formatPeriodRange(start: string, end: string): string {
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

// -----------------------------------------------------------------------------
// Month attribution
// -----------------------------------------------------------------------------

export interface MonthSlice {
  /** First day of the month, YYYY-MM-01 — the bucket key. */
  month: string;
  /** Days of this period that fall inside that month. */
  days: number;
  /** days / total days in the period. Sums to 1 across all slices. */
  weight: number;
}

/**
 * Split a period across the calendar months it touches.
 *
 * The old monthly rollup bucketed a whole period by its START date, so a week
 * running 29 Jun – 5 Jul counted entirely as June — including July's five days.
 * Fine for a sparkline, wrong for monthly accounts. Weighting by day count
 * attributes each month its actual share.
 */
export function splitAcrossMonths(start: string, end: string): MonthSlice[] {
  const total = daysInclusive(start, end);
  if (total <= 0) return [];

  const slices: MonthSlice[] = [];
  const endDate = parseDate(end);
  let cursor = parseDate(start);

  while (cursor <= endDate) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const monthEnd = new Date(Date.UTC(y, m + 1, 0));
    const sliceEnd = monthEnd < endDate ? monthEnd : endDate;
    const days = daysInclusive(toISODate(cursor), toISODate(sliceEnd));

    slices.push({
      month: toISODate(new Date(Date.UTC(y, m, 1))),
      days,
      weight: days / total,
    });

    cursor = addDays(sliceEnd, 1);
  }

  return slices;
}

// -----------------------------------------------------------------------------
// Recurring vehicle costs
// -----------------------------------------------------------------------------

/** Average days per period, used to turn any frequency into a daily rate. */
const DAYS_PER: Record<CostFrequency, number> = {
  weekly: 7,
  monthly: 365 / 12, // 30.4167 — keeps twelve monthly charges equal to one year
  yearly: 365,
};

export interface RecurringCostLike {
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

/**
 * What a recurring cost contributes to one bookkeeping period.
 *
 * Converts the charge to a daily rate and multiplies by the days the cost was
 * actually live inside the period — so a €400/month lease contributes ~€92 to a
 * week, and a lease that ended mid-period is only charged up to its end date.
 * Returns 0 when the cost is inactive or does not overlap the period at all.
 */
export function prorateCost(
  cost: RecurringCostLike,
  periodStart: string,
  periodEnd: string,
): number {
  if (!cost.is_active || !(cost.amount > 0)) return 0;
  if (!periodsOverlap(cost.start_date, cost.end_date ?? periodEnd, periodStart, periodEnd)) {
    return 0;
  }

  // Clip the cost's own lifetime to the period.
  const from = parseDate(cost.start_date) > parseDate(periodStart) ? cost.start_date : periodStart;
  const to = cost.end_date && parseDate(cost.end_date) < parseDate(periodEnd)
    ? cost.end_date
    : periodEnd;

  const activeDays = daysInclusive(from, to);
  const dailyRate = cost.amount / DAYS_PER[cost.frequency];

  return Math.round(dailyRate * activeDays * 100) / 100;
}

/** Human summary of a recurring charge, e.g. "€400.00 / month". */
export function describeFrequency(amount: number, frequency: CostFrequency): string {
  const unit = frequency === 'weekly' ? 'week' : frequency === 'yearly' ? 'year' : 'month';
  return `€${amount.toFixed(2)} / ${unit}`;
}
