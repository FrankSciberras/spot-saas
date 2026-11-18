// The Xero sync engine against an in-memory Xero that enforces Xero's rules.
//   node --import ./tests/register.mjs --test tests/xero-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runXeroSync } from '../lib/xero/engine.ts';
import { XeroError, DEFAULT_XERO_SETTINGS } from '../lib/xero/types.ts';
import { rovoraRef, paymentReference } from '../lib/xero/mapping.ts';

// ── A small Xero ────────────────────────────────────────────────────────────
class FakeXero {
  calls = 0;
  seq = 0;
  contacts = [];
  invoices = [];
  creditNotes = [];
  payments = [];
  bank = [];
  /** { method: [errorOrFn, …] } — consumed one per call. 'lost' = do the work, then fail. */
  faults = {};
  rateLimitAfter = Infinity;
  totalSkew = 0;
  log = [];

  id(prefix) { return `${prefix}-${++this.seq}`; }
  fail(method, ...faults) { this.faults[method] = [...(this.faults[method] ?? []), ...faults]; }
  async hit(method, work) {
    this.calls++;
    this.log.push(method);
    if (this.calls > this.rateLimitAfter) throw new XeroError('rate_limit', 'Xero asked us to slow down.', { retryAfter: 42 });
    const fault = this.faults[method]?.shift();
    if (fault === 'lost') {
      await work();
      throw new XeroError('transient', 'Xero did not answer in time.');
    }
    if (fault) throw fault;
    return work();
  }
  due(inv) {
    const paid = this.payments.filter((p) => p.status !== 'DELETED' && p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
    const credited = this.creditNotes.flatMap((c) => c.allocations).filter((a) => a.invoiceId === inv.id).reduce((s, a) => s + a.amount, 0);
    return Math.round((inv.total - paid - credited) * 100) / 100 + 0; // + 0 turns -0 into 0
  }
  remaining(cn) {
    const used = cn.allocations.reduce((s, a) => s + a.amount, 0);
    const refunded = this.payments.filter((p) => p.status !== 'DELETED' && p.creditNoteId === cn.id).reduce((s, p) => s + p.amount, 0);
    return Math.round((cn.total - used - refunded) * 100) / 100;
  }
  totalOf(payload) {
    return Math.round(payload.LineItems.reduce((s, l) => s + Math.round(l.Quantity * l.UnitAmount * 100) / 100 + l.TaxAmount, 0) * 100) / 100 + this.totalSkew;
  }

  findContact = ({ contactNumber, name }) => this.hit('findContact', () => {
    const c = this.contacts.find((x) => (contactNumber ? x.number === contactNumber : x.name.toLowerCase() === name.toLowerCase()));
    return c ? { id: c.id, archived: c.archived } : null;
  });
  createContact = (payload) => this.hit('createContact', () => {
    if (this.contacts.some((c) => c.name.toLowerCase() === payload.Name.toLowerCase())) throw new XeroError('validation', 'The contact name must be unique.');
    const c = { id: this.id('C'), number: payload.ContactNumber, name: payload.Name, archived: false, payload };
    this.contacts.push(c);
    return { id: c.id };
  });
  remote = (d) => ({ id: d.id, number: d.number, status: d.status, total: d.total });
  findInvoiceByNumber = (number) => this.hit('findInvoiceByNumber', () => {
    const i = this.invoices.find((x) => x.number === number);
    return i ? this.remote(i) : null;
  });
  createInvoice = (payload) => this.hit('createInvoice', () => {
    if (this.invoices.some((i) => i.number === payload.InvoiceNumber)) throw new XeroError('validation', 'Invoice # must be unique.');
    if (!this.contacts.some((c) => c.id === payload.Contact.ContactID)) throw new XeroError('validation', 'Contact not found.');
    const i = { id: this.id('I'), number: payload.InvoiceNumber, status: 'AUTHORISED', total: this.totalOf(payload), payload };
    this.invoices.push(i);
    return this.remote(i);
  });
  voidInvoice = (id) => this.hit('voidInvoice', () => {
    const i = this.invoices.find((x) => x.id === id);
    if (!i) throw new XeroError('not_found', 'Invoice not found.');
    if (this.due(i) !== i.total) throw new XeroError('validation', 'Invoice not of valid status for modification: it has payments or credit applied.');
    i.status = 'VOIDED';
  });
  findCreditNoteByNumber = (number) => this.hit('findCreditNoteByNumber', () => {
    const c = this.creditNotes.find((x) => x.number === number);
    return c ? this.remote(c) : null;
  });
  createCreditNote = (payload) => this.hit('createCreditNote', () => {
    if (this.creditNotes.some((c) => c.number === payload.CreditNoteNumber)) throw new XeroError('validation', 'Credit note # must be unique.');
    const c = { id: this.id('CN'), number: payload.CreditNoteNumber, status: 'AUTHORISED', total: this.totalOf(payload), allocations: [], payload };
    this.creditNotes.push(c);
    return this.remote(c);
  });
  voidCreditNote = (id) => this.hit('voidCreditNote', () => {
    const c = this.creditNotes.find((x) => x.id === id);
    if (c.allocations.length || this.remaining(c) !== c.total) throw new XeroError('validation', 'Credit note has been allocated or refunded.');
    c.status = 'VOIDED';
  });
  listAllocations = (id) => this.hit('listAllocations', () => this.creditNotes.find((c) => c.id === id).allocations.map((a) => ({ ...a })));
  allocateCredit = (id, payload) => this.hit('allocateCredit', () => {
    const c = this.creditNotes.find((x) => x.id === id);
    const inv = this.invoices.find((x) => x.id === payload.Invoice.InvoiceID);
    if (!c || !inv) throw new XeroError('not_found', 'Not found.');
    if (payload.Amount > this.remaining(c) || payload.Amount > this.due(inv)) throw new XeroError('validation', 'Allocation exceeds the amount available.');
    const a = { id: this.id('A'), invoiceId: inv.id, amount: payload.Amount };
    c.allocations.push(a);
    return { id: a.id };
  });
  findPaymentByReference = (reference) => this.hit('findPaymentByReference', () => {
    const p = this.payments.find((x) => x.reference === reference);
    return p ? { id: p.id, status: p.status } : null;
  });
  createPayment = (payload) => this.hit('createPayment', () => {
    const p = { id: this.id('P'), status: 'AUTHORISED', amount: payload.Amount, reference: payload.Reference, account: payload.Account.AccountID, payload };
    if (payload.Invoice) {
      const inv = this.invoices.find((x) => x.id === payload.Invoice.InvoiceID);
      if (!inv || inv.status !== 'AUTHORISED') throw new XeroError('validation', 'Invoice could not be found or is not approved.');
      if (payload.Amount > this.due(inv)) throw new XeroError('validation', 'Payment amount exceeds the amount outstanding on this document.');
      p.invoiceId = inv.id;
    } else {
      const cn = this.creditNotes.find((x) => x.id === payload.CreditNote.CreditNoteID);
      if (!cn) throw new XeroError('validation', 'Credit note could not be found.');
      if (payload.Amount > this.remaining(cn)) throw new XeroError('validation', 'Refund exceeds the credit remaining.');
      p.creditNoteId = cn.id;
    }
    this.payments.push(p);
    return { id: p.id };
  });
  deletePayment = (id) => this.hit('deletePayment', () => { this.payments.find((p) => p.id === id).status = 'DELETED'; });
  findBankTransactionByReference = (reference) => this.hit('findBankTransactionByReference', () => {
    const b = this.bank.find((x) => x.reference === reference);
    return b ? { id: b.id, status: b.status } : null;
  });
  createBankTransaction = (payload) => this.hit('createBankTransaction', () => {
    const b = { id: this.id('B'), status: 'AUTHORISED', reference: payload.Reference, payload };
    this.bank.push(b);
    return { id: b.id };
  });
  updateBankTransaction = (id, payload) => this.hit('updateBankTransaction', () => { this.bank.find((b) => b.id === id).payload = payload; });
  deleteBankTransaction = (id) => this.hit('deleteBankTransaction', () => { this.bank.find((b) => b.id === id).status = 'DELETED'; });
}

// ── A small Rovora ──────────────────────────────────────────────────────────
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CUST = { id: uuid(1), name: 'Hotel Calypso', email: 'ap@calypso.test', phone: null, address: 'Marsalforn Road\nMarsalforn\nGozo', vat_number: 'MT999' };

function invoice(n, over = {}) {
  return {
    id: uuid(100 + n), kind: 'invoice', status: 'issued', number: `INV-${String(n).padStart(4, '0')}`,
    customer_id: CUST.id, customer_name: CUST.name, credited_invoice_id: null, credit_reason: null,
    issue_date: '2026-11-18', due_date: '2026-12-02', currency: 'EUR', reference: null, total: 118,
    lines: [{ description: 'Transfers', quantity: 4, unit_price: 25, tax_rate: 18, line_net: 100, line_tax: 18 }],
    ...over,
  };
}
function creditNote(n, inv, amountNet, over = {}) {
  const tax = Math.round(amountNet * 18) / 100;
  return {
    id: uuid(200 + n), kind: 'credit_note', status: 'issued', number: `CN-${String(n).padStart(4, '0')}`,
    customer_id: CUST.id, customer_name: CUST.name, credited_invoice_id: inv.id, credit_reason: 'One transfer cancelled',
    issue_date: '2026-11-19', due_date: '2026-11-19', currency: 'EUR', reference: null, total: amountNet + tax,
    lines: [{ description: 'Cancelled', quantity: 1, unit_price: amountNet, tax_rate: 18, line_net: amountNet, line_tax: tax }],
    ...over,
  };
}
const payment = (n, doc, amount, over = {}) => ({ id: uuid(300 + n), invoice_id: doc.id, paid_on: '2026-11-20', amount, reference: null, ...over });
const allocation = (n, cn, inv, amount) => ({ id: uuid(400 + n), credit_note_id: cn.id, invoice_id: inv.id, amount, allocated_on: cn.issue_date });
const bankLine = (n, over = {}) => ({ id: uuid(500 + n), txn_date: '2026-11-18', category_id: 'cat-fuel', category_name: 'Fuel', kind: 'expense', amount: 62, description: 'Diesel', counterparty: 'Enemed', ...over });

const SETTINGS = { ...DEFAULT_XERO_SETTINGS, sync_from: '2026-11-01', sales_account_code: '200', tax_types: { '18.00': 'OUTPUT2', '0.00': 'NONE' } };
const WITH_PAYMENTS = { ...SETTINGS, send_payments: true, bank_account_id: 'bank-1' };
const WITH_BOOKS = { ...WITH_PAYMENTS, send_bookkeeping: true, category_accounts: { 'cat-fuel': '449' } };

function world(snapshot = {}) {
  const xero = new FakeXero();
  const rows = new Map();
  const ledger = {
    load: async () => [...rows.values()].map((r) => ({ ...r })),
    save: async (item) => { rows.set(`${item.entity_type}:${item.entity_id}`, { ...item }); },
  };
  const state = { customers: [CUST], documents: [], allocations: [], payments: [], bankLines: [], existingBankLineIds: [], ...snapshot };
  let clock = Date.parse('2026-11-20T10:00:00Z');
  const run = (settings = SETTINGS, opts = {}) => {
    xero.calls = 0;
    return runXeroSync({ api: xero, ledger, snapshot: state, settings, baseCurrency: 'EUR', appBaseUrl: 'https://app.rovora.eu', now: () => new Date(clock), ...opts });
  };
  const item = (type, id) => rows.get(`${type}:${id}`);
  return { xero, rows, state, run, item, advance: (hours) => { clock += hours * 3600_000; } };
}

// ── Scenarios ───────────────────────────────────────────────────────────────

test('an invoice reaches Xero with its customer, exact amounts and a link back', async () => {
  const inv = invoice(1, { reference: 'PO 7781' });
  const w = world({ documents: [inv] });
  const out = await w.run();
  assert.deepEqual({ sent: out.sent, failed: out.failed, stopped: out.stopped, setup: out.setup }, { sent: 2, failed: 0, stopped: null, setup: [] });
  assert.equal(w.xero.contacts.length, 1);
  const c = w.xero.contacts[0].payload;
  assert.equal(c.ContactNumber, CUST.id);
  assert.equal(c.TaxNumber, 'MT999');
  assert.deepEqual([c.Addresses[0].AddressLine1, c.Addresses[0].AddressLine2, c.Addresses[0].AddressLine3], ['Marsalforn Road', 'Marsalforn', 'Gozo']);
  const p = w.xero.invoices[0].payload;
  assert.equal(p.Type, 'ACCREC');
  assert.equal(p.InvoiceNumber, 'INV-0001');
  assert.equal(p.Status, 'AUTHORISED');
  assert.equal(p.LineAmountTypes, 'Exclusive');
  assert.equal(p.Date, '2026-11-18');
  assert.equal(p.DueDate, '2026-12-02');
  assert.equal(p.Reference, 'PO 7781');
  assert.equal(p.Url, `https://app.rovora.eu/fleet/invoices/${inv.id}`);
  assert.equal(p.CurrencyCode, undefined); // same as Xero's base currency
  assert.deepEqual(p.LineItems[0], { Description: 'Transfers', Quantity: 4, UnitAmount: 25, AccountCode: '200', TaxType: 'OUTPUT2', TaxAmount: 18, LineAmount: 100 });
  assert.equal(w.item('invoice', inv.id).status, 'synced');
  assert.equal(w.item('invoice', inv.id).xero_id, w.xero.invoices[0].id);
  assert.equal(w.item('invoice', inv.id).label, 'INV-0001 · Hotel Calypso');
});

test('running again sends nothing and makes no API calls', async () => {
  const w = world({ documents: [invoice(1), invoice(2)] });
  await w.run();
  const out = await w.run();
  assert.equal(out.sent, 0);
  assert.equal(w.xero.calls, 0);
  assert.equal(w.xero.invoices.length, 2);
  assert.equal(w.xero.contacts.length, 1); // one contact shared by both invoices
});

test('nothing is sent until the account and tax rates are chosen', async () => {
  const w = world({ documents: [invoice(1), invoice(2, { lines: [{ description: 'x', quantity: 1, unit_price: 10, tax_rate: 5, line_net: 10, line_tax: 0.5 }], total: 10.5 })] });
  let out = await w.run({ ...SETTINGS, sales_account_code: null });
  assert.equal(w.xero.calls, 0);
  assert.equal(out.waiting, 2);
  assert.ok(out.setup.includes('Choose the Xero account your invoices are booked to.'));
  assert.match(w.item('invoice', invoice(1).id).last_error, /Choose the Xero account/);
  assert.equal(w.item('invoice', invoice(1).id).attempts, 0);

  out = await w.run(); // account chosen, but 5% has no tax rate
  assert.deepEqual(out.setup, ['Choose a Xero tax rate for 5% VAT.']);
  assert.equal(w.xero.invoices.length, 1);
  assert.match(w.item('invoice', invoice(2).id).last_error, /5% VAT/);

  out = await w.run({ ...SETTINGS, tax_types: { ...SETTINGS.tax_types, '5.00': 'REDUCED' } });
  assert.equal(w.xero.invoices.length, 2);
  assert.equal(w.item('invoice', invoice(2).id).last_error, null);
});

test('credit note, its allocation, a payment and a refund go in the right order in one run', async () => {
  const inv = invoice(1);
  const cn = creditNote(1, inv, 20); // 23.60
  const paidInv = invoice(2);
  const cn2 = creditNote(2, paidInv, 10, { issue_date: '2026-11-21', due_date: '2026-11-21' }); // 11.80, refundable
  const w = world({
    documents: [cn2, cn, paidInv, inv], // deliberately out of order
    allocations: [allocation(1, cn, inv, 23.6)],
    payments: [payment(3, cn2, 11.8, { paid_on: '2026-11-22' }), payment(1, inv, 94.4), payment(2, paidInv, 118, { paid_on: '2026-11-19' })],
  });
  const out = await w.run(WITH_PAYMENTS);
  assert.equal(out.failed, 0, out.firstError ?? '');
  assert.equal(out.stopped, null);
  const order = w.xero.log.filter((m) => /^(create|allocate)/.test(m));
  assert.deepEqual(order, ['createContact', 'createInvoice', 'createInvoice', 'createCreditNote', 'createCreditNote', 'allocateCredit', 'createPayment', 'createPayment', 'createPayment']);
  assert.deepEqual(w.xero.invoices.map((i) => i.number), ['INV-0001', 'INV-0002']);
  const x1 = w.xero.invoices[0];
  assert.equal(w.xero.due(x1), 0); // 118 − 23.60 credit − 94.40 paid
  const xcn = w.xero.creditNotes.find((c) => c.number === 'CN-0001');
  assert.equal(xcn.payload.Type, 'ACCRECCREDIT');
  assert.match(xcn.payload.Reference, /^INV-0001 – One transfer cancelled$/);
  assert.equal(xcn.allocations[0].invoiceId, x1.id);
  const refund = w.xero.payments.find((p) => p.creditNoteId);
  assert.equal(refund.amount, 11.8);
  assert.equal(refund.account, 'bank-1');
  assert.equal(w.xero.payments.find((p) => p.invoiceId === x1.id).reference, rovoraRef(uuid(301)));
});

test('a lost response never creates a duplicate: the invoice is found by its number', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv] });
  w.xero.fail('createInvoice', 'lost');
  let out = await w.run();
  assert.equal(out.failed, 1);
  assert.equal(w.xero.invoices.length, 1); // it DID reach Xero
  assert.equal(w.item('invoice', inv.id).xero_id, null); // …but we don't know that
  assert.equal(w.item('invoice', inv.id).status, 'error');

  w.advance(7); // past the cooling-off period
  out = await w.run();
  assert.equal(w.xero.invoices.length, 1); // adopted, not recreated
  assert.ok(w.xero.log.includes('findInvoiceByNumber'));
  assert.equal(w.item('invoice', inv.id).xero_id, w.xero.invoices[0].id);
  assert.equal(w.item('invoice', inv.id).status, 'synced');
});

test('a lost response on a payment, an allocation and a credit note is recovered the same way', async () => {
  const inv = invoice(1);
  const cn = creditNote(1, inv, 20);
  const w = world({ documents: [inv, cn], allocations: [allocation(1, cn, inv, 23.6)], payments: [payment(1, inv, 50, { reference: 'Bank ref 99' })] });
  w.xero.fail('createCreditNote', 'lost');
  w.xero.fail('createPayment', 'lost');
  await w.run(WITH_PAYMENTS);
  assert.equal(w.xero.creditNotes.length, 1);
  assert.equal(w.xero.payments.length, 1);
  w.advance(7);
  w.xero.fail('allocateCredit', 'lost');
  await w.run(WITH_PAYMENTS);
  w.advance(7);
  const out = await w.run(WITH_PAYMENTS);
  assert.equal(out.failed, 0);
  assert.equal(w.xero.creditNotes.length, 1);
  assert.equal(w.xero.creditNotes[0].allocations.length, 1);
  assert.equal(w.xero.payments.length, 1);
  assert.equal(w.xero.payments[0].reference, `${rovoraRef(uuid(301))} Bank ref 99`);
  assert.equal(paymentReference(payment(1, inv, 50, { reference: 'Bank ref 99' })), w.xero.payments[0].reference);
  for (const [type, id] of [['credit_note', cn.id], ['allocation', uuid(401)], ['payment', uuid(301)]]) {
    assert.equal(w.item(type, id).status, 'synced', type);
  }
});

test('a refused record is not hammered: retried after six hours, or at once after Retry', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv] });
  w.xero.fail('createInvoice', new XeroError('validation', 'Account code 200 is not a valid code for this document.'));
  let out = await w.run();
  assert.equal(out.failed, 1);
  assert.equal(out.firstError, 'Account code 200 is not a valid code for this document.');
  assert.equal(w.item('invoice', inv.id).last_error, 'Account code 200 is not a valid code for this document.');

  out = await w.run(); // immediately again: left alone
  assert.equal(w.xero.calls, 0);
  w.advance(5);
  await w.run();
  assert.equal(w.xero.calls, 0);

  // "Retry" in the UI clears the attempt record.
  const row = w.item('invoice', inv.id);
  w.rows.set(`invoice:${inv.id}`, { ...row, status: 'pending', attempts: 0, last_attempt_at: null, last_error: null });
  out = await w.run();
  assert.equal(out.sent, 1);
  assert.equal(w.xero.invoices.length, 1);
});

test('a rate limit stops the run at once and the rest is sent next time, once', async () => {
  const docs = [1, 2, 3, 4, 5].map((n) => invoice(n));
  const w = world({ documents: docs });
  w.xero.rateLimitAfter = 4; // contact lookups ×2, create contact, first invoice
  let out = await w.run();
  assert.equal(out.stopped, 'rate_limit');
  assert.equal(out.retryAfter, 42);
  assert.equal(w.xero.invoices.length, 1);
  assert.equal(w.item('invoice', docs[1].id).status, 'pending'); // not marked as an error
  assert.equal(w.item('invoice', docs[1].id).attempts, 0);

  w.xero.rateLimitAfter = Infinity;
  out = await w.run();
  assert.equal(out.stopped, null);
  assert.deepEqual(w.xero.invoices.map((i) => i.number), ['INV-0001', 'INV-0002', 'INV-0003', 'INV-0004', 'INV-0005']);
});

test('a refused token stops the run', async () => {
  const w = world({ documents: [invoice(1), invoice(2)] });
  w.xero.fail('findContact', new XeroError('auth', 'Xero no longer accepts this connection. Reconnect Xero.'));
  const out = await w.run();
  assert.equal(out.stopped, 'auth');
  assert.equal(w.xero.calls, 1);
  assert.equal(w.xero.invoices.length, 0);
});

test('the per-run budget splits a backlog over several runs without duplicates', async () => {
  const docs = Array.from({ length: 12 }, (_, i) => invoice(i + 1));
  const w = world({ documents: docs });
  const first = await w.run(SETTINGS, { maxCalls: 6 });
  assert.equal(first.stopped, 'budget');
  assert.ok(w.xero.invoices.length < 12);
  let guard = 0;
  while ((await w.run(SETTINGS, { maxCalls: 6 })).stopped === 'budget' && guard++ < 10);
  assert.equal(w.xero.invoices.length, 12);
  assert.equal(new Set(w.xero.invoices.map((i) => i.number)).size, 12);
});

test('a payment removed in Rovora is removed in Xero, and only then can the invoice be voided', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv], payments: [payment(1, inv, 118)] });
  await w.run(WITH_PAYMENTS);
  assert.equal(w.xero.due(w.xero.invoices[0]), 0);

  // In Rovora: the payment is deleted and the invoice voided.
  w.state.payments = [];
  w.state.documents = [{ ...inv, status: 'void' }];
  w.xero.log = [];
  const out = await w.run(WITH_PAYMENTS);
  assert.equal(out.failed, 0, out.firstError ?? '');
  assert.deepEqual(w.xero.log, ['deletePayment', 'voidInvoice']);
  assert.equal(w.xero.payments[0].status, 'DELETED');
  assert.equal(w.xero.invoices[0].status, 'VOIDED');
  assert.equal(w.item('payment', uuid(301)).remote_state, 'deleted');
  assert.equal(w.item('invoice', inv.id).remote_state, 'voided');

  await w.run(WITH_PAYMENTS);
  assert.equal(w.xero.calls, 0); // settled
});

test('a document voided before it was ever sent is skipped, with no API call', async () => {
  const inv = invoice(1, { status: 'void' });
  const w = world({ documents: [inv] });
  const out = await w.run();
  assert.equal(w.xero.calls, 0);
  assert.equal(out.sent, 0);
  assert.equal(w.item('invoice', inv.id).status, 'skipped');
  assert.match(w.item('invoice', inv.id).last_error, /Voided before it was sent/);
});

test('documents older than the start date are not sent, nor is anything attached to them', async () => {
  const old = invoice(1, { issue_date: '2026-10-15', due_date: '2026-10-29' });
  const cn = creditNote(1, old, 20);
  const recent = invoice(2);
  const w = world({ documents: [old, cn, recent], allocations: [allocation(1, cn, old, 23.6)], payments: [payment(1, old, 50), payment(2, recent, 118)] });
  const out = await w.run(WITH_PAYMENTS);
  assert.equal(out.failed, 0);
  assert.deepEqual(w.xero.invoices.map((i) => i.number), ['INV-0002']);
  assert.equal(w.xero.creditNotes.length, 0);
  assert.equal(w.xero.payments.length, 1);
  assert.equal(w.item('credit_note', cn.id).status, 'skipped');
  assert.equal(w.item('invoice', old.id), undefined); // no noise in the log for old invoices
});

test('moving the start date later never deletes or abandons what was already sent', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv], payments: [payment(1, inv, 50)], bankLines: [bankLine(1)] });
  await w.run(WITH_BOOKS);
  assert.equal(w.xero.payments.length, 1);
  assert.equal(w.xero.bank.length, 1);

  // The admin moves the start date past everything. The bookkeeping line is no
  // longer in the date-limited list, but it still exists in Rovora.
  const later = { ...WITH_BOOKS, sync_from: '2026-12-01' };
  w.state.bankLines = [];
  w.state.existingBankLineIds = [uuid(501)];
  let out = await w.run(later);
  assert.equal(w.xero.calls, 0);
  assert.equal(w.xero.payments[0].status, 'AUTHORISED');
  assert.equal(w.xero.bank[0].status, 'AUTHORISED');

  // A second payment on the already-sent invoice still goes across…
  w.state.payments.push(payment(2, inv, 68));
  out = await w.run(later);
  assert.equal(out.failed, 0);
  assert.equal(w.xero.payments.length, 2);
  // …and so does voiding flow for it later.
  assert.equal(w.xero.due(w.xero.invoices[0]), 0);
});

test('a customer the accountant already has in Xero is reused; an archived one is reported', async () => {
  const w = world({ documents: [invoice(1)] });
  w.xero.contacts.push({ id: 'C-existing', number: null, name: 'hotel calypso', archived: false });
  await w.run();
  assert.equal(w.xero.contacts.length, 1);
  assert.equal(w.xero.invoices[0].payload.Contact.ContactID, 'C-existing');

  const w2 = world({ documents: [invoice(1)] });
  w2.xero.contacts.push({ id: 'C-old', number: null, name: 'Hotel Calypso', archived: true });
  const out = await w2.run();
  assert.equal(out.failed, 1);
  assert.match(out.firstError, /archived in Xero/);
  assert.equal(w2.xero.invoices.length, 0);
  assert.match(w2.item('invoice', invoice(1).id).last_error, /Waiting for the customer/);
});

test('if Xero works out a different total, it is flagged and never recreated', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv] });
  w.xero.totalSkew = 0.01;
  const out = await w.run();
  assert.equal(out.failed, 1);
  assert.match(w.item('invoice', inv.id).last_error, /Xero shows a total of 118\.01 but the document is 118\.00/);
  assert.equal(w.item('invoice', inv.id).xero_id, w.xero.invoices[0].id);
  w.advance(7);
  await w.run();
  assert.equal(w.xero.invoices.length, 1);
});

test('a number Xero would reject is held back with an explanation', async () => {
  const inv = invoice(1, { number: 'FATTURA-№7' });
  const w = world({ documents: [inv] });
  await w.run();
  assert.equal(w.xero.calls, 0);
  assert.match(w.item('invoice', inv.id).last_error, /plain letters and numbers/);
});

test('with payments switched off, payments are skipped and invoices still go', async () => {
  const inv = invoice(1);
  const w = world({ documents: [inv], payments: [payment(1, inv, 50)] });
  await w.run(SETTINGS);
  assert.equal(w.xero.invoices.length, 1);
  assert.equal(w.xero.payments.length, 0);
  assert.equal(w.item('payment', uuid(301)).status, 'skipped');
  // Switched on later: it goes.
  await w.run(WITH_PAYMENTS);
  assert.equal(w.xero.payments.length, 1);
});

test('a foreign-currency document names its currency', async () => {
  const w = world({ documents: [invoice(1, { currency: 'GBP' })] });
  await w.run();
  assert.equal(w.xero.invoices[0].payload.CurrencyCode, 'GBP');
});

test('bookkeeping lines: sent once, updated when edited, removed when deleted, held when unmapped', async () => {
  const fuel = bankLine(1);
  const income = bankLine(2, { kind: 'income', category_id: 'cat-airport', category_name: 'Airport runs', amount: 300, description: null, counterparty: null });
  const w = world({ bankLines: [fuel, income] });
  let out = await w.run(WITH_BOOKS);
  assert.equal(w.xero.bank.length, 1);
  const spend = w.xero.bank[0].payload;
  assert.equal(spend.Type, 'SPEND');
  assert.equal(spend.Contact.Name, 'Enemed');
  assert.equal(spend.BankAccount.AccountID, 'bank-1');
  assert.equal(spend.LineAmountTypes, 'NoTax');
  assert.equal(spend.Reference, rovoraRef(fuel.id));
  assert.deepEqual(spend.LineItems[0], { Description: 'Diesel', Quantity: 1, UnitAmount: 62, AccountCode: '449' });
  assert.match(w.item('bank_transaction', income.id).last_error, /Choose a Xero account for the “Airport runs” category/);
  assert.equal(out.waiting, 1);

  out = await w.run({ ...WITH_BOOKS, category_accounts: { 'cat-fuel': '449', 'cat-airport': '260' } });
  assert.equal(w.xero.bank.length, 2);
  assert.equal(w.xero.bank[1].payload.Type, 'RECEIVE');
  assert.equal(w.xero.bank[1].payload.Contact.Name, 'Rovora (no payee recorded)');
  assert.equal(w.xero.bank[1].payload.LineItems[0].Description, 'Airport runs');

  const mapped = { ...WITH_BOOKS, category_accounts: { 'cat-fuel': '449', 'cat-airport': '260' } };
  await w.run(mapped);
  assert.equal(w.xero.calls, 0); // unchanged

  w.state.bankLines = [{ ...fuel, amount: 64.5 }, income]; // edited in Rovora
  await w.run(mapped);
  assert.deepEqual(w.xero.log.slice(-1), ['updateBankTransaction']);
  assert.equal(w.xero.bank[0].payload.LineItems[0].UnitAmount, 64.5);

  w.state.bankLines = [income]; // fuel line deleted in Rovora
  await w.run(mapped);
  assert.equal(w.xero.bank[0].status, 'DELETED');
  assert.equal(w.item('bank_transaction', fuel.id).remote_state, 'deleted');

  // Switching the feature off sends and removes nothing.
  w.state.bankLines = [];
  await w.run(WITH_PAYMENTS);
  assert.equal(w.xero.calls, 0);
});
