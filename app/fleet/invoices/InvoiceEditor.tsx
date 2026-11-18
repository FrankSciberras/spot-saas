'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import FleetPageHeader from '@/components/fleet/FleetPageHeader';
import { useFleetSetting } from '@/components/fleet/FleetSettingsProvider';
import { deleteDraftAction, issueDocumentAction, saveCustomerAction, saveDraftAction } from '@/lib/actions/invoices';
import { addDays, documentTotals, formatDocumentNumber, lineAmounts, type DocumentKind } from '@/lib/invoices/math';
import type { DocumentDetail, DraftInput, InvoiceCustomer, InvoiceSettings } from '@/lib/invoices/types';
import InvoiceDialog from './InvoiceDialog';
import { inputNumber, moneyOf, shortDate } from './format';
import styles from './invoices.module.css';

interface LineState {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

export interface CreditedInvoice {
  id: string;
  number: string | null;
  issue_date: string | null;
  /** Cents that can still be credited on it (this draft not counted — it isn't issued). */
  creditable_cents: number;
}

export default function InvoiceEditor({
  draft,
  kind,
  customers: initialCustomers,
  settings,
  today,
  currency,
  presetCustomerId,
  credited,
}: {
  /** The saved draft being edited, or null for a brand-new invoice. */
  draft: DocumentDetail | null;
  kind: DocumentKind;
  customers: InvoiceCustomer[];
  settings: InvoiceSettings | null;
  /** Today in the fleet's time zone (YYYY-MM-DD). */
  today: string;
  currency: string;
  presetCustomerId?: string | null;
  /** Credit notes only. */
  credited?: CreditedInvoice | null;
}) {
  const router = useRouter();
  const locale = useFleetSetting('finance.number_format');
  const isCredit = kind === 'credit_note';
  const terms = settings?.payment_terms_days ?? 14;
  const defaultRate = inputNumber(settings?.default_tax_rate ?? 18);
  const money = (cents: number) => moneyOf(cents, currency, locale);

  const makeLine = (key: string): LineState => ({ key, description: '', quantity: '1', unit_price: '', tax_rate: defaultRate });
  // Keys for lines added after the first render (only touched in event handlers).
  const addedLines = useRef(0);
  const blankLine = (): LineState => makeLine(`added-${addedLines.current++}`);

  const [id, setId] = useState<string | null>(draft?.id ?? null);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerId, setCustomerId] = useState(draft?.customer_id ?? presetCustomerId ?? '');
  const [issueDate, setIssueDate] = useState(draft?.issue_date ?? today);
  const [dueDate, setDueDate] = useState(draft?.due_date ?? addDays(draft?.issue_date ?? today, terms));
  // The due date follows the issue date until someone types their own.
  const [dueTouched, setDueTouched] = useState(Boolean(draft?.due_date));
  const [reference, setReference] = useState(draft?.reference ?? '');
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [creditReason, setCreditReason] = useState(draft?.credit_reason ?? '');
  const [lines, setLines] = useState<LineState[]>(() =>
    draft && draft.lines.length > 0
      ? draft.lines.map((l, i) => ({
          key: `saved-${i}`,
          description: l.description,
          quantity: inputNumber(l.quantity),
          unit_price: inputNumber(l.unit_price, 2),
          tax_rate: inputNumber(l.tax_rate),
        }))
      : [makeLine('saved-0')],
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const descriptionRefs = useRef(new Map<string, HTMLInputElement>());

  const totals = useMemo(
    () => documentTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price, taxRate: l.tax_rate }))),
    [lines],
  );
  const overCredit = isCredit && credited ? totals.total > credited.creditable_cents : false;

  const setLine = (key: string, patch: Partial<LineState>) => {
    setSaved(false);
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => {
    const line = blankLine();
    setLines((all) => [...all, line]);
    // Focus the new description once it exists.
    setTimeout(() => descriptionRefs.current.get(line.key)?.focus(), 0);
  };
  const removeLine = (key: string) => {
    setSaved(false);
    setLines((all) => (all.length === 1 ? [blankLine()] : all.filter((l) => l.key !== key)));
  };

  const changeIssueDate = (value: string) => {
    setSaved(false);
    setIssueDate(value);
    if (!dueTouched && value) setDueDate(addDays(value, terms));
  };

  const payload = (): DraftInput => ({
    id,
    kind,
    customer_id: customerId,
    credited_invoice_id: isCredit ? credited?.id ?? draft?.credited_invoice_id ?? null : null,
    credit_reason: isCredit ? creditReason : null,
    issue_date: issueDate || null,
    due_date: isCredit ? null : dueDate || null,
    reference,
    notes,
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })),
  });

  /** Saves the draft; resolves to its id, or null after showing the error. */
  const save = async (): Promise<string | null> => {
    setError(null);
    if (!customerId) {
      setError('Choose a customer.');
      return null;
    }
    const result = await saveDraftAction(payload());
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setId(result.id);
    return result.id;
  };

  const onSave = () =>
    startTransition(async () => {
      const savedId = await save();
      if (!savedId) return;
      setSaved(true);
      // A brand-new draft now has an address of its own.
      if (!draft) router.replace(`/fleet/invoices/${savedId}`);
      router.refresh();
    });

  const onAskIssue = () =>
    startTransition(async () => {
      if (isCredit && !creditReason.trim()) {
        setError('Say why this credit note is being issued. The reason is printed on it.');
        return;
      }
      if (totals.total <= 0) {
        setError('Add at least one line with a price. The total must be more than zero.');
        return;
      }
      const savedId = await save();
      if (savedId) setConfirmIssue(true);
    });

  const onIssue = () =>
    startTransition(async () => {
      if (!id) return;
      setError(null);
      const result = await issueDocumentAction(id, issueDate || today);
      if (!result.ok) {
        setError(result.error);
        setConfirmIssue(false);
        // The draft was saved a moment ago: make sure the URL points at it.
        if (!draft) router.replace(`/fleet/invoices/${id}`);
        return;
      }
      router.replace(`/fleet/invoices/${id}`);
      router.refresh();
    });

  const onCancelIssue = () => {
    setConfirmIssue(false);
    if (!draft && id) {
      router.replace(`/fleet/invoices/${id}`);
      router.refresh();
    }
  };

  const onDelete = () =>
    startTransition(async () => {
      if (!id) {
        router.push('/fleet/invoices');
        return;
      }
      const result = await deleteDraftAction(id);
      if (!result.ok) {
        setError(result.error);
        setConfirmDelete(false);
        return;
      }
      router.push(credited ? `/fleet/invoices/${credited.id}` : '/fleet/invoices');
      router.refresh();
    });

  const nextNumber = settings
    ? formatDocumentNumber(
        isCredit ? settings.credit_note_prefix : settings.invoice_prefix,
        isCredit ? settings.next_credit_note_number : settings.next_invoice_number,
        settings.number_padding,
      )
    : null;
  const what = isCredit ? 'credit note' : 'invoice';
  const customer = customers.find((c) => c.id === customerId) ?? null;

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <FleetPageHeader
        breadcrumb={`Financial / Invoices / ${draft ? 'Draft' : 'New'}`}
        title={isCredit ? 'Draft credit note' : draft ? 'Draft invoice' : 'New invoice'}
      />

      {isCredit && credited && (
        <div className={`${styles.notice} ${styles.creditBanner}`}>
          <FleetIcon name="info" size={16} />
          <span>
            Credit note for invoice{' '}
            <Link href={`/fleet/invoices/${credited.id}`} className={styles.linkBtn}>
              {credited.number ?? 'draft'}
            </Link>
            {credited.issue_date ? ` dated ${shortDate(credited.issue_date)}` : ''}. Up to{' '}
            <strong>{money(credited.creditable_cents)}</strong> can still be credited on it. It reduces what the customer
            owes; anything already paid becomes credit you can refund.
          </span>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Customer</span>
            {isCredit ? (
              <input className={styles.input} value={customer?.name ?? draft?.display_customer ?? ''} disabled readOnly />
            ) : (
              <span className={styles.inline}>
                <select
                  className={styles.select}
                  value={customerId}
                  onChange={(e) => {
                    setSaved(false);
                    setCustomerId(e.target.value);
                  }}
                  disabled={pending}
                >
                  <option value="">Choose a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived_at ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className={styles.btn} onClick={() => setNewCustomer(true)} disabled={pending}>
                  <FleetIcon name="plus" size={14} stroke={2} />
                  New customer
                </button>
              </span>
            )}
            {customer && (customer.address || customer.vat_number) && (
              <span className={styles.fieldHint}>
                {[customer.address?.replace(/\s*\n\s*/g, ', '), customer.vat_number ? `VAT no. ${customer.vat_number}` : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{isCredit ? 'Date' : 'Issue date'}</span>
            <input
              type="date"
              className={styles.input}
              value={issueDate}
              max={today}
              onChange={(e) => changeIssueDate(e.target.value)}
              disabled={pending}
            />
          </label>

          {isCredit ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Reason</span>
              <input
                className={styles.input}
                value={creditReason}
                maxLength={500}
                placeholder="e.g. Two transfers on 12 Nov were cancelled"
                onChange={(e) => {
                  setSaved(false);
                  setCreditReason(e.target.value);
                }}
                disabled={pending}
              />
              <span className={styles.fieldHint}>Printed on the credit note.</span>
            </label>
          ) : (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Due date</span>
              <input
                type="date"
                className={styles.input}
                value={dueDate}
                min={issueDate || undefined}
                onChange={(e) => {
                  setSaved(false);
                  setDueTouched(true);
                  setDueDate(e.target.value);
                }}
                disabled={pending}
              />
              {!dueTouched && <span className={styles.fieldHint}>{terms === 0 ? 'Due on the issue date.' : `${terms} days after the issue date.`}</span>}
            </label>
          )}

          <label className={`${styles.field} ${isCredit ? styles.fieldWide : ''}`}>
            <span className={styles.fieldLabel}>Reference</span>
            <input
              className={styles.input}
              value={reference}
              maxLength={120}
              placeholder={isCredit ? 'Optional' : 'Their PO number, or what this is for'}
              onChange={(e) => {
                setSaved(false);
                setReference(e.target.value);
              }}
              disabled={pending}
            />
          </label>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Lines</h2>
        <p className={styles.panelSub}>Prices are before VAT. Each line can use its own VAT rate.</p>

        <div className={styles.lineHead} aria-hidden="true">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span>VAT %</span>
          <span>Amount</span>
          <span />
        </div>

        {lines.map((line, index) => {
          const amounts = lineAmounts({ quantity: line.quantity, unitPrice: line.unit_price, taxRate: line.tax_rate });
          const isLast = index === lines.length - 1;
          return (
            <div className={styles.line} key={line.key}>
              <div>
                <span className={styles.lineLabel}>Description</span>
                <input
                  ref={(el) => {
                    if (el) descriptionRefs.current.set(line.key, el);
                    else descriptionRefs.current.delete(line.key);
                  }}
                  className={styles.input}
                  value={line.description}
                  maxLength={500}
                  placeholder="What you are charging for"
                  aria-label={`Line ${index + 1} description`}
                  onChange={(e) => setLine(line.key, { description: e.target.value })}
                  disabled={pending}
                />
              </div>
              <div>
                <span className={styles.lineLabel}>Qty</span>
                <input
                  className={`${styles.input} ${styles.inputNum}`}
                  inputMode="decimal"
                  value={line.quantity}
                  aria-label={`Line ${index + 1} quantity`}
                  onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                  disabled={pending}
                />
              </div>
              <div>
                <span className={styles.lineLabel}>Unit price</span>
                <input
                  className={`${styles.input} ${styles.inputNum}`}
                  inputMode="decimal"
                  value={line.unit_price}
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} unit price`}
                  onChange={(e) => setLine(line.key, { unit_price: e.target.value })}
                  disabled={pending}
                />
              </div>
              <div>
                <span className={styles.lineLabel}>VAT %</span>
                <input
                  className={`${styles.input} ${styles.inputNum}`}
                  inputMode="decimal"
                  value={line.tax_rate}
                  aria-label={`Line ${index + 1} VAT rate`}
                  onChange={(e) => setLine(line.key, { tax_rate: e.target.value })}
                  onKeyDown={(e) => {
                    // Enter in the last field of the last line starts the next line.
                    if (e.key === 'Enter' && isLast) {
                      e.preventDefault();
                      addLine();
                    }
                  }}
                  disabled={pending}
                />
              </div>
              <div className={styles.lineTotal} aria-label={`Line ${index + 1} amount`}>
                {amounts ? money(amounts.net) : '—'}
              </div>
              <div className={styles.lineRemove}>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => removeLine(line.key)}
                  disabled={pending}
                  aria-label={`Remove line ${index + 1}`}
                >
                  <FleetIcon name="trash" size={15} />
                </button>
              </div>
            </div>
          );
        })}

        <div className={styles.linesFoot}>
          <div className={styles.linesFootLeft}>
            <button type="button" className={styles.btn} onClick={addLine} disabled={pending || lines.length >= 100} style={{ alignSelf: 'flex-start' }}>
              <FleetIcon name="plus" size={14} stroke={2} />
              Add line
            </button>
            <span className={styles.fieldHint}>For a discount, add a line with a negative price. Decimals can be typed with a point or a comma.</span>
          </div>

          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            {totals.bands.length > 1 ? (
              totals.bands.map((band) => (
                <div className={`${styles.totalRow} ${styles.totalRowBand}`} key={band.rate}>
                  <span>
                    VAT {band.rate}% on {money(band.net)}
                  </span>
                  <span>{money(band.tax)}</span>
                </div>
              ))
            ) : (
              <div className={styles.totalRow}>
                <span>VAT{totals.bands.length === 1 ? ` ${totals.bands[0].rate}%` : ''}</span>
                <span>{money(totals.tax)}</span>
              </div>
            )}
            <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
              <span>{isCredit ? 'Total credit' : 'Total'}</span>
              <span>{money(totals.total)}</span>
            </div>
          </div>
        </div>

        {overCredit && credited && (
          <div className={`${styles.notice} ${styles.noticeWarn}`} style={{ marginTop: 14 }}>
            <FleetIcon name="warning" size={16} />
            <span>
              This is more than can still be credited on {credited.number ?? 'the invoice'} ({money(credited.creditable_cents)}). It can be saved, but not issued.
            </span>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Notes</span>
          <textarea
            className={styles.textarea}
            value={notes}
            maxLength={2000}
            placeholder="Optional. Printed under the lines."
            onChange={(e) => {
              setSaved(false);
              setNotes(e.target.value);
            }}
            disabled={pending}
          />
        </label>
      </div>

      <div className={styles.actionBar}>
        {error && (
          <p className={`${styles.error} ${styles.actionError}`} role="alert">
            {error}
          </p>
        )}
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onAskIssue} disabled={pending}>
          <FleetIcon name="check" size={15} stroke={2} />
          {pending && confirmIssue ? 'Issuing…' : `Issue ${what}`}
        </button>
        <button type="button" className={styles.btn} onClick={onSave} disabled={pending}>
          {pending && !confirmIssue && !confirmDelete ? 'Saving…' : 'Save draft'}
        </button>
        {saved && !pending && <span className={styles.fieldHint}>Draft saved.</span>}
        <span className={styles.actionBarSpacer} />
        {id ? (
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setConfirmDelete(true)} disabled={pending}>
            <FleetIcon name="trash" size={15} />
            Delete draft
          </button>
        ) : (
          <Link href="/fleet/invoices" className={styles.btn}>
            Cancel
          </Link>
        )}
      </div>

      {confirmIssue && (
        <InvoiceDialog
          title={`Issue this ${what}?`}
          onClose={onCancelIssue}
          busy={pending}
          footer={
            <>
              <button type="button" className={styles.btn} onClick={onCancelIssue} disabled={pending}>
                Not yet
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onIssue} disabled={pending}>
                {pending ? 'Issuing…' : `Issue ${what}`}
              </button>
            </>
          }
        >
          <p>
            <strong>{money(totals.total)}</strong> {isCredit ? 'credited to' : 'to'} <strong>{customer?.name ?? draft?.display_customer ?? 'the customer'}</strong>, dated{' '}
            {shortDate(issueDate || today)}.
          </p>
          <ul>
            <li>
              It gets the next number in your sequence{nextNumber ? <> (<strong>{nextNumber}</strong>)</> : null}.
            </li>
            <li>
              Once issued it <strong>cannot be edited or deleted</strong>.
            </li>
            <li>{isCredit ? 'It is applied to the invoice straight away, reducing what the customer owes.' : 'A mistake is corrected afterwards with a credit note, not by changing the invoice.'}</li>
          </ul>
        </InvoiceDialog>
      )}

      {confirmDelete && (
        <InvoiceDialog
          title="Delete this draft?"
          onClose={() => setConfirmDelete(false)}
          busy={pending}
          footer={
            <>
              <button type="button" className={styles.btn} onClick={() => setConfirmDelete(false)} disabled={pending}>
                Keep it
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={onDelete} disabled={pending}>
                {pending ? 'Deleting…' : 'Delete draft'}
              </button>
            </>
          }
        >
          <p>The draft and its lines are removed. It never had a number, so nothing is missing from your sequence.</p>
        </InvoiceDialog>
      )}

      {newCustomer && (
        <NewCustomerDialog
          onClose={() => setNewCustomer(false)}
          onCreated={(created) => {
            setCustomers((all) => [...all, created].sort((a, b) => a.name.localeCompare(b.name)));
            setCustomerId(created.id);
            setSaved(false);
            setNewCustomer(false);
          }}
        />
      )}
    </div>
  );
}

function NewCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: InvoiceCustomer) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveCustomerAction({ name, email, address, vat_number: vat });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated({
        id: result.id,
        organization_id: '',
        name: name.trim(),
        contact_name: null,
        email: email.trim() || null,
        phone: null,
        address: address.trim() || null,
        vat_number: vat.trim() || null,
        notes: null,
        archived_at: null,
        created_at: new Date().toISOString(),
      });
    });

  return (
    <InvoiceDialog
      title="New customer"
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Adding…' : 'Add customer'}
          </button>
        </>
      }
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Name</span>
        <input className={styles.input} value={name} maxLength={200} autoFocus placeholder="Company or person" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Email</span>
        <input className={styles.input} type="email" value={email} maxLength={200} placeholder="Where invoices are sent" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Address</span>
        <textarea className={styles.textarea} value={address} maxLength={600} placeholder="Printed on the invoice, as written" onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>VAT number</span>
        <input className={styles.input} value={vat} maxLength={40} placeholder="Optional" onChange={(e) => setVat(e.target.value)} />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}
