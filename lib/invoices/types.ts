// =============================================================================
// INVOICES — shared types (no server imports; safe in client components)
// =============================================================================
// Rows are kept in the database's own snake_case shape. Money columns arrive
// from Postgres as numbers with two decimals; anything that does arithmetic on
// them goes through lib/invoices/math.ts (whole cents), never plain floats.
// =============================================================================

import type { DisplayStatus, DocumentKind, StoredStatus } from './math';

export type { DisplayStatus, DocumentKind, StoredStatus };

export type PaymentMethod = 'cash' | 'card' | 'bank' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

/** Where the fleet's time zone comes from everywhere else in the app. */
export const INVOICE_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

export interface InvoiceSettings {
  organization_id: string;
  invoice_prefix: string;
  credit_note_prefix: string;
  next_invoice_number: number;
  next_credit_note_number: number;
  number_padding: number;
  default_tax_rate: number;
  payment_terms_days: number;
  payment_instructions: string | null;
  footer_note: string | null;
  record_payments_in_books: boolean;
  income_category_id: string | null;
  refund_category_id: string | null;
}

export interface InvoiceCustomer {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vat_number: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_net: number;
  line_tax: number;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  paid_on: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  finance_transaction_id: string | null;
  created_at: string;
}

export interface InvoiceDocument {
  id: string;
  organization_id: string;
  kind: DocumentKind;
  status: StoredStatus;
  number: string | null;
  number_seq: number | null;
  customer_id: string;
  credited_invoice_id: string | null;
  credit_reason: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  tax_total: number;
  total: number;
  customer_name: string | null;
  customer_address: string | null;
  customer_vat_number: string | null;
  customer_email: string | null;
  seller_name: string | null;
  seller_address: string | null;
  seller_vat_number: string | null;
  seller_email: string | null;
  seller_phone: string | null;
  payment_instructions: string | null;
  footer_note: string | null;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  sent_at: string | null;
  sent_to: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of the list: the document plus what a person needs to see at a glance. */
export interface DocumentSummary extends InvoiceDocument {
  /** Live customer name for drafts; the snapshot once issued. */
  display_customer: string;
  /** Cents received (invoice) or refunded (credit note). */
  paid_cents: number;
  /** Cents of credit notes applied to this invoice, or of this credit note applied to invoices. */
  credited_cents: number;
  /** Cents still owed (invoice) or still refundable (credit note). 0 unless issued. */
  balance_cents: number;
  display_status: DisplayStatus;
}

export interface CreditAllocation {
  id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: number;
  allocated_on: string;
  /** Number of the document at the other end, for display. */
  other_number: string | null;
}

/** Everything the document page shows. */
export interface DocumentDetail extends DocumentSummary {
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  allocations: CreditAllocation[];
  customer: InvoiceCustomer | null;
  /** Credit notes: the invoice being corrected. */
  credited_invoice: { id: string; number: string | null; total: number; issue_date: string | null } | null;
  /** Invoices: credit notes raised against it (drafts included). */
  credit_notes: { id: string; number: string | null; status: StoredStatus; total: number; issue_date: string | null }[];
  /** Invoices: cents that could still be credited (total − issued credit notes). */
  creditable_cents: number;
}

/** A line as typed in the editor. Strings, because that is what inputs hold. */
export interface DraftLineInput {
  description: string;
  quantity: string | number;
  unit_price: string | number;
  tax_rate: string | number;
}

export interface DraftInput {
  id?: string | null;
  kind: DocumentKind;
  customer_id: string;
  credited_invoice_id?: string | null;
  credit_reason?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  reference?: string | null;
  notes?: string | null;
  lines: DraftLineInput[];
}

export interface CustomerInput {
  id?: string | null;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  vat_number?: string | null;
  notes?: string | null;
}

export interface InvoiceSettingsInput {
  invoice_prefix: string;
  credit_note_prefix: string;
  next_invoice_number: number;
  next_credit_note_number: number;
  number_padding: number;
  default_tax_rate: number | string;
  payment_terms_days: number;
  payment_instructions: string | null;
  footer_note: string | null;
  record_payments_in_books: boolean;
  income_category_id: string | null;
  refund_category_id: string | null;
}

/** Result of every invoice action: either it worked, or a sentence to show. */
export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export const INVOICE_LIMITS = {
  maxLines: 100,
  maxDescription: 500,
  /** numeric(12,2) holds up to 9,999,999,999.99; stay well inside it. */
  maxAmountCents: 99_999_999_99,
} as const;
