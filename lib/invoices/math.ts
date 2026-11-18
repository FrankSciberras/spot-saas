// =============================================================================
// INVOICE MATHS — pure, no imports (safe on the server, in the browser, in tests)
// =============================================================================
// One rule, used everywhere a figure is shown before the database has had its
// say: each line's net amount is quantity × unit price rounded to the cent, its
// VAT is that net × rate rounded to the cent, and a document's totals are the
// sums of its lines. Rounding is half away from zero.
//
// The database applies the SAME rule when a document is issued (invoice_issue
// in 20261118_invoices.sql: round(quantity * unit_price, 2) and
// round(line_net * tax_rate / 100, 2)), and what it computes is what is stored
// and sent to accounting software. Everything here is done in whole cents with
// BigInt so no floating-point error can creep in.
// =============================================================================

export interface LineInput {
  quantity: number | string;
  unitPrice: number | string;
  taxRate: number | string;
}

export interface LineAmounts {
  /** In cents. */
  net: number;
  tax: number;
  gross: number;
}

export interface TaxBand {
  /** Percentage, e.g. 18. */
  rate: number;
  net: number;
  tax: number;
}

export interface DocumentTotals {
  /** All in cents. */
  subtotal: number;
  tax: number;
  total: number;
  /** One entry per VAT rate used, highest rate first. */
  bands: TaxBand[];
}

/** Parses a decimal (number or string, "." or "," as separator) to an integer with `places` decimals, half away from zero. NaN → null. */
export function toScaled(value: number | string, places: number): bigint | null {
  let text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(places + 3) : '') : String(value ?? '').trim();
  text = text.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const negative = text.startsWith('-');
  text = text.replace(/^[-+]/, '');
  const [whole, frac = ''] = text.split('.');
  const kept = frac.slice(0, places).padEnd(places, '0');
  let scaled = BigInt((whole || '0') + kept);
  // Round on the first dropped digit.
  if (frac.length > places && frac.charCodeAt(places) >= 53 /* '5' */) scaled += BigInt(1);
  return negative ? -scaled : scaled;
}

/** a ÷ b rounded half away from zero (b > 0). */
function divRound(a: bigint, b: bigint): bigint {
  const negative = a < BigInt(0);
  const abs = negative ? -a : a;
  const q = (abs * BigInt(2) + b) / (b * BigInt(2));
  return negative ? -q : q;
}

/** Cents for an amount typed or stored as a decimal; null when it isn't a number. */
export function toCents(value: number | string): number | null {
  const scaled = toScaled(value, 2);
  return scaled === null ? null : Number(scaled);
}

/** 1234 → 12.34 (a plain number for storage in numeric(12,2) columns). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Net, VAT and gross of one line, in cents. Null when an input isn't a number. */
export function lineAmounts(line: LineInput): LineAmounts | null {
  const qty = toScaled(line.quantity, 3);
  const price = toScaled(line.unitPrice, 2);
  const rate = toScaled(line.taxRate, 2);
  if (qty === null || price === null || rate === null) return null;
  const net = divRound(qty * price, BigInt(1000));
  const tax = divRound(net * rate, BigInt(10000));
  return { net: Number(net), tax: Number(tax), gross: Number(net + tax) };
}

/** Totals of a document. Lines whose inputs aren't numbers yet count as zero. */
export function documentTotals(lines: LineInput[]): DocumentTotals {
  let subtotal = 0;
  let tax = 0;
  const bands = new Map<number, TaxBand>();
  for (const line of lines) {
    const amounts = lineAmounts(line);
    if (!amounts) continue;
    subtotal += amounts.net;
    tax += amounts.tax;
    const rate = Number(toScaled(line.taxRate, 2)) / 100;
    const band = bands.get(rate) ?? { rate, net: 0, tax: 0 };
    band.net += amounts.net;
    band.tax += amounts.tax;
    bands.set(rate, band);
  }
  return {
    subtotal,
    tax,
    total: subtotal + tax,
    bands: [...bands.values()].sort((a, b) => b.rate - a.rate),
  };
}

/** "INV-" + 7 padded to 4 → "INV-0007". */
export function formatDocumentNumber(prefix: string, seq: number, padding: number): string {
  return `${prefix}${String(seq).padStart(padding, '0')}`;
}

export type DocumentKind = 'invoice' | 'credit_note';
export type StoredStatus = 'draft' | 'issued' | 'void';

/**
 * What a person calls the state of a document:
 *   invoice     — draft · awaiting (payment) · part_paid · overdue · paid · void
 *   credit note — draft · open (credit left to refund) · applied · void
 */
export type DisplayStatus = 'draft' | 'awaiting' | 'part_paid' | 'overdue' | 'paid' | 'open' | 'applied' | 'void';

export function displayStatus(doc: {
  kind: DocumentKind;
  status: StoredStatus;
  /** Cents. */
  total: number;
  /** Cents still owed (invoice) or still refundable (credit note). */
  balance: number;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** YYYY-MM-DD in the fleet's own time zone. */
  today: string;
}): DisplayStatus {
  if (doc.status === 'draft') return 'draft';
  if (doc.status === 'void') return 'void';
  if (doc.kind === 'credit_note') return doc.balance > 0 ? 'open' : 'applied';
  if (doc.balance <= 0) return 'paid';
  if (doc.dueDate && doc.dueDate < doc.today) return 'overdue';
  return doc.balance < doc.total ? 'part_paid' : 'awaiting';
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: 'Draft',
  awaiting: 'Awaiting payment',
  part_paid: 'Part paid',
  overdue: 'Overdue',
  paid: 'Paid',
  open: 'Credit to refund',
  applied: 'Applied',
  void: 'Void',
};

/** Whole days between two YYYY-MM-DD dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** YYYY-MM-DD + n days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in a time zone, e.g. 'Europe/Malta'. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
