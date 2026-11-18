// The parts of a Xero organisation's chart of accounts and tax rates the
// mapping screen offers. Plain module (no I/O) shared by the page and actions.
import type { XeroAccount, XeroTaxRate } from './types';

export interface XeroReferenceData {
  /** Revenue accounts an invoice line can be booked to. */
  salesAccounts: { code: string; name: string }[];
  /** Accounts a payment can go through (bank accounts, and others enabled for payments). */
  bankAccounts: { id: string; code: string | null; name: string }[];
  /** Accounts a bookkeeping line can be booked to (everything with a code that isn't a bank account). */
  ledgerAccounts: { code: string; name: string; type: string }[];
  taxRates: { taxType: string; name: string; rate: number }[];
}

export function shapeReferenceData(accounts: XeroAccount[], taxRates: XeroTaxRate[]): XeroReferenceData {
  const withCode = accounts.filter((a) => a.Code);
  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, undefined, { numeric: true });
  return {
    salesAccounts: withCode
      .filter((a) => ['REVENUE', 'SALES', 'OTHERINCOME'].includes(a.Type))
      .map((a) => ({ code: a.Code as string, name: a.Name }))
      .sort(byCode),
    bankAccounts: accounts
      .filter((a) => a.Type === 'BANK' || a.EnablePaymentsToAccount)
      .map((a) => ({ id: a.AccountID, code: a.Code, name: a.Name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ledgerAccounts: withCode
      .filter((a) => a.Type !== 'BANK')
      .map((a) => ({ code: a.Code as string, name: a.Name, type: a.Type }))
      .sort(byCode),
    taxRates: taxRates
      .filter((t) => t.CanApplyToRevenue !== false)
      .map((t) => ({ taxType: t.TaxType, name: t.Name, rate: t.EffectiveRate }))
      .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name)),
  };
}
