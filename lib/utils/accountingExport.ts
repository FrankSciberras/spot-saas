// =============================================================================
// ACCOUNTING EXPORT — QuickBooks / Xero-ready CSV generation (client-safe)
// =============================================================================
// Turns ledger transactions into signed lines and renders them in the two
// formats accountants actually import:
//   • Xero  — bank statement CSV: *Date, *Amount, Payee, Description, Reference
//   • QuickBooks — 4-column bank CSV: Date, Description, Credit, Debit
// Positive amounts are money IN, negative are money OUT. Dates render as
// DD/MM/YYYY, which both importers accept.
//
// This used to flatten period sheets into one line per category per period,
// dated on the period end. Now that the books are a real ledger every export
// line IS a real transaction — its own date, what it was, who it was paid to —
// which is exactly what a bank-statement import expects.
// Pure functions only — the download itself happens in the dashboard via the
// existing Blob helper.
// =============================================================================

import type { FinanceTransaction } from '@/lib/types/database';
import type { FinanceCategory } from '@/lib/config/financeCategories';

export interface AccountingTxn {
  /** ISO date (YYYY-MM-DD) the transaction happened on. */
  date: string;
  payee: string;
  description: string;
  /** Category name, so lines group cleanly on the accountant's side. */
  reference: string;
  /** Signed: positive = money in, negative = money out. */
  amount: number;
}

type LedgerLike = Pick<FinanceTransaction, 'txn_date' | 'category_id' | 'amount' | 'description' | 'counterparty'>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One signed line per transaction, oldest first.
 *
 * Lines whose category has since been deleted are skipped rather than
 * exported under a blank payee — an unlabelled line in someone's accounts is
 * worse than a missing one, and the DB blocks deleting a used category anyway.
 */
export function buildBookkeepingTxns(
  transactions: LedgerLike[],
  categories: FinanceCategory[],
): AccountingTxn[] {
  const byId = new Map<string, FinanceCategory>();
  categories.forEach((c) => byId.set(c.id, c));

  const txns: AccountingTxn[] = [];

  for (const t of transactions) {
    const category = byId.get(t.category_id);
    const value = Number(t.amount) || 0;
    if (!category || value <= 0) continue;

    const signed = category.kind === 'income' ? value : -value;
    const payee = (t.counterparty || '').trim() || category.name;
    const what = (t.description || '').trim();
    txns.push({
      date: t.txn_date.split('T')[0],
      payee,
      description: what ? `${what} — ${category.name}` : category.name,
      reference: category.name,
      amount: round2(signed),
    });
  }

  txns.sort((a, b) => a.date.localeCompare(b.date));
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
