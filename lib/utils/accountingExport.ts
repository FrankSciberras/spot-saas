// =============================================================================
// ACCOUNTING EXPORT — QuickBooks / Xero-ready CSV generation (client-safe)
// =============================================================================
// Turns bookkeeping periods into individual signed transactions and renders
// them in the two formats accountants actually import:
//   • Xero  — bank statement CSV: *Date, *Amount, Payee, Description, Reference
//   • QuickBooks — 4-column bank CSV: Date, Description, Credit, Debit
// Positive amounts are money IN, negative are money OUT. Dates render as
// DD/MM/YYYY, which both importers accept.
//
// This used to re-list the twelve fixed columns by hand, so every new category
// meant editing this file too. It now walks whatever categories the fleet has
// defined — the export widens automatically.
// Pure functions only — the download itself happens in the dashboard via the
// existing Blob helper.
// =============================================================================

import type { BookkeepingPeriodWithEntries } from '@/lib/types/database';
import type { FinanceCategory } from '@/lib/config/financeCategories';

export interface AccountingTxn {
  /** ISO date (YYYY-MM-DD) the transaction is recognised on (period end). */
  date: string;
  payee: string;
  description: string;
  /** e.g. the period label, so lines trace back to a set of books. */
  reference: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function periodReference(period: BookkeepingPeriodWithEntries): string {
  return period.name || period.label || `${period.start_date} to ${period.end_date}`;
}

/**
 * Flatten periods into one signed transaction per non-zero entry.
 *
 * Entries whose category has since been deleted are skipped rather than
 * exported under a blank payee — an unlabelled line in someone's accounts is
 * worse than a missing one, and the DB blocks deleting a used category anyway.
 */
export function buildBookkeepingTxns(
  periods: BookkeepingPeriodWithEntries[],
  categories: FinanceCategory[],
): AccountingTxn[] {
  const byId = new Map<string, FinanceCategory>();
  categories.forEach((c) => byId.set(c.id, c));

  const txns: AccountingTxn[] = [];

  for (const period of periods) {
    const date = (period.end_date || period.start_date || '').split('T')[0];
    const reference = periodReference(period);

    // Stable output order: income first, then expenses, each in display order.
    const entries = [...(period.entries || [])].sort((a, b) => {
      const ca = byId.get(a.category_id);
      const cb = byId.get(b.category_id);
      if (!ca || !cb) return 0;
      if (ca.kind !== cb.kind) return ca.kind === 'income' ? -1 : 1;
      return ca.sortOrder - cb.sortOrder;
    });

    for (const entry of entries) {
      const category = byId.get(entry.category_id);
      const value = Number(entry.amount) || 0;
      if (!category || value <= 0) continue;

      const signed = category.kind === 'income' ? value : -value;
      txns.push({
        date,
        payee: category.name,
        description: `${category.name} — ${reference}`,
        reference,
        amount: round2(signed),
      });
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
