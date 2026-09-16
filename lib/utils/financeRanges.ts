// =============================================================================
// FINANCE RANGES — date-range presets and bucketing for the transaction ledger
// =============================================================================
// The ledger has no periods: a report is "sum every transaction whose date
// falls between A and B". These helpers turn the presets an operator actually
// reaches for (today, this week, last 4 weeks, this month, this year …) into
// [start, end] ISO dates, work out the equivalent previous range for a
// "vs last time" comparison, and bucket dates into weeks / months / quarters.
//
// Same rules as lib/utils/bookkeepingPeriods.ts: all maths in UTC on YYYY-MM-DD
// strings, weeks run Monday–Sunday. Pure functions — safe on server and client.
// =============================================================================

import { parseDate, toISODate, daysInclusive, derivePeriodBounds } from './bookkeepingPeriods';

export type RangePreset =
  | 'today'
  | 'week'
  | 'last4w'
  | 'month'
  | 'last_month'
  | 'quarter'
  | 'year'
  | 'all'
  | 'custom';

export interface DateRange {
  start: string;
  end: string;
}

export const RANGE_PRESETS: { value: RangePreset; label: string; hint: string }[] = [
  { value: 'today', label: 'Today', hint: 'Just today' },
  { value: 'week', label: 'This week', hint: 'Monday to Sunday' },
  { value: 'last4w', label: 'Last 4 weeks', hint: 'Your pay cycle' },
  { value: 'month', label: 'This month', hint: 'Calendar month' },
  { value: 'last_month', label: 'Last month', hint: 'Previous calendar month' },
  { value: 'quarter', label: 'This quarter', hint: 'Jan–Mar, Apr–Jun…' },
  { value: 'year', label: 'This year', hint: 'January to today' },
  { value: 'all', label: 'All time', hint: 'Everything recorded' },
  { value: 'custom', label: 'Custom', hint: 'Pick your own dates' },
];

const MS_PER_DAY = 86_400_000;

function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseDate(iso).getTime() + days * MS_PER_DAY));
}

/** Today as YYYY-MM-DD in the browser's local calendar (what the operator means by "today"). */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  return derivePeriodBounds('week', iso).start;
}

/**
 * Resolve a preset to concrete bounds. `all` and `custom` return null — the
 * caller decides (no filter / operator-typed dates respectively).
 */
export function resolvePreset(preset: RangePreset, today: string = todayISO()): DateRange | null {
  const t = parseDate(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();

  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'week':
      return derivePeriodBounds('week', today);
    case 'last4w': {
      // The current Mon–Sun week plus the three before it — 28 days ending on
      // this Sunday. Matches a 4-weekly pay cycle without having to line up
      // with any calendar month.
      const thisWeek = derivePeriodBounds('week', today);
      return { start: addDays(thisWeek.start, -21), end: thisWeek.end };
    }
    case 'month':
      return derivePeriodBounds('month', today);
    case 'last_month': {
      const firstOfThis = toISODate(new Date(Date.UTC(y, m, 1)));
      return derivePeriodBounds('month', addDays(firstOfThis, -1));
    }
    case 'quarter': {
      const qStartMonth = Math.floor(m / 3) * 3;
      return {
        start: toISODate(new Date(Date.UTC(y, qStartMonth, 1))),
        end: toISODate(new Date(Date.UTC(y, qStartMonth + 3, 0))),
      };
    }
    case 'year':
      return {
        start: toISODate(new Date(Date.UTC(y, 0, 1))),
        end: toISODate(new Date(Date.UTC(y, 11, 31))),
      };
    default:
      return null;
  }
}

/**
 * The range of equal length immediately before `range` — what "vs previous
 * period" compares against. Whole calendar months compare to the previous
 * calendar month (not "the 30 days before"), since that is what people mean.
 */
export function previousRange(range: DateRange): DateRange {
  const s = parseDate(range.start);
  const e = parseDate(range.end);
  const isWholeMonth =
    s.getUTCDate() === 1 &&
    e.getUTCFullYear() === s.getUTCFullYear() &&
    e.getUTCMonth() === s.getUTCMonth() &&
    e.getUTCDate() === new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)).getUTCDate();

  if (isWholeMonth) {
    return derivePeriodBounds('month', addDays(range.start, -1));
  }

  const length = daysInclusive(range.start, range.end);
  const end = addDays(range.start, -1);
  return { start: addDays(end, -(length - 1)), end };
}

export function inRange(iso: string, range: DateRange | null): boolean {
  if (!range) return true;
  const d = iso.split('T')[0];
  return d >= range.start && d <= range.end;
}

// -----------------------------------------------------------------------------
// Bucketing for reports
// -----------------------------------------------------------------------------

export type Bucketing = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Bucket {
  key: string;
  label: string;
  start: string;
  end: string;
}

function fmtShort(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/** Which week / month / quarter / year a dated transaction belongs to. */
export function bucketFor(iso: string, by: Bucketing): Bucket {
  const day = iso.split('T')[0];
  const d = parseDate(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();

  if (by === 'weekly') {
    const { start, end } = derivePeriodBounds('week', day);
    return { key: start, label: `${fmtShort(start)} – ${fmtShort(end)}`, start, end };
  }
  if (by === 'monthly') {
    const { start, end } = derivePeriodBounds('month', day);
    return {
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      start,
      end,
    };
  }
  if (by === 'quarterly') {
    const q = Math.floor(m / 3) + 1;
    return {
      key: `${y}-Q${q}`,
      label: `${y} Q${q}`,
      start: toISODate(new Date(Date.UTC(y, (q - 1) * 3, 1))),
      end: toISODate(new Date(Date.UTC(y, q * 3, 0))),
    };
  }
  return {
    key: String(y),
    label: String(y),
    start: toISODate(new Date(Date.UTC(y, 0, 1))),
    end: toISODate(new Date(Date.UTC(y, 11, 31))),
  };
}

// -----------------------------------------------------------------------------
// Display
// -----------------------------------------------------------------------------

/** "Today", "Yesterday", otherwise "Tue 16 Sep" (with the year if not this year). */
export function formatDayHeading(iso: string, today: string = todayISO()): string {
  const day = iso.split('T')[0];
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const d = parseDate(day);
  const sameYear = d.getUTCFullYear() === parseDate(today).getUTCFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  });
}

/** "16 Sep 2026". */
export function formatDateLong(iso: string): string {
  return parseDate(iso.split('T')[0]).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** "08 Sep – 05 Oct 2026" — how a range reads in a heading. */
export function formatRange(range: DateRange): string {
  if (range.start === range.end) return formatDateLong(range.start);
  const endWithYear = parseDate(range.end).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return `${fmtShort(range.start)} – ${endWithYear}`;
}

export function fmtEUR(value: number, decimals = 2): string {
  const abs = Math.abs(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  return `${value < 0 ? '-' : ''}€${abs}`;
}
