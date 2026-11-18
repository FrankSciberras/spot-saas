'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveXeroSettingsAction } from '@/lib/actions/xero';
import type { XeroReferenceData } from '@/lib/xero/reference';
import type { XeroSettings } from '@/lib/xero/types';
import styles from './xero.module.css';

interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

/**
 * What is sent to Xero, and where it lands there: the start date, the sales
 * account, a Xero tax rate for each VAT rate the fleet uses, and — optionally —
 * payments and bookkeeping lines. Every choice is offered from the connected
 * organisation's own chart of accounts, so nothing can be mistyped.
 */
export default function XeroSetup({
  settings,
  reference,
  ratesInUse,
  categories,
  baseCurrency,
}: {
  settings: XeroSettings;
  reference: XeroReferenceData;
  /** VAT rates used on the fleet's invoices, as "18.00" keys, highest first. */
  ratesInUse: string[];
  categories: Category[];
  baseCurrency: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // A VAT rate with exactly one Xero tax rate at that percentage is suggested;
  // anything ambiguous is left for the admin (or their accountant) to pick.
  const suggestedTax = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of ratesInUse) {
      const matches = reference.taxRates.filter((t) => Math.abs(t.rate - Number(key)) < 0.005);
      if (matches.length === 1) out[key] = matches[0].taxType;
    }
    return out;
  }, [ratesInUse, reference.taxRates]);

  const [form, setForm] = useState<XeroSettings>(() => ({
    ...settings,
    sales_account_code: settings.sales_account_code ?? (reference.salesAccounts.length === 1 ? reference.salesAccounts[0].code : null),
    tax_types: { ...suggestedTax, ...settings.tax_types },
    bank_account_id: settings.bank_account_id ?? (reference.bankAccounts.length === 1 ? reference.bankAccounts[0].id : null),
  }));
  const set = <K extends keyof XeroSettings>(key: K, value: XeroSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  const missing: string[] = [];
  if (!form.sales_account_code) missing.push('the sales account');
  for (const key of ratesInUse) if (!form.tax_types[key]) missing.push(`a tax rate for ${Number(key)}% VAT`);
  if ((form.send_payments || form.send_bookkeeping) && !form.bank_account_id) missing.push('the bank account');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await saveXeroSettingsAction(form);
      setMessage(res.ok ? { tone: 'ok', text: 'Saved. Anything that was waiting on these choices will be sent on the next run — or press “Send now”.' } : { tone: 'bad', text: res.error });
      if (res.ok) router.refresh();
    });
  };

  const expense = categories.filter((c) => c.kind === 'expense');
  const income = categories.filter((c) => c.kind === 'income');
  const unmapped = form.send_bookkeeping ? categories.filter((c) => !form.category_accounts[c.id]).length : 0;

  const categoryRows = (list: Category[]) =>
    list.map((c) => (
      <div className={styles.mapRow} key={c.id}>
        <label htmlFor={`cat-${c.id}`}>{c.name}</label>
        <select
          id={`cat-${c.id}`}
          className={styles.select}
          value={form.category_accounts[c.id] ?? ''}
          disabled={pending}
          onChange={(e) => {
            const next = { ...form.category_accounts };
            if (e.target.value) next[c.id] = e.target.value;
            else delete next[c.id];
            set('category_accounts', next);
          }}
        >
          <option value="">Don’t send this category</option>
          {reference.ledgerAccounts.map((a) => (
            <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
          ))}
        </select>
      </div>
    ));

  return (
    <form className={styles.section} onSubmit={save}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>What is sent, and where it goes</h2>
      </div>

      {missing.length > 0 && (
        <div className={styles.warn}>
          Still to choose: {missing.join(', ')}. Documents that need one of these wait until it is chosen; nothing is sent with a guess.
        </div>
      )}

      <div className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <label className={styles.rowLabel} htmlFor="xero-from">Start sending from</label>
            <p className={styles.rowHint}>Invoices, credit notes and bookkeeping lines dated on or after this day are sent. Earlier ones are left alone, so nothing your accountant already entered is duplicated.</p>
          </div>
          <input id="xero-from" type="date" className={styles.input} value={form.sync_from ?? ''} onChange={(e) => set('sync_from', e.target.value || null)} disabled={pending} required />
        </div>
        <div className={styles.row} data-control="toggle">
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>Send automatically</span>
            <p className={styles.rowHint}>A few seconds after you issue, void or record a payment, and once an hour as a safety net. Switch off to send only when you press “Send now”.</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={form.auto_sync} onChange={(e) => set('auto_sync', e.target.checked)} disabled={pending} aria-label="Send automatically" />
            <span />
          </label>
        </div>
      </div>

      <h3 className={styles.groupTitle}>Invoices and credit notes</h3>
      <div className={styles.group}>
        <div className={styles.row}>
          <div className={styles.rowText}>
            <label className={styles.rowLabel} htmlFor="xero-sales">Sales account</label>
            <p className={styles.rowHint}>The revenue account every invoice line is booked to in Xero. Your accountant will know which one; “Sales” is the usual choice.</p>
          </div>
          <select id="xero-sales" className={styles.select} value={form.sales_account_code ?? ''} onChange={(e) => set('sales_account_code', e.target.value || null)} disabled={pending}>
            <option value="">Choose an account</option>
            {reference.salesAccounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
          </select>
        </div>
        {ratesInUse.map((key) => (
          <div className={styles.row} key={key}>
            <div className={styles.rowText}>
              <label className={styles.rowLabel} htmlFor={`xero-tax-${key}`}>{Number(key)}% VAT</label>
              <p className={styles.rowHint}>The Xero tax rate used for lines at {Number(key)}%. Rovora sends its own VAT amount to the cent, so the totals match the invoice your customer received.</p>
            </div>
            <select
              id={`xero-tax-${key}`}
              className={styles.select}
              value={form.tax_types[key] ?? ''}
              disabled={pending}
              onChange={(e) => {
                const next = { ...form.tax_types };
                if (e.target.value) next[key] = e.target.value;
                else delete next[key];
                set('tax_types', next);
              }}
            >
              <option value="">Choose a tax rate</option>
              {reference.taxRates.map((t) => (
                <option key={t.taxType} value={t.taxType}>{t.name} ({t.rate}%)</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <h3 className={styles.groupTitle}>Payments</h3>
      <div className={styles.group}>
        <div className={styles.row} data-control="toggle">
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>Send payments and refunds</span>
            <p className={styles.rowHint}>A payment you record on an invoice here marks it paid in Xero too. Leave off if your accountant reconciles payments from the bank feed instead — sending both would count the money twice.</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={form.send_payments} onChange={(e) => set('send_payments', e.target.checked)} disabled={pending} aria-label="Send payments and refunds" />
            <span />
          </label>
        </div>
        {(form.send_payments || form.send_bookkeeping) && (
          <div className={styles.row}>
            <div className={styles.rowText}>
              <label className={styles.rowLabel} htmlFor="xero-bank">Bank account</label>
              <p className={styles.rowHint}>The account in Xero the money is received into or paid from{baseCurrency ? ` (${baseCurrency})` : ''}.</p>
            </div>
            <select id="xero-bank" className={styles.select} value={form.bank_account_id ?? ''} onChange={(e) => set('bank_account_id', e.target.value || null)} disabled={pending}>
              <option value="">Choose a bank account</option>
              {reference.bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ''}{a.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <h3 className={styles.groupTitle}>Bookkeeping</h3>
      <div className={styles.group}>
        <div className={styles.row} data-control="toggle">
          <div className={styles.rowText}>
            <span className={styles.rowLabel}>Send expenses and income from Bookkeeping</span>
            <p className={styles.rowHint}>Each bookkeeping line becomes a spend-money or receive-money transaction in Xero. Lines you later edit or delete here are updated or removed there. Payments on invoices are never sent this way, so they can’t be counted twice.</p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={form.send_bookkeeping} onChange={(e) => set('send_bookkeeping', e.target.checked)} disabled={pending} aria-label="Send expenses and income from Bookkeeping" />
            <span />
          </label>
        </div>
        {form.send_bookkeeping && (
          <>
            <div className={styles.row}>
              <div className={styles.rowText}>
                <label className={styles.rowLabel} htmlFor="xero-booktax">Tax on these lines</label>
                <p className={styles.rowHint}>Rovora’s bookkeeping doesn’t record VAT on expenses. “No tax” sends amounts as they are; your accountant can add VAT in Xero where there is a valid receipt.</p>
              </div>
              <select id="xero-booktax" className={styles.select} value={form.bookkeeping_tax} onChange={(e) => set('bookkeeping_tax', e.target.value === 'Inclusive' ? 'Inclusive' : 'NoTax')} disabled={pending}>
                <option value="NoTax">No tax (recommended)</option>
                <option value="Inclusive">Amounts include tax — use each account’s default rate</option>
              </select>
            </div>
            <div className={styles.mapBlock}>
              <p className={styles.rowHint}>
                Choose the Xero account for each category. A category with no account is not sent{unmapped > 0 ? ` (${unmapped} not chosen yet)` : ''}.
              </p>
              {expense.length > 0 && <div className={styles.mapHeading}>Expenses</div>}
              {categoryRows(expense)}
              {income.length > 0 && <div className={styles.mapHeading}>Income</div>}
              {categoryRows(income)}
            </div>
          </>
        )}
      </div>

      <div className={styles.formActions}>
        {message && <p className={styles.formNote} data-tone={message.tone} role="status">{message.text}</p>}
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Checking with Xero…' : 'Save'}</button>
      </div>
    </form>
  );
}
