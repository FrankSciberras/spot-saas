// =============================================================================
// XERO — turning Rovora records into Xero requests (pure; no I/O)
// =============================================================================
// Every function here is deterministic: the same record always produces the
// same payload, so a retry sends exactly what the first attempt sent.
//
// Amounts: Rovora stores each line's net and VAT already rounded to the cent
// (lib/invoices/math.ts, mirrored by invoice_issue in SQL). Xero rounds a
// line the same way (quantity × unit amount to 2 d.p.), and we send our VAT
// amount explicitly per line, so Xero's totals come out identical to the
// document the customer received. The sync still compares totals afterwards.
// =============================================================================

import { taxRateKey, type LocalBankLine, type LocalCustomer, type LocalDocument, type LocalPayment, type XeroSettings } from './types';

/** Short, stable, human-typeable tag that ties a Xero record to a Rovora one. */
export function rovoraRef(id: string): string {
  return `RV-${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

/** Reference stored on a Xero payment: our tag, then whatever the admin typed. */
export function paymentReference(payment: LocalPayment): string {
  // Quotes and backslashes are dropped so the reference can be looked up again
  // with an exact-match filter (see findPaymentByReference).
  const typed = (payment.reference ?? '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
  return (typed ? `${rovoraRef(payment.id)} ${typed}` : rovoraRef(payment.id)).slice(0, 250);
}

/** FNV-1a (64-bit) of a JSON value — a fingerprint for change detection, not security. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Xero invoice numbers allow printable ASCII only. */
export function isXeroSafeNumber(number: string): boolean {
  return /^[\x20-\x7E]{1,255}$/.test(number);
}

const cap = (text: string | null | undefined, max: number): string | undefined => {
  const t = (text ?? '').trim();
  return t ? t.slice(0, max) : undefined;
};

export function buildContact(customer: LocalCustomer): Record<string, unknown> {
  const lines = (customer.address ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const payload: Record<string, unknown> = {
    // Shown as "Contact code" in Xero; lets us find the contact again by id.
    ContactNumber: customer.id,
    Name: customer.name.trim().slice(0, 255),
  };
  const email = cap(customer.email, 255);
  if (email) payload.EmailAddress = email;
  const tax = cap(customer.vat_number, 50);
  if (tax) payload.TaxNumber = tax;
  if (lines.length > 0) {
    payload.Addresses = [
      {
        AddressType: 'POBOX', // Xero's "postal address", the one printed on invoices
        AddressLine1: lines[0]?.slice(0, 500),
        AddressLine2: lines[1]?.slice(0, 500),
        AddressLine3: lines[2]?.slice(0, 500),
        AddressLine4: lines.slice(3).join(', ').slice(0, 500) || undefined,
      },
    ];
  }
  const phone = cap(customer.phone, 50);
  if (phone) payload.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: phone }];
  return payload;
}

/** VAT rates used on a document that have no Xero tax rate chosen yet. */
export function missingTaxRates(doc: LocalDocument, settings: XeroSettings): string[] {
  const missing = new Set<string>();
  for (const line of doc.lines) {
    const key = taxRateKey(line.tax_rate);
    if (!settings.tax_types[key]) missing.add(key);
  }
  return [...missing];
}

function buildLines(doc: LocalDocument, settings: XeroSettings): Record<string, unknown>[] {
  return doc.lines.map((line) => ({
    Description: line.description.slice(0, 4000),
    Quantity: line.quantity,
    UnitAmount: line.unit_price,
    AccountCode: settings.sales_account_code,
    TaxType: settings.tax_types[taxRateKey(line.tax_rate)],
    // Ours, to the cent — so Xero cannot round its way to a different total.
    TaxAmount: line.line_tax,
    LineAmount: line.line_net,
  }));
}

export interface DocumentContext {
  contactId: string;
  settings: XeroSettings;
  /** Xero organisation's base currency; a different document currency is sent explicitly. */
  baseCurrency: string | null;
  /** Absolute https URL of the document in Rovora ("Go to Rovora" in Xero). */
  url: string | null;
}

export function buildInvoice(doc: LocalDocument, ctx: DocumentContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    Type: 'ACCREC',
    Contact: { ContactID: ctx.contactId },
    InvoiceNumber: doc.number,
    Date: doc.issue_date,
    DueDate: doc.due_date,
    Status: 'AUTHORISED',
    LineAmountTypes: 'Exclusive',
    LineItems: buildLines(doc, ctx.settings),
  };
  const reference = cap(doc.reference, 255);
  if (reference) payload.Reference = reference;
  if (ctx.baseCurrency && doc.currency !== ctx.baseCurrency) payload.CurrencyCode = doc.currency;
  if (ctx.url) payload.Url = ctx.url;
  return payload;
}

export function buildCreditNote(doc: LocalDocument, ctx: DocumentContext & { invoiceNumber: string }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    Type: 'ACCRECCREDIT',
    Contact: { ContactID: ctx.contactId },
    CreditNoteNumber: doc.number,
    // The invoice it corrects, so the link is visible in Xero too.
    Reference: `${ctx.invoiceNumber}${doc.credit_reason ? ` – ${doc.credit_reason.trim()}` : ''}`.slice(0, 255),
    Date: doc.issue_date,
    Status: 'AUTHORISED',
    LineAmountTypes: 'Exclusive',
    LineItems: buildLines(doc, ctx.settings),
  };
  if (ctx.baseCurrency && doc.currency !== ctx.baseCurrency) payload.CurrencyCode = doc.currency;
  return payload;
}

/**
 * Applies part of a credit note to an invoice. No date is sent: Xero sets it
 * itself (the later of the two documents' dates) and treats the field as
 * read-only.
 */
export function buildAllocation(amount: number, invoiceXeroId: string): Record<string, unknown> {
  return { Amount: amount, Invoice: { InvoiceID: invoiceXeroId } };
}

/** A payment received on an invoice, or a refund paid out on a credit note. */
export function buildPayment(
  payment: LocalPayment,
  target: { kind: 'invoice' | 'credit_note'; xeroId: string },
  bankAccountId: string,
): Record<string, unknown> {
  return {
    ...(target.kind === 'invoice' ? { Invoice: { InvoiceID: target.xeroId } } : { CreditNote: { CreditNoteID: target.xeroId } }),
    Account: { AccountID: bankAccountId },
    Date: payment.paid_on,
    Amount: payment.amount,
    Reference: paymentReference(payment),
  };
}

/** A bookkeeping line as spend money (expense) or receive money (income). */
export function buildBankTransaction(
  line: LocalBankLine,
  ctx: { accountCode: string; bankAccountId: string; tax: 'NoTax' | 'Inclusive'; url: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    Type: line.kind === 'income' ? 'RECEIVE' : 'SPEND',
    // Xero requires a contact; lines with no payee share one generic contact.
    Contact: { Name: (line.counterparty ?? '').trim().slice(0, 255) || 'Rovora (no payee recorded)' },
    BankAccount: { AccountID: ctx.bankAccountId },
    Date: line.txn_date,
    Reference: rovoraRef(line.id),
    LineAmountTypes: ctx.tax,
    LineItems: [
      {
        Description: ((line.description ?? '').trim() || line.category_name).slice(0, 4000),
        Quantity: 1,
        UnitAmount: line.amount,
        AccountCode: ctx.accountCode,
      },
    ],
  };
  if (ctx.url) payload.Url = ctx.url;
  return payload;
}

/** Deep link that opens a record in the Xero web app. */
export function xeroLink(shortCode: string | null, type: 'invoice' | 'credit_note' | 'bank_transaction' | 'contact', xeroId: string): string | null {
  if (!shortCode) return null;
  const path =
    type === 'invoice'
      ? `/AccountsReceivable/View.aspx?InvoiceID=${xeroId}`
      : type === 'credit_note'
        ? `/AccountsReceivable/ViewCreditNote.aspx?creditNoteID=${xeroId}`
        : type === 'bank_transaction'
          ? `/Bank/ViewTransaction.aspx?bankTransactionID=${xeroId}`
          : `/Contacts/View/${xeroId}`;
  return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(shortCode)}&redirecturl=${encodeURIComponent(path)}`;
}
