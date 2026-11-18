// Runs supabase/migrations/20261118_invoices.sql against an in-memory Postgres
// (PGlite) and checks the rules the migration promises to enforce.
//
//   npm i --no-save @electric-sql/pglite
//   node --test tests/invoices-migration.test.mjs
//
// PGlite is not a project dependency; without it the suite is skipped.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(here, '../supabase/migrations/20261118_invoices.sql'), 'utf8');

let PGlite;
try {
  ({ PGlite } = await import(process.env.PGLITE_PATH || '@electric-sql/pglite'));
} catch {
  PGlite = null;
}

// The parts of the real schema the migration touches.
const STUBS = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, legal_name text, vat_number text,
    contact_email text, contact_phone text, address text
  );
  CREATE TABLE org_finance_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key text NOT NULL, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('income','expense'))
  );
  CREATE TABLE finance_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    txn_date date NOT NULL DEFAULT CURRENT_DATE,
    category_id uuid NOT NULL REFERENCES org_finance_categories(id) ON DELETE RESTRICT,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    description text, counterparty text,
    payment_method text NOT NULL DEFAULT 'card' CHECK (payment_method IN ('cash','card','bank','other')),
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','recurring','period_import')),
    source_ref uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX uq_finance_txns_generated_once ON finance_transactions(source_ref, txn_date, category_id);
`;

const skip = PGlite ? false : 'PGlite not installed (npm i --no-save @electric-sql/pglite)';
let db, org, user, income, refundCat, customer, otherCustomer;

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const fails = async (fn, pattern) => {
  await assert.rejects(fn, (e) => {
    assert.match(String(e.message), pattern);
    return true;
  });
};
const today = new Date().toISOString().slice(0, 10);

/** A draft with the given lines: [description, quantity, unitPrice, taxRate]. */
async function draft(lines, { kind = 'invoice', credited = null, cust = customer } = {}) {
  const inv = await one(
    `INSERT INTO invoices (organization_id, kind, customer_id, credited_invoice_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [org, kind, cust, credited],
  );
  let pos = 0;
  for (const [d, q, p, t] of lines) {
    await db.query(
      `INSERT INTO invoice_lines (organization_id, invoice_id, position, description, quantity, unit_price, tax_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [org, inv.id, pos++, d, q, p, t],
    );
  }
  return inv;
}
const issue = (id, date = today) => one(`SELECT * FROM invoice_issue($1,$2,$3,$4)`, [org, id, user, date]);
const pay = (id, amount, date = today, method = 'bank') =>
  one(`SELECT * FROM invoice_record_payment($1,$2,$3,$4,$5,$6,$7)`, [org, id, amount, date, method, null, user]);
const balance = async (id) => Number((await one(`SELECT invoice_balance($1) AS b`, [id])).b);

before(async () => {
  if (!PGlite) return;
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent: must run twice without error
  org = (await one(`INSERT INTO organizations (name, legal_name, vat_number, address) VALUES ('Spot','Spot Cabs Ltd','MT12345678','1 Triq il-Kbira, Victoria') RETURNING id`)).id;
  user = (await one(`INSERT INTO auth.users DEFAULT VALUES RETURNING id`)).id;
  income = (await one(`INSERT INTO org_finance_categories (organization_id,key,name,kind) VALUES ($1,'corporate','Corporate accounts','income') RETURNING id`, [org])).id;
  refundCat = (await one(`INSERT INTO org_finance_categories (organization_id,key,name,kind) VALUES ($1,'refunds','Refunds','expense') RETURNING id`, [org])).id;
  await db.query(`INSERT INTO invoice_settings (organization_id, income_category_id, refund_category_id, payment_instructions) VALUES ($1,$2,$3,'IBAN MT00 0000')`, [org, income, refundCat]);
  customer = (await one(`INSERT INTO invoice_customers (organization_id,name,address,vat_number,email) VALUES ($1,'Hotel Calypso','Marsalforn','MT999','ap@calypso.test') RETURNING id`, [org])).id;
  otherCustomer = (await one(`INSERT INTO invoice_customers (organization_id,name) VALUES ($1,'Gozo Tours') RETURNING id`, [org])).id;
});

test('a draft has no number; issuing allocates INV-0001, totals and snapshots', { skip }, async () => {
  const d = await draft([['Airport transfers', 3, 25, 18], ['Waiting time', 1.5, 12.35, 18], ['Discount', 1, -5, 0]]);
  assert.equal(d.number, null);
  const inv = await issue(d.id);
  assert.equal(inv.number, 'INV-0001');
  assert.equal(inv.status, 'issued');
  // 75.00 + round(18.525)=18.53 − 5.00 = 88.53 ; tax 13.50 + round(3.3354)=3.34 = 16.84
  assert.equal(Number(inv.subtotal), 88.53);
  assert.equal(Number(inv.tax_total), 16.84);
  assert.equal(Number(inv.total), 105.37);
  assert.equal(inv.customer_name, 'Hotel Calypso');
  assert.equal(inv.seller_name, 'Spot Cabs Ltd');
  assert.equal(inv.seller_vat_number, 'MT12345678');
  assert.equal(inv.payment_instructions, 'IBAN MT00 0000');
  // due date = issue date + 14 days
  const due = new Date(new Date(today).getTime() + 14 * 864e5).toISOString().slice(0, 10);
  assert.equal(new Date(inv.due_date).toISOString().slice(0, 10), due);
});

test('rounding is half away from zero, per line', { skip }, async () => {
  const d = await draft([['a', 1, 0.125, 0]]); // unit price is numeric(12,2) → 0.13
  const d2 = await draft([['b', 0.5, 0.25, 18]]); // 0.125 → 0.13 ; tax 0.0234 → 0.02
  const a = await issue(d.id);
  const b = await issue(d2.id);
  assert.equal(Number(a.total), 0.13);
  assert.equal(Number(b.subtotal), 0.13);
  assert.equal(Number(b.tax_total), 0.02);
});

test('numbers are sequential with no gaps, even when issued concurrently', { skip }, async () => {
  const drafts = [];
  for (let i = 0; i < 6; i++) drafts.push(await draft([['x', 1, 10, 0]]));
  const issued = await Promise.all(drafts.map((d) => issue(d.id)));
  const seqs = issued.map((i) => i.number_seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, [4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(issued.map((i) => i.number)).size, 6);
});

test('cannot issue with no lines, a zero total, or twice', { skip }, async () => {
  const empty = await draft([]);
  await fails(() => issue(empty.id), /at least one line/);
  const zero = await draft([['x', 1, 10, 0], ['y', 1, -10, 0]]);
  await fails(() => issue(zero.id), /more than zero/);
  const ok = await draft([['x', 1, 10, 0]]);
  await issue(ok.id);
  await fails(() => issue(ok.id), /already been issued/);
});

test('an issued document is frozen: no edits, no line changes, no delete', { skip }, async () => {
  const inv = await issue((await draft([['x', 2, 50, 18]])).id);
  await fails(() => db.query(`UPDATE invoices SET total = 1 WHERE id = $1`, [inv.id]), /cannot be changed/);
  await fails(() => db.query(`UPDATE invoices SET customer_id = $2 WHERE id = $1`, [inv.id, otherCustomer]), /cannot be changed/);
  await fails(() => db.query(`UPDATE invoices SET notes = 'x' WHERE id = $1`, [inv.id]), /cannot be changed/);
  await fails(() => db.query(`UPDATE invoices SET status = 'draft', number = NULL WHERE id = $1`, [inv.id]), /cannot go back/);
  await fails(() => db.query(`UPDATE invoice_lines SET unit_price = 1 WHERE invoice_id = $1`, [inv.id]), /lines of an issued/);
  await fails(() => db.query(`DELETE FROM invoice_lines WHERE invoice_id = $1`, [inv.id]), /lines of an issued/);
  await fails(() => db.query(`INSERT INTO invoice_lines (organization_id, invoice_id, description) VALUES ($1,$2,'sneaky')`, [org, inv.id]), /lines of an issued/);
  await fails(() => db.query(`DELETE FROM invoices WHERE id = $1`, [inv.id]), /cannot be deleted/);
  // …but marking it as sent is allowed.
  await db.query(`UPDATE invoices SET sent_at = now(), sent_to = 'ap@calypso.test' WHERE id = $1`, [inv.id]);
});

test('a draft can be edited and deleted (lines go with it)', { skip }, async () => {
  const d = await draft([['x', 1, 10, 0]]);
  await db.query(`UPDATE invoice_lines SET unit_price = 20 WHERE invoice_id = $1`, [d.id]);
  await db.query(`DELETE FROM invoices WHERE id = $1`, [d.id]);
  assert.equal((await db.query(`SELECT 1 FROM invoice_lines WHERE invoice_id = $1`, [d.id])).rows.length, 0);
});

test('payments: partial, full, never more than owed, posted to bookkeeping', { skip }, async () => {
  const inv = await issue((await draft([['x', 1, 100, 18]])).id); // 118.00
  assert.equal(await balance(inv.id), 118);
  const p1 = await pay(inv.id, 50);
  assert.equal(await balance(inv.id), 68);
  await fails(() => pay(inv.id, 68.01), /Only 68\.00 is still owed/);
  await fails(() => pay(inv.id, 0), /greater than zero/);
  await pay(inv.id, 68);
  assert.equal(await balance(inv.id), 0);
  const txn = await one(`SELECT * FROM finance_transactions WHERE id = $1`, [p1.finance_transaction_id]);
  assert.equal(txn.source, 'invoice');
  assert.equal(Number(txn.amount), 50);
  assert.equal(txn.category_id, income);
  assert.equal(txn.counterparty, 'Hotel Calypso');
  assert.match(txn.description, /Invoice INV-/);
  // removing the payment removes its bookkeeping line and reopens the balance
  await one(`SELECT * FROM invoice_delete_payment($1,$2)`, [org, p1.id]);
  assert.equal(await balance(inv.id), 50);
  assert.equal((await db.query(`SELECT 1 FROM finance_transactions WHERE id = $1`, [p1.finance_transaction_id])).rows.length, 0);
});

test('payments are refused on drafts and before the issue date', { skip }, async () => {
  const d = await draft([['x', 1, 10, 0]]);
  await fails(() => pay(d.id, 5), /issued document/);
  const inv = await issue(d.id);
  const before = new Date(new Date(today).getTime() - 864e5).toISOString().slice(0, 10);
  await fails(() => pay(inv.id, 5, before), /before the document was issued/);
});

test('credit note: numbered CN-, applied to its invoice, reduces what is owed', { skip }, async () => {
  const inv = await issue((await draft([['Transfers', 10, 20, 18]])).id); // 236.00
  const cn = await issue((await draft([['Two transfers cancelled', 2, 20, 18]], { kind: 'credit_note', credited: inv.id })).id);
  assert.match(cn.number, /^CN-0001$/);
  assert.equal(Number(cn.total), 47.2);
  assert.equal(cn.payment_instructions, null);
  assert.equal(await balance(inv.id), 188.8);
  assert.equal(await balance(cn.id), 0); // fully applied
  const alloc = await one(`SELECT * FROM invoice_credit_allocations WHERE credit_note_id = $1`, [cn.id]);
  assert.equal(Number(alloc.amount), 47.2);
  // the customer can now only pay the remainder
  await fails(() => pay(inv.id, 200), /Only 188\.80/);
});

test('credit notes can never add up to more than the invoice', { skip }, async () => {
  const inv = await issue((await draft([['x', 1, 100, 0]])).id);
  await issue((await draft([['half', 1, 60, 0]], { kind: 'credit_note', credited: inv.id })).id);
  const tooMuch = await draft([['rest', 1, 41, 0]], { kind: 'credit_note', credited: inv.id });
  await fails(() => issue(tooMuch.id), /credit more than the invoice is worth/);
  const exact = await draft([['rest', 1, 40, 0]], { kind: 'credit_note', credited: inv.id });
  await issue(exact.id);
  assert.equal(await balance(inv.id), 0);
});

test('crediting an invoice that was already paid leaves refundable credit', { skip }, async () => {
  const inv = await issue((await draft([['x', 1, 100, 0]])).id);
  await pay(inv.id, 100);
  const cn = await issue((await draft([['goodwill', 1, 30, 0]], { kind: 'credit_note', credited: inv.id })).id);
  assert.equal(await balance(inv.id), 0);
  assert.equal(await balance(cn.id), 30); // nothing to apply it to → refundable
  await fails(() => pay(cn.id, 31), /left to refund/);
  const refund = await pay(cn.id, 30);
  assert.equal(await balance(cn.id), 0);
  const txn = await one(`SELECT * FROM finance_transactions WHERE id = $1`, [refund.finance_transaction_id]);
  assert.equal(txn.category_id, refundCat);
  assert.match(txn.description, /Refund of credit note CN-/);
});

test('a credit note must match its invoice: issued, same customer, not dated earlier', { skip }, async () => {
  const d = await draft([['x', 1, 100, 0]]);
  const early = await draft([['y', 1, 10, 0]], { kind: 'credit_note', credited: d.id });
  await fails(() => issue(early.id), /against an issued invoice/);
  const inv = await issue(d.id);
  const wrongCust = await draft([['y', 1, 10, 0]], { kind: 'credit_note', credited: inv.id, cust: otherCustomer });
  await fails(() => issue(wrongCust.id), /same customer/);
  await fails(() => db.query(`INSERT INTO invoices (organization_id, kind, customer_id) VALUES ($1,'credit_note',$2)`, [org, customer]), /invoices_credit_note_has_invoice/);
});

test('void: allowed when nothing depends on the document, keeps its number', { skip }, async () => {
  const inv = await issue((await draft([['x', 1, 10, 0]])).id);
  const v = await one(`SELECT * FROM invoice_void($1,$2,$3,$4)`, [org, inv.id, user, 'Raised in error']);
  assert.equal(v.status, 'void');
  assert.equal(v.number, inv.number);
  assert.equal(v.void_reason, 'Raised in error');
  assert.equal(await balance(inv.id), 0);
  await fails(() => db.query(`UPDATE invoices SET status = 'issued' WHERE id = $1`, [inv.id]), /stays voided/);
  await fails(() => pay(inv.id, 5), /issued document/);
});

test('void is refused once money or credit is attached', { skip }, async () => {
  const paid = await issue((await draft([['x', 1, 10, 0]])).id);
  await pay(paid.id, 5);
  await fails(() => one(`SELECT * FROM invoice_void($1,$2,$3,$4)`, [org, paid.id, user, null]), /payments recorded/);
  const credited = await issue((await draft([['x', 1, 10, 0]])).id);
  const cn = await issue((await draft([['y', 1, 4, 0]], { kind: 'credit_note', credited: credited.id })).id);
  await fails(() => one(`SELECT * FROM invoice_void($1,$2,$3,$4)`, [org, credited.id, user, null]), /credit note against it/);
  await fails(() => one(`SELECT * FROM invoice_void($1,$2,$3,$4)`, [org, cn.id, user, null]), /applied to its invoice/);
});

test('dates follow the numbering, and cannot be in the future', { skip }, async () => {
  const far = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const d = await draft([['x', 1, 10, 0]]);
  await fails(() => issue(d.id, far), /dated in the future/);
  const back = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  await fails(() => issue(d.id, back), /cannot be earlier than your latest invoice/);
});

test('one fleet cannot touch another fleet’s documents', { skip }, async () => {
  const other = (await one(`INSERT INTO organizations (name) VALUES ('Other') RETURNING id`)).id;
  const inv = await issue((await draft([['x', 1, 10, 0]])).id);
  await fails(() => one(`SELECT * FROM invoice_record_payment($1,$2,$3,$4,$5,$6,$7)`, [other, inv.id, 5, today, 'bank', null, user]), /no longer exists/);
  await fails(() => one(`SELECT * FROM invoice_void($1,$2,$3,$4)`, [other, inv.id, user, null]), /no longer exists/);
  const d = await draft([['x', 1, 10, 0]]);
  await fails(() => one(`SELECT * FROM invoice_issue($1,$2,$3,$4)`, [other, d.id, user, today]), /no longer exists/);
});

test('customers: one live customer per name; one with documents cannot be deleted', { skip }, async () => {
  await fails(() => db.query(`INSERT INTO invoice_customers (organization_id,name) VALUES ($1,' hotel calypso ')`, [org]), /uq_invoice_customers_name/);
  await fails(() => db.query(`DELETE FROM invoice_customers WHERE id = $1`, [customer]), /violates foreign key/);
});

test('deleting the whole fleet removes everything, issued documents included', { skip }, async () => {
  const o = (await one(`INSERT INTO organizations (name) VALUES ('Temp') RETURNING id`)).id;
  const c = (await one(`INSERT INTO invoice_customers (organization_id,name) VALUES ($1,'C') RETURNING id`, [o])).id;
  const cat = (await one(`INSERT INTO org_finance_categories (organization_id,key,name,kind) VALUES ($1,'k','K','income') RETURNING id`, [o])).id;
  await db.query(`INSERT INTO invoice_settings (organization_id, income_category_id) VALUES ($1,$2)`, [o, cat]);
  const inv = await one(`INSERT INTO invoices (organization_id, customer_id) VALUES ($1,$2) RETURNING id`, [o, c]);
  await db.query(`INSERT INTO invoice_lines (organization_id, invoice_id, description, quantity, unit_price) VALUES ($1,$2,'x',1,10)`, [o, inv.id]);
  await one(`SELECT * FROM invoice_issue($1,$2,$3,$4)`, [o, inv.id, user, today]);
  await one(`SELECT * FROM invoice_record_payment($1,$2,$3,$4,$5,$6,$7)`, [o, inv.id, 4, today, 'cash', null, user]);
  const cn = await one(`INSERT INTO invoices (organization_id, customer_id, kind, credited_invoice_id) VALUES ($1,$2,'credit_note',$3) RETURNING id`, [o, c, inv.id]);
  await db.query(`INSERT INTO invoice_lines (organization_id, invoice_id, description, quantity, unit_price) VALUES ($1,$2,'y',1,3)`, [o, cn.id]);
  await one(`SELECT * FROM invoice_issue($1,$2,$3,$4)`, [o, cn.id, user, today]);
  await db.query(`DELETE FROM organizations WHERE id = $1`, [o]);
  assert.equal((await db.query(`SELECT 1 FROM invoices WHERE organization_id = $1`, [o])).rows.length, 0);
});
