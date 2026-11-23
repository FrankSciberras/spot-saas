// =============================================================================
// Admin Console → Analytics: the date-range picker's maths, in the admin's own
// time zone. Every range comes with the comparison period it is measured
// against (same length, immediately before — or "to this time" for a period
// still in progress, e.g. today so far vs yesterday up to the same time).
// =============================================================================

import type { Bucket } from './analytics-types';

export type RangeId = 'today' | 'yesterday' | 'this_week' | 'last_week' | '30d' | '90d' | '12m' | 'custom';

/** What the admin picked. A custom range is two local dates, both inclusive. */
export interface RangeSel {
  id: RangeId;
  from?: string;
  to?: string;
}

export interface Range {
  from: Date;
  to: Date;
  prevFrom: Date;
  bucket: Bucket;
  /** "Compared with …" */
  compare: string;
}

export const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: '12m', label: '12 months' },
  { id: 'custom', label: 'Custom' },
];

const DAY = 86_400_000;
/** The server accepts up to 800 days; keep custom ranges comfortably inside. */
export const MAX_CUSTOM_DAYS = 731;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** YYYY-MM-DD → local midnight, or null. */
export function parseYmd(s: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A stable id for a selection (custom ranges include their dates). */
export const rangeKey = (sel: RangeSel) => (sel.id === 'custom' ? `custom:${sel.from}:${sel.to}` : sel.id);

/** A custom selection is usable: both dates, in order, not in the future, not too long. */
export function validCustom(from: string | undefined, to: string | undefined): string | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 'Pick a start and an end date.';
  if (a > b) return 'The start date is after the end date.';
  if (a > new Date()) return 'The range starts in the future.';
  if ((b.getTime() - a.getTime()) / DAY > MAX_CUSTOM_DAYS) return 'Pick two years or less.';
  return null;
}

export function rangeFor(sel: RangeSel): Range {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = (n: number) => addDays(midnight, -n);
  // Monday of this week (weeks run Monday → Sunday).
  const monday = addDays(midnight, -((midnight.getDay() + 6) % 7));
  switch (sel.id) {
    case 'today':
      return { from: midnight, to: now, prevFrom: daysBack(1), bucket: 'hour', compare: 'yesterday to this time' };
    case 'yesterday':
      return { from: daysBack(1), to: midnight, prevFrom: daysBack(2), bucket: 'hour', compare: 'the day before' };
    case 'this_week':
      return { from: monday, to: now, prevFrom: addDays(monday, -7), bucket: 'day', compare: 'last week to this time' };
    case 'last_week':
      return { from: addDays(monday, -7), to: monday, prevFrom: addDays(monday, -14), bucket: 'day', compare: 'the week before' };
    case '30d':
      return { from: daysBack(29), to: now, prevFrom: daysBack(59), bucket: 'day', compare: 'the 30 days before' };
    case '90d':
      return { from: daysBack(89), to: now, prevFrom: daysBack(179), bucket: 'week', compare: 'the 90 days before' };
    case '12m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { from, to: now, prevFrom: new Date(from.getFullYear() - 1, from.getMonth(), 1), bucket: 'month', compare: 'the 12 months before' };
    }
    case 'custom': {
      const a = parseYmd(sel.from) ?? daysBack(29);
      const b = parseYmd(sel.to) ?? midnight;
      const end = addDays(b, 1);
      const to = end > now ? now : end;
      const from = a < to ? a : addDays(to, -1);
      const days = Math.max(1, Math.round((addDays(b, 1).getTime() - a.getTime()) / DAY));
      const bucket: Bucket = days <= 2 ? 'hour' : days <= 92 ? 'day' : days <= 400 ? 'week' : 'month';
      // The comparison is the same number of calendar days just before.
      return { from, to, prevFrom: addDays(a, -days), bucket, compare: days === 1 ? 'the day before' : `the ${days} days before` };
    }
  }
}

/** "17 Nov – 23 Nov 2026" / "Today, from 00:00" for the header. */
export function describeRange(r: Range): string {
  const last = new Date(r.to.getTime() - 1);
  // "Mon 16 Nov 2026" — built by hand so both ends read the same way.
  const day = (d: Date, year: boolean) =>
    `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}${year ? ` ${d.getFullYear()}` : ''}`;
  if (ymd(r.from) === ymd(last)) return day(r.from, true);
  return `${day(r.from, r.from.getFullYear() !== last.getFullYear())} – ${day(last, true)}`;
}
