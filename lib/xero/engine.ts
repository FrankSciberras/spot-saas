// =============================================================================
// XERO SYNC ENGINE — decides what to send, in what order, and records the result
// =============================================================================
// Pure orchestration: it is handed Rovora's records (a LocalSnapshot), the sync
// ledger, and an XeroApi, and it never touches the network or the database
// itself. That is what lets tests/xero-sync.test.mjs run every scenario against
// an in-memory Xero.
//
// Guarantees it is built around:
//   1. NOTHING IS CREATED TWICE. A record with a Xero id in the ledger is never
//      created again. If an earlier attempt may have reached Xero without us
//      hearing back (attempted, no id), the engine LOOKS FIRST — by invoice
//      number, by our reference tag — and adopts what it finds.
//   2. ORDER. Customer → invoice → credit note → allocation → payment. Removals
//      go the other way round: a payment deleted in Rovora is removed in Xero
//      before its invoice is voided there.
//   3. ONE-WAY. Rovora only changes records it created, and only to mirror
//      what happened in Rovora (void, delete). It never reads figures back.
//   4. STOP, DON'T HAMMER. A rate limit or a refused token ends the run at once.
//      A record Xero refuses is retried automatically at most every six hours
//      (and immediately when the admin presses Retry, which clears the count).
//   5. EVERY OUTCOME IS WRITTEN DOWN, including "not sent, and why".
// =============================================================================

import {
  buildAllocation,
  buildBankTransaction,
  buildContact,
  buildCreditNote,
  buildInvoice,
  buildPayment,
  fingerprint,
  isXeroSafeNumber,
  missingTaxRates,
  paymentReference,
  rovoraRef,
} from './mapping';
import {
  XeroError,
  type LocalDocument,
  type LocalSnapshot,
  type SyncEntityType,
  type SyncItem,
  type SyncLedger,
  type SyncOutcome,
  type XeroApi,
  type XeroSettings,
} from './types';

export interface SyncContext {
  api: XeroApi;
  ledger: SyncLedger;
  snapshot: LocalSnapshot;
  settings: XeroSettings;
  baseCurrency: string | null;
  /** e.g. https://app.rovora.eu — for "Go to Rovora" links. Null = no links. */
  appBaseUrl: string | null;
  /** Stop starting new work after this many API calls (Xero allows 60 a minute per organisation). */
  maxCalls?: number;
  now?: () => Date;
}

const RETRY_AFTER_MS = 6 * 3600_000;
const DEFAULT_MAX_CALLS = 45;

/** Signals that the whole run must end (rate limit, refused token). */
class StopRun extends Error {
  reason: 'rate_limit' | 'auth';
  retryAfter: number | null;
  detail: string;
  constructor(reason: 'rate_limit' | 'auth', detail: string, retryAfter: number | null = null) {
    super(detail);
    this.reason = reason;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

/** True when a date falls inside the range the admin asked to send (no start date = everything). */
function onOrAfterStart(date: string, settings: XeroSettings): boolean {
  return !settings.sync_from || date >= settings.sync_from;
}

/** What the admin must choose before anything can be sent. */
export function setupProblems(settings: XeroSettings, snapshot: LocalSnapshot): string[] {
  const problems: string[] = [];
  const toSend = snapshot.documents.filter((d) => d.status === 'issued' && onOrAfterStart(d.issue_date, settings));
  if (toSend.length > 0 && !settings.sales_account_code) problems.push('Choose the Xero account your invoices are booked to.');
  const missing = new Set<string>();
  for (const doc of toSend) {
    for (const key of missingTaxRates(doc, settings)) missing.add(key);
  }
  for (const key of [...missing].sort()) problems.push(`Choose a Xero tax rate for ${Number(key)}% VAT.`);
  if ((settings.send_payments || settings.send_bookkeeping) && !settings.bank_account_id) {
    problems.push('Choose the Xero bank account payments go through.');
  }
  return problems;
}

export async function runXeroSync(ctx: SyncContext): Promise<SyncOutcome> {
  const { api, ledger, snapshot, settings } = ctx;
  const now = ctx.now ?? (() => new Date());
  const maxCalls = ctx.maxCalls ?? DEFAULT_MAX_CALLS;
  const outcome: SyncOutcome = {
    sent: 0,
    failed: 0,
    waiting: 0,
    stopped: null,
    retryAfter: null,
    setup: setupProblems(settings, snapshot),
    firstError: null,
  };

  const items = new Map<string, SyncItem>();
  for (const item of await ledger.load()) items.set(`${item.entity_type}:${item.entity_id}`, item);

  const get = (type: SyncEntityType, id: string): SyncItem =>
    items.get(`${type}:${id}`) ?? {
      entity_type: type,
      entity_id: id,
      xero_id: null,
      status: 'pending',
      remote_state: 'none',
      payload_hash: null,
      attempts: 0,
      last_error: null,
      last_attempt_at: null,
      synced_at: null,
      label: null,
      amount: null,
    };

  const put = async (item: SyncItem) => {
    items.set(`${item.entity_type}:${item.entity_id}`, item);
    await ledger.save(item);
  };

  const budgetLeft = () => api.calls < maxCalls;

  /** True when a refused record is still inside its cooling-off period. */
  const coolingOff = (item: SyncItem) =>
    item.status === 'error' &&
    item.last_attempt_at !== null &&
    now().getTime() - Date.parse(item.last_attempt_at) < RETRY_AFTER_MS;

  /** Not sent, and the reason is something the admin or a later run resolves. No API call was made. */
  const wait = async (item: SyncItem, reason: string) => {
    outcome.waiting++;
    if (item.status !== 'pending' || item.last_error !== reason) {
      await put({ ...item, status: 'pending', last_error: reason });
    }
  };

  /** Deliberately never sent. */
  const skip = async (item: SyncItem, reason: string) => {
    if (item.status !== 'skipped' || item.last_error !== reason) {
      await put({ ...item, status: 'skipped', last_error: reason });
    }
  };

  /**
   * Runs one unit of work against Xero and records what happened. Returns the
   * updated item, or null when Xero refused it (already recorded).
   */
  const attempt = async (item: SyncItem, work: (item: SyncItem) => Promise<Partial<SyncItem>>): Promise<SyncItem | null> => {
    const started: SyncItem = { ...item, attempts: item.attempts + 1, last_attempt_at: now().toISOString() };
    try {
      const patch = await work(item);
      const done: SyncItem = { ...started, status: 'synced', last_error: null, synced_at: now().toISOString(), ...patch };
      await put(done);
      if (done.status === 'synced') outcome.sent++;
      else {
        outcome.failed++;
        outcome.firstError ??= done.last_error;
      }
      return done.status === 'synced' ? done : null;
    } catch (error) {
      if (error instanceof XeroError && (error.kind === 'rate_limit' || error.kind === 'auth')) {
        // Nothing wrong with this record: leave it as it was, minus the attempt.
        await put({ ...item, last_attempt_at: started.last_attempt_at });
        throw new StopRun(error.kind, error.message, error.retryAfter);
      }
      const message = error instanceof XeroError ? error.message : 'Something unexpected went wrong sending this to Xero.';
      if (!(error instanceof XeroError)) console.error('xero sync: unexpected error:', error);
      await put({ ...started, status: 'error', last_error: message });
      outcome.failed++;
      outcome.firstError ??= message;
      return null;
    }
  };

  const customers = new Map(snapshot.customers.map((c) => [c.id, c]));
  const documents = new Map(snapshot.documents.map((d) => [d.id, d]));
  const docUrl = (id: string) => (ctx.appBaseUrl ? `${ctx.appBaseUrl.replace(/\/$/, '')}/fleet/invoices/${id}` : null);
  const docLabel = (d: LocalDocument) => `${d.number} · ${d.customer_name}`;
  const docType = (d: LocalDocument): SyncEntityType => (d.kind === 'invoice' ? 'invoice' : 'credit_note');
  /**
   * A document is in scope when it is dated on or after the start date — or it
   * is already in Xero (the start date was moved later afterwards): once sent,
   * a document keeps being mirrored.
   */
  const inScope = (d: LocalDocument) => onOrAfterStart(d.issue_date, settings) || Boolean(get(docType(d), d.id).xero_id);

  /** The Xero contact for a customer, created (or found) on first use. */
  const ensureContact = async (customerId: string): Promise<string | null> => {
    const existing = get('contact', customerId);
    if (existing.xero_id) return existing.xero_id;
    const customer = customers.get(customerId);
    if (!customer) return null;
    if (coolingOff(existing)) return null;
    const done = await attempt({ ...existing, label: customer.name }, async () => {
      // Already there under our id (an earlier attempt), or under the same name
      // (the accountant added them by hand)? Use that one.
      const found = (await api.findContact({ contactNumber: customer.id })) ?? (await api.findContact({ name: customer.name }));
      if (found) {
        if (found.archived) {
          throw new XeroError('validation', `“${customer.name}” is archived in Xero. Restore the contact there, then retry.`);
        }
        return { xero_id: found.id, remote_state: 'active' };
      }
      const created = await api.createContact(buildContact(customer), `contact:${customer.id}`);
      return { xero_id: created.id, remote_state: 'active' };
    });
    return done?.xero_id ?? null;
  };

  /** Creates (or adopts) an invoice or credit note in Xero. */
  const sendDocument = async (doc: LocalDocument) => {
    const item = { ...get(docType(doc), doc.id), label: docLabel(doc), amount: doc.total };
    if (item.xero_id || coolingOff(item)) return;
    if (!isXeroSafeNumber(doc.number)) {
      await wait(item, `Xero only accepts plain letters and numbers in a document number; “${doc.number}” has other characters.`);
      return;
    }
    if (!settings.sales_account_code) {
      await wait(item, 'Choose the Xero account your invoices are booked to.');
      return;
    }
    const missing = missingTaxRates(doc, settings);
    if (missing.length > 0) {
      await wait(item, `Choose a Xero tax rate for ${missing.map((k) => `${Number(k)}%`).join(', ')} VAT.`);
      return;
    }

    let invoiceNumber = '';
    if (doc.kind === 'credit_note') {
      const original = doc.credited_invoice_id ? documents.get(doc.credited_invoice_id) : undefined;
      if (!original || !inScope(original)) {
        await skip(item, 'Its invoice is from before the date you started sending to Xero.');
        return;
      }
      const originalItem = get('invoice', original.id);
      if (!originalItem.xero_id || originalItem.remote_state !== 'active') {
        await wait(item, `Waiting for invoice ${original.number} to reach Xero first.`);
        return;
      }
      invoiceNumber = original.number;
    }

    const contactId = await ensureContact(doc.customer_id);
    if (!contactId) {
      await wait(item, `Waiting for the customer “${doc.customer_name}” to be created in Xero.`);
      return;
    }

    const common = { contactId, settings, baseCurrency: ctx.baseCurrency, url: docUrl(doc.id) };
    const payload = doc.kind === 'invoice' ? buildInvoice(doc, common) : buildCreditNote(doc, { ...common, invoiceNumber });
    const hash = fingerprint(payload);

    await attempt(item, async (current) => {
      // Rule 1: an earlier attempt may have got through. Look before creating.
      let remote = current.attempts > 0
        ? doc.kind === 'invoice'
          ? await api.findInvoiceByNumber(doc.number)
          : await api.findCreditNoteByNumber(doc.number)
        : null;
      if (remote && (remote.status === 'VOIDED' || remote.status === 'DELETED')) {
        throw new XeroError('validation', `${doc.number} already exists in Xero as a ${remote.status.toLowerCase()} document. Xero will not accept the number again.`);
      }
      remote ??= doc.kind === 'invoice'
        ? await api.createInvoice(payload, `${docType(doc)}:${doc.id}:${hash}`)
        : await api.createCreditNote(payload, `${docType(doc)}:${doc.id}:${hash}`);

      const patch: Partial<SyncItem> = { xero_id: remote.id, remote_state: 'active', payload_hash: hash };
      // It exists in Xero now either way; a mismatch is flagged, never "fixed".
      if (Math.round(remote.total * 100) !== Math.round(doc.total * 100)) {
        return {
          ...patch,
          status: 'error',
          last_error: `Xero shows a total of ${remote.total.toFixed(2)} but the document is ${doc.total.toFixed(2)}. Check its tax rate in Xero.`,
        };
      }
      return patch;
    });
  };

  try {
    // ── 1. Payments removed in Rovora → removed in Xero (before any void) ────
    const livePayments = new Map(snapshot.payments.map((p) => [p.id, p]));
    for (const item of [...items.values()]) {
      if (!budgetLeft()) break;
      if (item.entity_type !== 'payment' || item.remote_state !== 'active' || !item.xero_id) continue;
      if (livePayments.has(item.entity_id) || coolingOff(item)) continue;
      await attempt(item, async () => {
        await api.deletePayment(item.xero_id as string);
        return { remote_state: 'deleted' };
      });
    }

    // ── 2. Invoices, oldest first (so numbers reach Xero in order) ───────────
    const issued = snapshot.documents
      .filter((d) => d.status === 'issued' && inScope(d))
      .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number));
    for (const doc of issued.filter((d) => d.kind === 'invoice')) {
      if (!budgetLeft()) break;
      await sendDocument(doc);
    }

    // ── 3. Credit notes ─────────────────────────────────────────────────────
    for (const doc of issued.filter((d) => d.kind === 'credit_note')) {
      if (!budgetLeft()) break;
      await sendDocument(doc);
    }

    // ── 4. Credit applied to invoices ───────────────────────────────────────
    for (const allocation of snapshot.allocations) {
      if (!budgetLeft()) break;
      const item = get('allocation', allocation.id);
      if (item.remote_state === 'active' || coolingOff(item)) continue;
      const credit = documents.get(allocation.credit_note_id);
      const invoice = documents.get(allocation.invoice_id);
      if (!credit || !invoice) continue;
      // Out of scope on either side = never sent; no ledger row, no noise.
      if (!inScope(credit) || !inScope(invoice)) continue;
      const labelled = { ...item, label: `${credit.number} applied to ${invoice.number}`, amount: allocation.amount };
      const creditItem = get('credit_note', credit.id);
      const invoiceItem = get('invoice', invoice.id);
      if (credit.status !== 'issued' || invoice.status !== 'issued') continue;
      if (!creditItem.xero_id || creditItem.remote_state !== 'active' || !invoiceItem.xero_id || invoiceItem.remote_state !== 'active') {
        await wait(labelled, `Waiting for ${!invoiceItem.xero_id ? invoice.number : credit.number} to reach Xero first.`);
        continue;
      }
      const creditXeroId = creditItem.xero_id;
      const invoiceXeroId = invoiceItem.xero_id;
      await attempt(labelled, async (current) => {
        if (current.attempts > 0) {
          const existing = (await api.listAllocations(creditXeroId)).find(
            (a) => a.invoiceId === invoiceXeroId && Math.round(a.amount * 100) === Math.round(allocation.amount * 100),
          );
          if (existing) return { xero_id: existing.id ?? `${creditXeroId}:${invoiceXeroId}`, remote_state: 'active' };
        }
        const made = await api.allocateCredit(
          creditXeroId,
          buildAllocation(allocation.amount, invoiceXeroId, allocation.allocated_on),
          `allocation:${allocation.id}`,
        );
        return { xero_id: made.id ?? `${creditXeroId}:${invoiceXeroId}`, remote_state: 'active' };
      });
    }

    // ── 5. Payments received and refunds paid ───────────────────────────────
    for (const payment of [...snapshot.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
      if (!budgetLeft()) break;
      const item = get('payment', payment.id);
      if (item.remote_state === 'active' || coolingOff(item)) continue;
      const doc = documents.get(payment.invoice_id);
      if (!doc || !inScope(doc)) continue;
      const labelled = {
        ...item,
        label: `${doc.kind === 'invoice' ? 'Payment on' : 'Refund of'} ${doc.number} · ${doc.customer_name}`,
        amount: payment.amount,
      };
      if (!settings.send_payments) {
        await skip(labelled, 'Sending payments to Xero is switched off.');
        continue;
      }
      if (!settings.bank_account_id) {
        await wait(labelled, 'Choose the Xero bank account payments go through.');
        continue;
      }
      if (doc.status !== 'issued') continue;
      const docItem = get(docType(doc), doc.id);
      if (!docItem.xero_id || docItem.remote_state !== 'active') {
        await wait(labelled, `Waiting for ${doc.number} to reach Xero first.`);
        continue;
      }
      const target = { kind: doc.kind, xeroId: docItem.xero_id };
      const bankAccountId = settings.bank_account_id;
      await attempt(labelled, async (current) => {
        if (current.attempts > 0) {
          const existing = await api.findPaymentByReference(paymentReference(payment));
          if (existing && existing.status !== 'DELETED') return { xero_id: existing.id, remote_state: 'active' };
        }
        const made = await api.createPayment(buildPayment(payment, target, bankAccountId), `payment:${payment.id}`);
        return { xero_id: made.id, remote_state: 'active' };
      });
    }

    // ── 6. Documents voided in Rovora ───────────────────────────────────────
    for (const doc of snapshot.documents.filter((d) => d.status === 'void')) {
      if (!budgetLeft()) break;
      const item = { ...get(docType(doc), doc.id), label: docLabel(doc), amount: doc.total };
      if (item.remote_state === 'voided') continue;
      if (!item.xero_id) {
        if (onOrAfterStart(doc.issue_date, settings)) await skip(item, 'Voided before it was sent to Xero.');
        continue;
      }
      if (coolingOff(item)) continue;
      const xeroId = item.xero_id;
      await attempt(item, async () => {
        if (doc.kind === 'invoice') await api.voidInvoice(xeroId);
        else await api.voidCreditNote(xeroId);
        return { remote_state: 'voided' };
      });
    }

    // ── 7. Bookkeeping lines as spend / receive money ───────────────────────
    if (settings.send_bookkeeping) {
      // Removed in Rovora → removed in Xero. "Still exists" comes from a direct
      // check of the ledger's ids, never from the date-limited list below.
      const stillThere = new Set([...snapshot.existingBankLineIds, ...snapshot.bankLines.map((l) => l.id)]);
      for (const item of [...items.values()]) {
        if (!budgetLeft()) break;
        if (item.entity_type !== 'bank_transaction' || item.remote_state !== 'active' || !item.xero_id) continue;
        if (stillThere.has(item.entity_id) || coolingOff(item)) continue;
        await attempt(item, async () => {
          await api.deleteBankTransaction(item.xero_id as string);
          return { remote_state: 'deleted' };
        });
      }
      for (const line of [...snapshot.bankLines].sort((a, b) => a.txn_date.localeCompare(b.txn_date))) {
        if (!budgetLeft()) break;
        const item = {
          ...get('bank_transaction', line.id),
          label: `${line.category_name}${line.counterparty ? ` · ${line.counterparty}` : ''}`,
          amount: line.amount,
        };
        if (coolingOff(item)) continue;
        const accountCode = settings.category_accounts[line.category_id];
        if (!accountCode) {
          if (item.remote_state !== 'active') await wait(item, `Choose a Xero account for the “${line.category_name}” category.`);
          continue;
        }
        if (!settings.bank_account_id) {
          await wait(item, 'Choose the Xero bank account payments go through.');
          continue;
        }
        const payload = buildBankTransaction(line, {
          accountCode,
          bankAccountId: settings.bank_account_id,
          tax: settings.bookkeeping_tax,
          url: ctx.appBaseUrl ? `${ctx.appBaseUrl.replace(/\/$/, '')}/fleet/earnings` : null,
        });
        const hash = fingerprint(payload);
        if (item.remote_state === 'active' && item.xero_id) {
          if (item.payload_hash === hash) continue; // unchanged
          const xeroId = item.xero_id;
          await attempt(item, async () => {
            await api.updateBankTransaction(xeroId, payload);
            return { payload_hash: hash };
          });
          continue;
        }
        await attempt(item, async (current) => {
          if (current.attempts > 0) {
            const existing = await api.findBankTransactionByReference(rovoraRef(line.id));
            if (existing && existing.status !== 'DELETED') return { xero_id: existing.id, remote_state: 'active', payload_hash: hash };
          }
          const made = await api.createBankTransaction(payload, `bank:${line.id}:${hash}`);
          return { xero_id: made.id, remote_state: 'active', payload_hash: hash };
        });
      }
    }

    if (!budgetLeft()) outcome.stopped = 'budget';
  } catch (error) {
    if (!(error instanceof StopRun)) throw error;
    outcome.stopped = error.reason;
    outcome.retryAfter = error.retryAfter;
    outcome.firstError ??= error.detail;
  }

  return outcome;
}
