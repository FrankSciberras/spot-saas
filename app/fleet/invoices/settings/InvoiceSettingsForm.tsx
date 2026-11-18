'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { saveInvoiceSettingsAction } from '@/lib/actions/invoices';
import { formatDocumentNumber } from '@/lib/invoices/math';
import type { InvoiceSettings } from '@/lib/invoices/types';
import styles from '../invoices.module.css';

export interface CategoryOption {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

export interface SellerDetails {
  name: string;
  address: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
}

const PREFIX = /^[A-Za-z0-9/_.-]{0,12}$/;

export default function InvoiceSettingsForm({
  settings,
  categories,
  seller,
  lastInvoiceSeq,
  lastCreditNoteSeq,
}: {
  settings: InvoiceSettings;
  categories: CategoryOption[];
  seller: SellerDetails;
  /** Highest invoice / credit note number already issued (0 = none). */
  lastInvoiceSeq: number;
  lastCreditNoteSeq: number;
}) {
  const router = useRouter();
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoice_prefix);
  const [creditPrefix, setCreditPrefix] = useState(settings.credit_note_prefix);
  const [nextInvoice, setNextInvoice] = useState(String(settings.next_invoice_number));
  const [nextCredit, setNextCredit] = useState(String(settings.next_credit_note_number));
  const [padding, setPadding] = useState(String(settings.number_padding));
  const [taxRate, setTaxRate] = useState(String(settings.default_tax_rate));
  const [terms, setTerms] = useState(String(settings.payment_terms_days));
  const [instructions, setInstructions] = useState(settings.payment_instructions ?? '');
  const [footer, setFooter] = useState(settings.footer_note ?? '');
  const [record, setRecord] = useState(settings.record_payments_in_books);
  const [incomeCategory, setIncomeCategory] = useState(settings.income_category_id ?? '');
  const [refundCategory, setRefundCategory] = useState(settings.refund_category_id ?? '');

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setSaved(false);
    setter(value);
  };

  const pad = Math.min(Math.max(Number.parseInt(padding, 10) || 1, 1), 10);
  const preview = (prefix: string, next: string) => (PREFIX.test(prefix) ? formatDocumentNumber(prefix, Number.parseInt(next, 10) || 1, pad) : 'Not allowed');

  const income = categories.filter((c) => c.kind === 'income');
  const expense = categories.filter((c) => c.kind === 'expense');
  const missing = [!seller.address && 'address', !seller.vatNumber && 'VAT number'].filter(Boolean) as string[];

  const submit = () =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const result = await saveInvoiceSettingsAction({
        invoice_prefix: invoicePrefix.trim(),
        credit_note_prefix: creditPrefix.trim(),
        next_invoice_number: Number(nextInvoice),
        next_credit_note_number: Number(nextCredit),
        number_padding: Number(padding),
        default_tax_rate: taxRate,
        payment_terms_days: Number(terms),
        payment_instructions: instructions,
        footer_note: footer,
        record_payments_in_books: record,
        income_category_id: incomeCategory || null,
        refund_category_id: refundCategory || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Your details on every invoice</h2>
        <p className={styles.panelSub}>
          Copied onto each invoice when it is issued, so an old invoice keeps the details it was issued with.{' '}
          <Link href="/fleet/settings?tab=general" className={styles.linkBtn}>
            Edit in Settings → General
          </Link>
        </p>
        <dl className={styles.facts}>
          <dt>Name</dt>
          <dd>{seller.name}</dd>
          <dt>Address</dt>
          <dd>{seller.address || <span className={styles.missing}>Not set</span>}</dd>
          <dt>VAT number</dt>
          <dd>{seller.vatNumber || <span className={styles.missing}>Not set</span>}</dd>
          <dt>Email</dt>
          <dd>{seller.email || <span className={styles.missing}>Not set</span>}</dd>
          <dt>Phone</dt>
          <dd>{seller.phone || <span className={styles.missing}>Not set</span>}</dd>
        </dl>
        {missing.length > 0 && (
          <div className={`${styles.notice} ${styles.noticeWarn}`} style={{ marginTop: 14 }}>
            <FleetIcon name="warning" size={16} />
            <span>
              Your {missing.join(' and ')} {missing.length === 1 ? 'is' : 'are'} missing. An invoice normally has to show {missing.length === 1 ? 'it' : 'them'} — add{' '}
              {missing.length === 1 ? 'it' : 'them'} before you issue your first one.
            </span>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Numbering</h2>
        <p className={styles.panelSub}>
          A document gets its number when it is issued, never before, so the sequence has no gaps. A counter can only move forward.
        </p>
        <div className={`${styles.fields} ${styles.fields3}`}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Invoice prefix</span>
            <input className={styles.input} value={invoicePrefix} maxLength={12} onChange={(e) => touch(setInvoicePrefix)(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Next invoice number</span>
            <input className={`${styles.input} ${styles.inputNum}`} inputMode="numeric" value={nextInvoice} onChange={(e) => touch(setNextInvoice)(e.target.value.replace(/\D/g, ''))} disabled={pending} />
            {lastInvoiceSeq > 0 && <span className={styles.fieldHint}>Must be higher than {lastInvoiceSeq}, the last one issued.</span>}
          </label>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Your next invoice</span>
            <span>
              <span className={styles.preview}>{preview(invoicePrefix, nextInvoice)}</span>
            </span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Credit note prefix</span>
            <input className={styles.input} value={creditPrefix} maxLength={12} onChange={(e) => touch(setCreditPrefix)(e.target.value)} disabled={pending} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Next credit note number</span>
            <input className={`${styles.input} ${styles.inputNum}`} inputMode="numeric" value={nextCredit} onChange={(e) => touch(setNextCredit)(e.target.value.replace(/\D/g, ''))} disabled={pending} />
            {lastCreditNoteSeq > 0 && <span className={styles.fieldHint}>Must be higher than {lastCreditNoteSeq}, the last one issued.</span>}
          </label>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Your next credit note</span>
            <span>
              <span className={styles.preview}>{preview(creditPrefix, nextCredit)}</span>
            </span>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Digits</span>
            <select className={styles.select} value={padding} onChange={(e) => touch(setPadding)(e.target.value)} disabled={pending}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} — {formatDocumentNumber('', 7, n)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.fieldHint} style={{ marginTop: 10 }}>
          A prefix can use letters, numbers and - _ . / (up to 12 characters), or be left empty.
        </p>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>VAT and payment terms</h2>
        <p className={styles.panelSub}>Starting values for a new invoice. Both can be changed on each one.</p>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Usual VAT rate (%)</span>
            <input className={`${styles.input} ${styles.inputNum}`} inputMode="decimal" value={taxRate} onChange={(e) => touch(setTaxRate)(e.target.value)} disabled={pending} />
            <span className={styles.fieldHint}>Filled in on each new line. Use 0 if you don’t charge VAT.</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Payment terms (days)</span>
            <input className={`${styles.input} ${styles.inputNum}`} inputMode="numeric" value={terms} onChange={(e) => touch(setTerms)(e.target.value.replace(/\D/g, ''))} disabled={pending} />
            <span className={styles.fieldHint}>The due date is this many days after the issue date. 0 = due on issue.</span>
          </label>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Printed on every invoice</h2>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>How to pay</span>
            <textarea
              className={styles.textarea}
              value={instructions}
              maxLength={1000}
              placeholder={'Bank: …\nIBAN: …\nPlease quote the invoice number.'}
              onChange={(e) => touch(setInstructions)(e.target.value)}
              disabled={pending}
            />
            <span className={styles.fieldHint}>Bank details and how to pay — printed on every invoice (not on credit notes).</span>
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Footer note</span>
            <textarea
              className={styles.textarea}
              value={footer}
              maxLength={1000}
              placeholder="e.g. company registration number, or a thank-you line"
              onChange={(e) => touch(setFooter)(e.target.value)}
              disabled={pending}
            />
            <span className={styles.fieldHint}>Small print at the bottom of each page.</span>
          </label>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.switchRow}>
          <div>
            <h2 className={styles.panelTitle}>Record payments in Bookkeeping</h2>
            <p className={styles.panelSub} style={{ marginBottom: 0 }}>
              When you record a payment on an invoice, a matching line is added to your books on the same date. Removing the payment removes the line.
            </p>
          </div>
          <label className={styles.switch}>
            <input type="checkbox" checked={record} onChange={(e) => touch(setRecord)(e.target.checked)} disabled={pending} aria-label="Record payments in Bookkeeping" />
            <span className={styles.switchTrack} />
          </label>
        </div>
        {record && (
          <div className={styles.fields} style={{ marginTop: 16 }}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Payments received go to</span>
              <select className={styles.select} value={incomeCategory} onChange={(e) => touch(setIncomeCategory)(e.target.value)} disabled={pending}>
                <option value="">Don’t record payments</option>
                {income.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>An income category.</span>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Refunds paid out go to</span>
              <select className={styles.select} value={refundCategory} onChange={(e) => touch(setRefundCategory)(e.target.value)} disabled={pending}>
                <option value="">Don’t record refunds</option>
                {expense.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>An expense category. A refund is money you pay back on a credit note.</span>
            </label>
          </div>
        )}
      </div>

      <div className={styles.actionBar}>
        {error && (
          <p className={`${styles.error} ${styles.actionError}`} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {saved && !pending && <span className={styles.fieldHint}>Settings saved.</span>}
      </div>
    </form>
  );
}
