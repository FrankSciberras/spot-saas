// =============================================================================
// XERO — shared types (no server imports; safe in client components and tests)
// =============================================================================

/** What the admin chooses on the Xero page. Stored in xero_connections.settings. */
export interface XeroSettings {
  /** Only records dated on or after this day are sent (YYYY-MM-DD). */
  sync_from: string | null;
  /** Send automatically (hourly, and right after a change). Off = only "Sync now". */
  auto_sync: boolean;
  /** Xero revenue account code every invoice line is booked to, e.g. "200". */
  sales_account_code: string | null;
  /** VAT rate → Xero TaxType. Keys are rates with two decimals: "18.00". */
  tax_types: Record<string, string>;
  /** Send payments and refunds recorded in Rovora. Needs a bank account. */
  send_payments: boolean;
  /** Xero AccountID of the bank account money is received into / paid from. */
  bank_account_id: string | null;
  /** Also send bookkeeping lines as spend / receive money. */
  send_bookkeeping: boolean;
  /** 'NoTax' = amounts as they are; 'Inclusive' = Xero splits out the account's default tax. */
  bookkeeping_tax: 'NoTax' | 'Inclusive';
  /** Rovora bookkeeping category id → Xero account code. */
  category_accounts: Record<string, string>;
}

export const DEFAULT_XERO_SETTINGS: XeroSettings = {
  sync_from: null,
  auto_sync: true,
  sales_account_code: null,
  tax_types: {},
  send_payments: false,
  bank_account_id: null,
  send_bookkeeping: false,
  bookkeeping_tax: 'NoTax',
  category_accounts: {},
};

/** Reads whatever is stored and returns a complete, well-typed settings object. */
export function normaliseXeroSettings(raw: unknown): XeroSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const map = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const s = str(val);
        if (s && k.length <= 60) out[k] = s;
      }
    }
    return out;
  };
  const date = str(r.sync_from, 10);
  return {
    sync_from: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    auto_sync: r.auto_sync !== false,
    sales_account_code: str(r.sales_account_code, 20),
    tax_types: map(r.tax_types),
    send_payments: r.send_payments === true,
    bank_account_id: str(r.bank_account_id, 60),
    send_bookkeeping: r.send_bookkeeping === true,
    bookkeeping_tax: r.bookkeeping_tax === 'Inclusive' ? 'Inclusive' : 'NoTax',
    category_accounts: map(r.category_accounts),
  };
}

/** "18" / 18 / "18.0" → "18.00": the key used in XeroSettings.tax_types. */
export function taxRateKey(rate: number | string): string {
  const n = typeof rate === 'number' ? rate : Number(String(rate).replace(',', '.'));
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export type SyncEntityType = 'contact' | 'invoice' | 'credit_note' | 'allocation' | 'payment' | 'bank_transaction';
export type SyncStatus = 'pending' | 'synced' | 'error' | 'skipped';
export type RemoteState = 'none' | 'active' | 'voided' | 'deleted';

export interface SyncItem {
  entity_type: SyncEntityType;
  entity_id: string;
  xero_id: string | null;
  status: SyncStatus;
  remote_state: RemoteState;
  payload_hash: string | null;
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  synced_at: string | null;
  label: string | null;
  amount: number | null;
}

// ── What the sync needs to know about Rovora's side ─────────────────────────

export interface LocalCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
}

export interface LocalLine {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_net: number;
  line_tax: number;
}

export interface LocalDocument {
  id: string;
  kind: 'invoice' | 'credit_note';
  status: 'issued' | 'void';
  number: string;
  customer_id: string;
  customer_name: string;
  credited_invoice_id: string | null;
  credit_reason: string | null;
  issue_date: string;
  due_date: string;
  currency: string;
  reference: string | null;
  total: number;
  lines: LocalLine[];
}

export interface LocalAllocation {
  id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  allocated_on: string;
}

export interface LocalPayment {
  id: string;
  invoice_id: string;
  paid_on: string;
  amount: number;
  reference: string | null;
}

export interface LocalBankLine {
  id: string;
  txn_date: string;
  category_id: string;
  category_name: string;
  kind: 'income' | 'expense';
  amount: number;
  description: string | null;
  counterparty: string | null;
}

/**
 * Rovora's side, for one fleet. Deliberately NOT cut down by the sync start
 * date: the engine applies that date itself, and it must be able to tell "this
 * payment was deleted" from "this payment is older than the start date" —
 * mixing those up would delete things in Xero.
 */
export interface LocalSnapshot {
  customers: LocalCustomer[];
  /** Every issued and void document. */
  documents: LocalDocument[];
  allocations: LocalAllocation[];
  /** Every payment and refund that exists. */
  payments: LocalPayment[];
  /** Bookkeeping lines dated on or after the start date (never the ones invoice payments posted). Empty unless enabled. */
  bankLines: LocalBankLine[];
  /** Of the bookkeeping lines already in the sync ledger, the ids that still exist in Rovora. */
  existingBankLineIds: string[];
}

// ── Xero's side ─────────────────────────────────────────────────────────────

export interface XeroAccount {
  AccountID: string;
  Code: string | null;
  Name: string;
  Type: string;
  Status: string;
  TaxType?: string | null;
  EnablePaymentsToAccount?: boolean;
}

export interface XeroTaxRate {
  Name: string;
  TaxType: string;
  Status: string;
  EffectiveRate: number;
  CanApplyToRevenue?: boolean;
}

export interface XeroOrganisation {
  Name: string;
  BaseCurrency: string;
  CountryCode: string;
  ShortCode: string | null;
}

/** Thrown for every failed Xero call, with a sentence fit to show an admin. */
export class XeroError extends Error {
  kind: 'validation' | 'auth' | 'rate_limit' | 'not_found' | 'transient' | 'config';
  /** Seconds to wait, for rate limits. */
  retryAfter: number | null;
  status: number | null;
  constructor(kind: XeroError['kind'], message: string, opts: { retryAfter?: number | null; status?: number | null } = {}) {
    super(message);
    this.name = 'XeroError';
    this.kind = kind;
    this.retryAfter = opts.retryAfter ?? null;
    this.status = opts.status ?? null;
  }
}

export interface RemoteDocument {
  id: string;
  number: string | null;
  status: string;
  total: number;
}

/**
 * The handful of Xero calls the sync makes. lib/xero/client.ts implements it
 * over HTTPS; tests/xero-sync.test.mjs implements it in memory.
 */
export interface XeroApi {
  /** API calls made so far in this run (for the per-run budget). */
  readonly calls: number;
  findContact(by: { contactNumber?: string; name?: string }): Promise<{ id: string; archived: boolean } | null>;
  createContact(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  findInvoiceByNumber(number: string): Promise<RemoteDocument | null>;
  createInvoice(payload: Record<string, unknown>, idempotencyKey: string): Promise<RemoteDocument>;
  voidInvoice(id: string): Promise<void>;
  findCreditNoteByNumber(number: string): Promise<RemoteDocument | null>;
  createCreditNote(payload: Record<string, unknown>, idempotencyKey: string): Promise<RemoteDocument>;
  voidCreditNote(id: string): Promise<void>;
  listAllocations(creditNoteId: string): Promise<{ id: string | null; invoiceId: string; amount: number }[]>;
  allocateCredit(creditNoteId: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string | null }>;
  findPaymentByReference(reference: string): Promise<{ id: string; status: string } | null>;
  createPayment(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  deletePayment(id: string): Promise<void>;
  findBankTransactionByReference(reference: string): Promise<{ id: string; status: string } | null>;
  createBankTransaction(payload: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  updateBankTransaction(id: string, payload: Record<string, unknown>): Promise<void>;
  deleteBankTransaction(id: string): Promise<void>;
}

/** Where sync results are written. Supabase in production, a Map in tests. */
export interface SyncLedger {
  load(): Promise<SyncItem[]>;
  save(item: SyncItem): Promise<void>;
}

export interface SyncOutcome {
  /** Records created, updated, voided or removed in Xero this run. */
  sent: number;
  /** Records Xero refused this run. */
  failed: number;
  /** Records still waiting: on setup, on another record, or on the next run. */
  waiting: number;
  /** Why the run ended early, if it did. */
  stopped: 'rate_limit' | 'auth' | 'budget' | null;
  /** Seconds Xero asked us to wait (rate limit). */
  retryAfter: number | null;
  /** Things the admin has to choose before records can be sent. */
  setup: string[];
  /** First error worth showing at the top of the page. */
  firstError: string | null;
}
