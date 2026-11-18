// =============================================================================
// ROVORA AI — periods ("this week", "last month") resolved like the dashboard
// =============================================================================
// Answers must match the numbers on screen, so periods are resolved with the
// SAME helpers the Bookkeeping / Financials pages use (lib/utils/financeRanges:
// Monday-start weeks, calendar months) and "today" is taken in the fleet's time
// zone, not the server's (the container runs in UTC).
// =============================================================================

import { resolvePreset, previousRange, type RangePreset } from '@/lib/utils/financeRanges';
import type { AssistantContext } from './types';

export const PERIOD_PRESETS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'last_7_days',
  'last_4_weeks',
  'this_month',
  'last_month',
  'last_30_days',
  'this_quarter',
  'this_year',
  'last_year',
  'custom',
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface Period {
  /** Inclusive first day, YYYY-MM-DD (fleet time zone). */
  from: string;
  /** Inclusive last day, YYYY-MM-DD (fleet time zone). */
  to: string;
  /** Human label, e.g. "this month (1 Nov – 30 Nov 2026)". */
  label: string;
}

/** JSON-schema fragment for a `period` argument. Spread into a tool's properties. */
export const PERIOD_SCHEMA = {
  type: 'object',
  description:
    'Time range. Use a preset where it fits; use "custom" with from/to (YYYY-MM-DD, inclusive) for anything else. Weeks run Monday–Sunday.',
  properties: {
    preset: { type: 'string', enum: [...PERIOD_PRESETS] },
    from: { type: 'string', description: 'YYYY-MM-DD, only with preset "custom"' },
    to: { type: 'string', description: 'YYYY-MM-DD, only with preset "custom"' },
  },
  required: ['preset'],
} as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function labelled(name: string, from: string, to: string): Period {
  return { from, to, label: from === to ? `${name} (${fmt(from)})` : `${name} (${fmt(from)} – ${fmt(to)})` };
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone });
}

/**
 * Resolve a model-supplied `period` argument. Anything malformed falls back to
 * `fallback` rather than throwing — a slightly wrong range with its label shown
 * in the answer beats a dead question.
 */
export function resolvePeriod(ctx: Pick<AssistantContext, 'today'>, input: unknown, fallback: PeriodPreset = 'this_month'): Period {
  const raw = (input && typeof input === 'object' ? input : {}) as { preset?: unknown; from?: unknown; to?: unknown };
  const preset = (PERIOD_PRESETS as readonly string[]).includes(String(raw.preset)) ? (raw.preset as PeriodPreset) : fallback;
  const today = ctx.today;

  const fromPreset = (p: RangePreset, name: string): Period => {
    const r = resolvePreset(p, today);
    return r ? labelled(name, r.start, r.end) : labelled(name, today, today);
  };

  switch (preset) {
    case 'today':
      return labelled('today', today, today);
    case 'yesterday': {
      const y = addDays(today, -1);
      return labelled('yesterday', y, y);
    }
    case 'this_week':
      return fromPreset('week', 'this week');
    case 'last_week': {
      const r = resolvePreset('week', addDays(resolvePreset('week', today)!.start, -1))!;
      return labelled('last week', r.start, r.end);
    }
    case 'last_7_days':
      return labelled('the last 7 days', addDays(today, -6), today);
    case 'last_4_weeks':
      return fromPreset('last4w', 'the last 4 weeks');
    case 'this_month':
      return fromPreset('month', 'this month');
    case 'last_month':
      return fromPreset('last_month', 'last month');
    case 'last_30_days':
      return labelled('the last 30 days', addDays(today, -29), today);
    case 'this_quarter':
      return fromPreset('quarter', 'this quarter');
    case 'this_year':
      return fromPreset('year', 'this year');
    case 'last_year': {
      const y = Number(today.slice(0, 4)) - 1;
      return labelled('last year', `${y}-01-01`, `${y}-12-31`);
    }
    case 'custom': {
      let from = typeof raw.from === 'string' && ISO_DAY.test(raw.from) ? raw.from : null;
      let to = typeof raw.to === 'string' && ISO_DAY.test(raw.to) ? raw.to : null;
      if (!from && !to) return resolvePeriod(ctx, { preset: fallback === 'custom' ? 'this_month' : fallback });
      from = from ?? to!;
      to = to ?? from;
      if (from > to) [from, to] = [to, from];
      // Hard ceiling on custom ranges so one question can't pull years of rows.
      if (addDays(from, 3 * 366) < to) from = addDays(to, -3 * 366);
      return labelled('the selected dates', from, to);
    }
  }
}

/** The equal-length period just before `p` (calendar months compare to the previous month). */
export function previousPeriod(p: Period): Period {
  const r = previousRange({ start: p.from, end: p.to });
  return labelled('the period before', r.start, r.end);
}

/** Offset (minutes) of `timeZone` from UTC at instant `at`. */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The UTC instant of local midnight at the start of `day` in `timeZone`. */
export function startOfDayUtc(day: string, timeZone: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  let t = guess.getTime() - offsetMinutes(guess, timeZone) * 60_000;
  // Re-check once across a DST change.
  t = guess.getTime() - offsetMinutes(new Date(t), timeZone) * 60_000;
  return new Date(t).toISOString();
}

/**
 * Timestamp bounds for filtering timestamptz columns by a period:
 * `.gte(col, startIso).lt(col, endIso)` covers `from` 00:00 to the end of `to`
 * in the fleet's time zone.
 */
export function periodBoundsUtc(p: Pick<Period, 'from' | 'to'>, timeZone: string): { startIso: string; endIso: string } {
  return { startIso: startOfDayUtc(p.from, timeZone), endIso: startOfDayUtc(addDays(p.to, 1), timeZone) };
}

/** The fleet-local calendar day (YYYY-MM-DD) of a timestamp. */
export function localDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

/** Whole days from `fromDay` to `toDay` (negative when in the past). */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}
