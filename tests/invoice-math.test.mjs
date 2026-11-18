// node --test tests/invoice-math.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, lineAmounts, documentTotals, displayStatus, formatDocumentNumber, addDays, daysBetween, toScaled } from '../lib/invoices/math.ts';

test('toCents parses decimals exactly and rounds half away from zero', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents('12,34'), 1234);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('0.125'), 13);
  assert.equal(toCents('-0.125'), -13);
  assert.equal(toCents('0.124'), 12);
  assert.equal(toCents('1.005'), 101); // the classic float trap: 1.005 * 100 = 100.49999…
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents('100'), 10000);
  assert.equal(toCents('.5'), 50);
  assert.equal(toCents(''), null);
  assert.equal(toCents('abc'), null);
  assert.equal(toCents('1e3'), null);
  assert.equal(toCents(NaN), null);
  assert.equal(fromCents(1234), 12.34);
});

test('line amounts match the database rule', () => {
  // Same figures as tests/invoices-migration.test.mjs
  assert.deepEqual(lineAmounts({ quantity: 3, unitPrice: 25, taxRate: 18 }), { net: 7500, tax: 1350, gross: 8850 });
  assert.deepEqual(lineAmounts({ quantity: 1.5, unitPrice: 12.35, taxRate: 18 }), { net: 1853, tax: 334, gross: 2187 });
  assert.deepEqual(lineAmounts({ quantity: 1, unitPrice: -5, taxRate: 0 }), { net: -500, tax: 0, gross: -500 });
  assert.deepEqual(lineAmounts({ quantity: 0.5, unitPrice: 0.25, taxRate: 18 }), { net: 13, tax: 2, gross: 15 });
  assert.equal(lineAmounts({ quantity: 'x', unitPrice: 1, taxRate: 0 }), null);
});

test('negative lines round away from zero too', () => {
  assert.deepEqual(lineAmounts({ quantity: 0.5, unitPrice: -0.25, taxRate: 18 }), { net: -13, tax: -2, gross: -15 });
});

test('large values stay exact', () => {
  const a = lineAmounts({ quantity: '123456.789', unitPrice: '98765.43', taxRate: '18' });
  // Checked with exact decimal arithmetic: 123456.789 × 98765.43 = 12193262852.00 (to the cent),
  // and 18% of that = 2194787313.36.
  assert.equal(a.net, 1219326285200);
  assert.equal(a.tax, 219478731336);
});

test('document totals and VAT bands', () => {
  const t = documentTotals([
    { quantity: 3, unitPrice: 25, taxRate: 18 },
    { quantity: 1.5, unitPrice: 12.35, taxRate: 18 },
    { quantity: 1, unitPrice: -5, taxRate: 0 },
    { quantity: '', unitPrice: '', taxRate: 18 }, // half-typed line: ignored
  ]);
  assert.equal(t.subtotal, 8853);
  assert.equal(t.tax, 1684);
  assert.equal(t.total, 10537);
  assert.deepEqual(t.bands, [
    { rate: 18, net: 9353, tax: 1684 },
    { rate: 0, net: -500, tax: 0 },
  ]);
});

test('display status', () => {
  const base = { kind: 'invoice', status: 'issued', total: 10000, dueDate: '2026-11-20', today: '2026-11-18' };
  assert.equal(displayStatus({ ...base, status: 'draft', balance: 0 }), 'draft');
  assert.equal(displayStatus({ ...base, status: 'void', balance: 0 }), 'void');
  assert.equal(displayStatus({ ...base, balance: 10000 }), 'awaiting');
  assert.equal(displayStatus({ ...base, balance: 4000 }), 'part_paid');
  assert.equal(displayStatus({ ...base, balance: 0 }), 'paid');
  assert.equal(displayStatus({ ...base, balance: 4000, today: '2026-11-21' }), 'overdue');
  assert.equal(displayStatus({ ...base, balance: 10000, today: '2026-11-20' }), 'awaiting'); // due today is not overdue
  assert.equal(displayStatus({ ...base, kind: 'credit_note', balance: 0 }), 'applied');
  assert.equal(displayStatus({ ...base, kind: 'credit_note', balance: 3000 }), 'open');
});

test('numbers and dates', () => {
  assert.equal(formatDocumentNumber('INV-', 7, 4), 'INV-0007');
  assert.equal(formatDocumentNumber('', 12345, 4), '12345');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  assert.equal(daysBetween('2026-11-18', '2026-12-02'), 14);
  assert.equal(toScaled('2.5', 3), 2500n);
});
