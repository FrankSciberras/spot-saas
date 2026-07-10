// =============================================================================
// ACCOUNTING EXPORT — QuickBooks / Xero-ready CSV generation (client-safe)
// =============================================================================
// Turns weekly bookkeeping rows into individual signed transactions and renders
// them in the two formats accountants actually import:
//   • Xero  — bank statement CSV: *Date, *Amount, Payee, Description, Reference
//   • QuickBooks — 4-column bank CSV: Date, Description, Credit, Debit
// Positive amounts are money IN (platform earnings), negative are money OUT
// (expenses). Dates render as DD/MM/YYYY, which both importers accept.
// Pure functions only — the download itself happens in the dashboard via the
// existing Blob helper.
// =============================================================================

import type { WeeklyBookkeeping } from '@/lib/types/database';

export interface AccountingTxn {
  /** ISO date (YYYY-MM-DD) the transaction is recognised on (week end). */
  date: string;
  payee: string;
  description: string;
  /** e.g. the week label, so lines trace back to a bookkeeping period. */
  reference: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
}

const INCOME_COLUMNS: { key: keyof WeeklyBookkeeping; payee: string; label: string }[] = [
  { key: 'uber_earnings', payee: 'Uber', label: 'Uber earnings' },
  { key: 'bolt_earnings', payee: 'Bolt', label: 'Bolt earnings' },
  { key: 'ecabs_earnings', payee: 'eCabs', label: 'eCabs earnings' },
  { key: 'other_earnings', payee: 'Other income', label: 'Other earnings' },
];

const EXPENSE_COLUMNS: { key: keyof WeeklyBookkeeping; payee: string; label: string }[] = [
  { key: 'employees', payee: 'Driver wages', label: 'Driver wages & settlements' },
  { key: 'repairs', payee: 'Repairs & maintenance', label: 'Vehicle repairs & maintenance' },
  { key: 'insurance', payee: 'Insurance', label: 'Insurance' },
  { key: 'investments', payee: 'Investments', label: 'Investments' },
  { key: 'vat', payee: 'VAT', label: 'VAT' },
  { key: 'rent', payee: 'Rent', label: 'Rent' },
  { key: 'employee_tax', payee: 'Employee tax', label: 'Employee tax' },
  { key: 'other_expenses', payee: 'Other expenses', label: 'Other expenses' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function periodReference(e: WeeklyBookkeeping): string {
  return e.week_label || `${e.week_start} to ${e.week_end}`;
}

/** Flatten bookkeeping periods into one signed transaction per non-zero column. */
export function buildBookkeepingTxns(entries: WeeklyBookkeeping[]): AccountingTxn[] {
  const txns: AccountingTxn[] = [];
  for (const e of entries) {
    const date = (e.week_end || e.week_start || '').split('T')[0];
    const reference = periodReference(e);
    for (const col of INCOME_COLUMNS) {
      const value = Number(e[col.key]) || 0;
      if (value > 0) {
        txns.push({ date, payee: col.payee, description: `${col.label} — ${reference}`, reference, amount: round2(value) });
      }
    }
    for (const col of EXPENSE_COLUMNS) {
      const value = Number(e[col.key]) || 0;
      if (value > 0) {
        txns.push({ date, payee: col.payee, description: `${col.label} — ${reference}`, reference, amount: round2(-value) });
      }
    }
  }
  return txns;
}

/** DD/MM/YYYY — the import format both Xero and QuickBooks default to. */
export function formatDateUK(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function csvEscape(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function csvJoin(cells: string[]): string {
  return cells.map(csvEscape).join(',');
}

/** Xero bank statement CSV: *Date, *Amount, Payee, Description, Reference. */
export function toXeroCsv(txns: AccountingTxn[]): string {
  const lines = [csvJoin(['*Date', '*Amount', 'Payee', 'Description', 'Reference'])];
  for (const t of txns) {
    lines.push(csvJoin([formatDateUK(t.date), t.amount.toFixed(2), t.payee, t.description, t.reference]));
  }
  return lines.join('\n');
}

/** QuickBooks 4-column bank CSV: Date, Description, Credit (in), Debit (out). */
export function toQuickBooksCsv(txns: AccountingTxn[]): string {
  const lines = [csvJoin(['Date', 'Description', 'Credit', 'Debit'])];
  for (const t of txns) {
    const credit = t.amount > 0 ? t.amount.toFixed(2) : '';
    const debit = t.amount < 0 ? Math.abs(t.amount).toFixed(2) : '';
    // Only prefix the payee when it adds information (avoids "VAT — VAT — …").
    const description = t.description.startsWith(t.payee) ? t.description : `${t.payee} — ${t.description}`;
    lines.push(csvJoin([formatDateUK(t.date), description, credit, debit]));
  }
  return lines.join('\n');
}
