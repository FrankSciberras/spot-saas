// Small display helpers shared by the invoice screens (client-safe).

import { formatMoney } from '@/lib/money';
import { fromCents, type DisplayStatus } from '@/lib/invoices/math';

/** Cents → "€1,234.56" in the document's own currency and the fleet's number style. */
export function moneyOf(cents: number, currency: string, locale: string): string {
  return formatMoney(fromCents(cents), { currency: currency || 'EUR', locale });
}

/** "2026-11-18" (or an ISO timestamp) → "18 Nov 2026". */
export function shortDate(date: string | null | undefined): string {
  if (!date) return '';
  const parsed = Date.parse(date.length <= 10 ? `${date}T00:00:00Z` : date);
  if (Number.isNaN(parsed)) return date;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: date.length <= 10 ? 'UTC' : undefined,
  }).format(parsed);
}

/** Tone of the status chip. */
export const STATUS_TONE: Record<DisplayStatus, 'neutral' | 'info' | 'warn' | 'bad' | 'good'> = {
  draft: 'neutral',
  awaiting: 'info',
  part_paid: 'warn',
  overdue: 'bad',
  paid: 'good',
  open: 'warn',
  applied: 'good',
  void: 'neutral',
};

/** Trims a stored number for an input: 2 → "2", 1.5 → "1.5", 12.3 → "12.30" when `fixed`. */
export function inputNumber(value: number, fixed?: number): string {
  if (!Number.isFinite(value)) return '';
  return fixed === undefined ? String(value) : value.toFixed(fixed);
}
