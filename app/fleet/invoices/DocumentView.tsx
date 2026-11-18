'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import FleetPageHeader from '@/components/fleet/FleetPageHeader';
import { useFleetSetting } from '@/components/fleet/FleetSettingsProvider';
import { deletePaymentAction, recordPaymentAction, startCreditNoteAction, voidDocumentAction } from '@/lib/actions/invoices';
import { emailDocumentAction } from '@/lib/actions/invoice-email';
import { STATUS_LABEL, fromCents, toCents } from '@/lib/invoices/math';
import { PAYMENT_METHODS, type DocumentDetail, type InvoicePayment, type PaymentMethod } from '@/lib/invoices/types';
import InvoiceDialog from './InvoiceDialog';
import { moneyOf, shortDate, STATUS_TONE } from './format';
import styles from './invoices.module.css';

type DialogKind = 'payment' | 'email' | 'void' | null;

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;

const trimNumber = (value: number, locale: string, max: number) => {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(value);
  } catch {
    return String(value);
  }
};

export default function DocumentView({
  doc,
  today,
  postsToBooks,
}: {
  doc: DocumentDetail;
  /** Today in the fleet's time zone (YYYY-MM-DD). */
  today: string;
  /** Whether recording a payment also writes a bookkeeping line (for the wording). */
  postsToBooks: boolean;
}) {
  const router = useRouter();
  const locale = useFleetSetting('finance.number_format');
  const money = (cents: number) => moneyOf(cents, doc.currency, locale);
  const c = (value: number) => toCents(value) ?? 0;

  const isCredit = doc.kind === 'credit_note';
  const isVoid = doc.status === 'void';
  const what = isCredit ? 'credit note' : 'invoice';

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [removing, setRemoving] = useState<InvoicePayment | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const close = () => {
    setDialog(null);
    setRemoving(null);
  };
  const done = (message: string) => {
    close();
    setError(null);
    setNotice(message);
    router.refresh();
  };

  const onDownload = async () => {
    setError(null);
    setDownloading(true);
    try {
      const { downloadInvoicePdf } = await import('./pdfClient');
      await downloadInvoicePdf(doc, locale);
    } catch (e) {
      console.error('invoice PDF failed:', e);
      setError('The PDF could not be created. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const onCredit = () =>
    startTransition(async () => {
      setError(null);
      const result = await startCreditNoteAction(doc.id, 'full');
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/fleet/invoices/${result.id}`);
    });

  // ── What the lines add up to, per VAT rate (from the stored, issued figures) ──
  const bands = new Map<number, { net: number; tax: number }>();
  for (const line of doc.lines) {
    const band = bands.get(line.tax_rate) ?? { net: 0, tax: 0 };
    band.net += c(line.line_net);
    band.tax += c(line.line_tax);
    bands.set(line.tax_rate, band);
  }
  const bandRows = [...bands.entries()].sort((a, b) => b[0] - a[0]);

  const canPay = doc.status === 'issued' && doc.balance_cents > 0;
  const canCredit = !isCredit && doc.status === 'issued' && doc.creditable_cents > 0;
  const draftCredit = doc.credit_notes.find((n) => n.status === 'draft');
  // The database refuses these; don't offer what can't work.
  const canVoid =
    doc.status === 'issued' &&
    doc.payments.length === 0 &&
    (isCredit ? doc.allocations.length === 0 : !doc.credit_notes.some((n) => n.status === 'issued'));
  const voidBlocked = isCredit
    ? doc.payments.length > 0
      ? 'It has been refunded, so it can’t be voided.'
      : 'It has been applied to its invoice, so it can’t be voided. Issue a new invoice to reverse it.'
    : doc.payments.length > 0
      ? 'Remove its payments first, or issue a credit note instead.'
      : 'It has a credit note against it, so it can’t be voided.';

  const dueLine = (() => {
    if (isVoid) return null;
    if (isCredit) return doc.balance_cents > 0 ? 'Not applied to an invoice. Refund it to the customer.' : 'Fully applied or refunded.';
    if (doc.balance_cents === 0) return 'Paid in full.';
    if (!doc.due_date) return null;
    if (doc.due_date < today) {
      const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${doc.due_date}T00:00:00Z`)) / 86_400_000);
      return `Was due ${shortDate(doc.due_date)} — ${days} ${days === 1 ? 'day' : 'days'} ago.`;
    }
    return doc.due_date === today ? 'Due today.' : `Due ${shortDate(doc.due_date)}.`;
  })();

  return (
    <div className={styles.page}>
      <FleetPageHeader
        breadcrumb={`Financial / Invoices / ${isCredit ? 'Credit note' : 'Invoice'}`}
        title={`${isCredit ? 'Credit note' : 'Invoice'} ${doc.number ?? ''}`}
        action={
          <Link href="/fleet/invoices" className={styles.btn}>
            <FleetIcon name="chevron-left" size={15} />
            All invoices
          </Link>
        }
      />

      <div className={styles.docLayout}>
        {/* ── The document, as the customer sees it ── */}
        <div className={`${styles.paper} ${isVoid ? styles.paperVoid : ''}`}>
          {isVoid && (
            <div className={styles.voidBanner} role="status">
              <FleetIcon name="warning" size={16} />
              <span>
                <strong>VOID</strong> — this {what} no longer counts{doc.voided_at ? ` (voided ${shortDate(doc.voided_at)})` : ''}. It keeps its
                number.{doc.void_reason ? ` Reason: ${doc.void_reason}` : ''}
              </span>
            </div>
          )}

          <div className={styles.paperBody}>
            <div className={styles.paperTop}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.sellerName}>{doc.seller_name ?? ''}</div>
                {doc.seller_address && <div className={styles.paperSmall}>{doc.seller_address}</div>}
                {doc.seller_vat_number && <div className={styles.paperSmall}>VAT no. {doc.seller_vat_number}</div>}
                {(doc.seller_email || doc.seller_phone) && (
                  <div className={styles.paperSmall}>{[doc.seller_email, doc.seller_phone].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <div className={styles.paperTitleBlock}>
                <div className={styles.paperTitle}>{isCredit ? 'CREDIT NOTE' : 'INVOICE'}</div>
                <div className={styles.paperNumber}>{doc.number}</div>
                <dl className={styles.paperMeta}>
                  <dt>{isCredit ? 'Date' : 'Issue date'}</dt>
                  <dd>{shortDate(doc.issue_date)}</dd>
                  {!isCredit && (
                    <>
                      <dt>Due date</dt>
                      <dd>{shortDate(doc.due_date)}</dd>
                    </>
                  )}
                  {doc.reference && (
                    <>
                      <dt>Reference</dt>
                      <dd>{doc.reference}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            <div className={styles.paperParties}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.kicker}>{isCredit ? 'Credit to' : 'Bill to'}</div>
                <div className={styles.partyName}>{doc.customer_name ?? doc.display_customer}</div>
                {doc.customer_address && <div className={styles.paperSmall}>{doc.customer_address}</div>}
                {doc.customer_vat_number && <div className={styles.paperSmall}>VAT no. {doc.customer_vat_number}</div>}
              </div>
              {isCredit && (
                <div style={{ minWidth: 0 }}>
                  <div className={styles.kicker}>Credit for</div>
                  <div className={styles.partyName}>
                    {doc.credited_invoice ? (
                      <Link href={`/fleet/invoices/${doc.credited_invoice.id}`} className={styles.linkBtn}>
                        Invoice {doc.credited_invoice.number}
                      </Link>
                    ) : (
                      'An earlier invoice'
                    )}
                  </div>
                  {doc.credited_invoice?.issue_date && <div className={styles.paperSmall}>Dated {shortDate(doc.credited_invoice.issue_date)}</div>}
                  {doc.credit_reason && <div className={styles.paperSmall}>Reason: {doc.credit_reason}</div>}
                </div>
              )}
            </div>

            <table className={styles.paperTable}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className={`${styles.num} ${styles.colHideSm}`}>Qty</th>
                  <th className={`${styles.num} ${styles.colHideSm}`}>Unit price</th>
                  <th className={`${styles.num} ${styles.colHideSm}`}>VAT</th>
                  <th className={styles.num}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.description}
                      <span className={styles.paperLineSub}>
                        {trimNumber(line.quantity, locale, 3)} × {money(c(line.unit_price))} · VAT {trimNumber(line.tax_rate, locale, 2)}%
                      </span>
                    </td>
                    <td className={`${styles.num} ${styles.colHideSm}`}>{trimNumber(line.quantity, locale, 3)}</td>
                    <td className={`${styles.num} ${styles.colHideSm}`}>{money(c(line.unit_price))}</td>
                    <td className={`${styles.num} ${styles.colHideSm}`}>{trimNumber(line.tax_rate, locale, 2)}%</td>
                    <td className={styles.num}>{money(c(line.line_net))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.paperBottom}>
              <div className={styles.vatSummary}>
                <div className={styles.kicker}>VAT summary</div>
                <table>
                  <thead>
                    <tr>
                      <th>Rate</th>
                      <th className={styles.num}>Net</th>
                      <th className={styles.num}>VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bandRows.map(([rate, band]) => (
                      <tr key={rate}>
                        <td>{trimNumber(rate, locale, 2)}%</td>
                        <td className={styles.num}>{money(band.net)}</td>
                        <td className={styles.num}>{money(band.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.totals}>
                <div className={styles.totalRow}>
                  <span>Subtotal</span>
                  <span>{money(c(doc.subtotal))}</span>
                </div>
                <div className={styles.totalRow}>
                  <span>VAT</span>
                  <span>{money(c(doc.tax_total))}</span>
                </div>
                <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
                  <span>{isCredit ? 'Total credit' : 'Total'}</span>
                  <span>{money(c(doc.total))}</span>
                </div>
                {doc.status === 'issued' && !isCredit && (
                  <>
                    {doc.paid_cents > 0 && (
                      <div className={styles.totalRow}>
                        <span>Paid</span>
                        <span>{money(-doc.paid_cents)}</span>
                      </div>
                    )}
                    {doc.credited_cents > 0 && (
                      <div className={styles.totalRow}>
                        <span>Credit notes</span>
                        <span>{money(-doc.credited_cents)}</span>
                      </div>
                    )}
                    <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
                      <span>Balance due</span>
                      <span>{money(doc.balance_cents)}</span>
                    </div>
                  </>
                )}
                {doc.status === 'issued' && isCredit && (
                  <>
                    {doc.credited_cents > 0 && (
                      <div className={styles.totalRow}>
                        <span>Applied to invoice</span>
                        <span>{money(-doc.credited_cents)}</span>
                      </div>
                    )}
                    {doc.paid_cents > 0 && (
                      <div className={styles.totalRow}>
                        <span>Refunded</span>
                        <span>{money(-doc.paid_cents)}</span>
                      </div>
                    )}
                    <div className={`${styles.totalRow} ${styles.totalRowStrong}`}>
                      <span>Credit remaining</span>
                      <span>{money(doc.balance_cents)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {doc.notes && (
              <div className={styles.paperSection}>
                <div className={styles.kicker}>Notes</div>
                <div className={styles.paperSmall}>{doc.notes}</div>
              </div>
            )}
            {!isCredit && !isVoid && doc.payment_instructions && (
              <div className={styles.paperSection}>
                <div className={styles.kicker}>How to pay</div>
                <div className={styles.paperSmall}>{doc.payment_instructions}</div>
              </div>
            )}
            {doc.footer_note && <div className={styles.paperFooter}>{doc.footer_note}</div>}
          </div>
        </div>

        {/* ── Status, actions, what has happened to it ── */}
        <div className={styles.side}>
          <div className={styles.panel}>
            <span className={`${styles.chip} ${styles.chipLarge}`} data-tone={STATUS_TONE[doc.display_status]}>
              {STATUS_LABEL[doc.display_status]}
            </span>
            {!isVoid && (
              <>
                <div className={styles.balanceLabel}>{isCredit ? 'Credit left to refund' : 'Balance due'}</div>
                <div className={styles.balanceValue}>{money(doc.balance_cents)}</div>
              </>
            )}
            {dueLine && <div className={styles.balanceHint}>{dueLine}</div>}

            <div className={styles.actions}>
              {canPay && (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setDialog('payment')} disabled={pending}>
                  <FleetIcon name="euro" size={15} />
                  {isCredit ? 'Record refund' : 'Record payment'}
                </button>
              )}
              <button type="button" className={styles.btn} onClick={onDownload} disabled={downloading}>
                <FleetIcon name="download" size={15} />
                {downloading ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              {!isVoid && (
                <button type="button" className={styles.btn} onClick={() => setDialog('email')} disabled={pending}>
                  <FleetIcon name="mail" size={15} />
                  Email to customer
                </button>
              )}
              {draftCredit ? (
                <Link href={`/fleet/invoices/${draftCredit.id}`} className={styles.btn}>
                  <FleetIcon name="pencil" size={15} />
                  Continue draft credit note
                </Link>
              ) : (
                canCredit && (
                  <button type="button" className={styles.btn} onClick={onCredit} disabled={pending}>
                    <FleetIcon name="minus" size={15} />
                    {pending ? 'Starting…' : 'Create credit note'}
                  </button>
                )
              )}
              {doc.status === 'issued' && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() => setDialog('void')}
                  disabled={pending || !canVoid}
                  title={canVoid ? undefined : voidBlocked}
                >
                  <FleetIcon name="close" size={15} />
                  Void {what}
                </button>
              )}
            </div>
            {doc.status === 'issued' && !canVoid && <p className={styles.sentLine}>Can’t be voided: {voidBlocked}</p>}
            {doc.sent_at && (
              <p className={styles.sentLine}>
                Sent to {doc.sent_to} on {shortDate(doc.sent_at)}.
              </p>
            )}
            {notice && (
              <p className={styles.sentLine} role="status" style={{ color: 'var(--pos)' }}>
                {notice}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert" style={{ marginTop: 10 }}>
                {error}
              </p>
            )}
          </div>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{isCredit ? 'Where the credit went' : 'Payments and credits'}</h2>
            {doc.payments.length === 0 && doc.allocations.length === 0 && doc.credit_notes.length === 0 ? (
              <p className={styles.panelSub} style={{ marginBottom: 0 }}>
                {isVoid ? 'Nothing was recorded on it.' : isCredit ? 'Nothing yet.' : 'No payments recorded yet.'}
              </p>
            ) : (
              <ul className={styles.activity} style={{ marginTop: 10 }}>
                {doc.payments.map((p) => (
                  <li key={p.id} className={styles.activityItem}>
                    <div className={styles.activityMain}>
                      {isCredit ? 'Refund' : 'Payment'} · {METHOD_LABEL[p.method] ?? p.method}
                      <span className={styles.sub}>
                        {shortDate(p.paid_on)}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                    </div>
                    <div className={styles.activityRight}>
                      {money(c(p.amount))}
                      {doc.status === 'issued' && (
                        <button
                          type="button"
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => setRemoving(p)}
                          disabled={pending}
                          aria-label={`Remove this ${isCredit ? 'refund' : 'payment'}`}
                        >
                          <FleetIcon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {doc.allocations.map((a) => (
                  <li key={a.id} className={styles.activityItem}>
                    <div className={styles.activityMain}>
                      {isCredit ? (
                        <>
                          Applied to invoice{' '}
                          <Link href={`/fleet/invoices/${a.invoice_id}`} className={styles.linkBtn}>
                            {a.other_number ?? ''}
                          </Link>
                        </>
                      ) : (
                        <>
                          Credit note{' '}
                          <Link href={`/fleet/invoices/${a.credit_note_id}`} className={styles.linkBtn}>
                            {a.other_number ?? ''}
                          </Link>{' '}
                          applied
                        </>
                      )}
                      <span className={styles.sub}>{shortDate(a.allocated_on)}</span>
                    </div>
                    <div className={styles.activityRight}>{money(-c(a.amount))}</div>
                  </li>
                ))}
                {/* Credit notes that are not (or not fully) covered by an allocation row above. */}
                {doc.credit_notes
                  .filter((n) => !doc.allocations.some((a) => a.credit_note_id === n.id))
                  .map((n) => (
                    <li key={n.id} className={styles.activityItem}>
                      <div className={styles.activityMain}>
                        <Link href={`/fleet/invoices/${n.id}`} className={styles.linkBtn}>
                          {n.status === 'draft' ? 'Draft credit note' : `Credit note ${n.number ?? ''}`}
                        </Link>
                        <span className={styles.sub}>
                          {n.status === 'draft' ? 'Not issued yet' : n.status === 'void' ? 'Void' : `${shortDate(n.issue_date)} · credit to refund`}
                        </span>
                      </div>
                      <div className={styles.activityRight}>{money(c(n.total))}</div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {dialog === 'payment' && (
        <PaymentDialog doc={doc} today={today} postsToBooks={postsToBooks} money={money} onClose={close} onDone={done} />
      )}
      {dialog === 'email' && <EmailDialog doc={doc} onClose={close} onDone={done} />}
      {dialog === 'void' && <VoidDialog doc={doc} onClose={close} onDone={done} />}
      {removing && (
        <RemovePaymentDialog
          payment={removing}
          isRefund={isCredit}
          postsToBooks={Boolean(removing.finance_transaction_id)}
          amount={money(c(removing.amount))}
          onClose={close}
          onDone={done}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dialogs
// -----------------------------------------------------------------------------

function PaymentDialog({
  doc,
  today,
  postsToBooks,
  money,
  onClose,
  onDone,
}: {
  doc: DocumentDetail;
  today: string;
  postsToBooks: boolean;
  money: (cents: number) => string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const isRefund = doc.kind === 'credit_note';
  const [amount, setAmount] = useState(fromCents(doc.balance_cents).toFixed(2));
  const [paidOn, setPaidOn] = useState(doc.issue_date && doc.issue_date > today ? doc.issue_date : today);
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await recordPaymentAction({ invoiceId: doc.id, amount, paidOn, method, reference });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(isRefund ? 'Refund recorded.' : 'Payment recorded.');
    });

  return (
    <InvoiceDialog
      title={isRefund ? 'Record a refund' : 'Record a payment'}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isRefund ? 'Record refund' : 'Record payment'}
          </button>
        </>
      }
    >
      <p>
        {isRefund ? (
          <>
            <strong>{money(doc.balance_cents)}</strong> of credit note {doc.number} has not been applied to an invoice. Record what you paid back to{' '}
            {doc.customer_name}.
          </>
        ) : (
          <>
            <strong>{money(doc.balance_cents)}</strong> is still owed on {doc.number}. A part payment is fine.
          </>
        )}
      </p>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Amount ({doc.currency})</span>
          <input className={`${styles.input} ${styles.inputNum}`} inputMode="decimal" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Date</span>
          <input type="date" className={styles.input} value={paidOn} min={doc.issue_date ?? undefined} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{isRefund ? 'Refunded by' : 'Paid by'}</span>
          <select className={styles.select} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Reference</span>
          <input className={styles.input} value={reference} maxLength={120} placeholder="Optional" onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      {postsToBooks && (
        <p className={styles.fieldHint}>
          {isRefund ? 'If a refund category is set in invoice settings, this is also added to Bookkeeping as an expense.' : 'This is also added to Bookkeeping as income.'}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}

function EmailDialog({ doc, onClose, onDone }: { doc: DocumentDetail; onClose: () => void; onDone: (message: string) => void }) {
  const [to, setTo] = useState(doc.customer_email ?? doc.customer?.email ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = doc.kind === 'credit_note' ? 'credit note' : 'invoice';

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await emailDocumentAction(doc.id, to, message);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(`Sent to ${result.sentTo}.`);
    });

  return (
    <InvoiceDialog
      title={`Email this ${what}`}
      onClose={onClose}
      busy={pending}
      wide
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={pending || !to.trim()}>
            <FleetIcon name="send" size={14} />
            {pending ? 'Sending…' : 'Send'}
          </button>
        </>
      }
    >
      <p>
        {doc.number} is sent as a PDF attachment{doc.seller_email ? `. Replies go to ${doc.seller_email}` : ''}.
        {doc.sent_at ? ` Last sent to ${doc.sent_to} on ${shortDate(doc.sent_at)}.` : ''}
      </p>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>To</span>
        <input className={styles.input} type="email" value={to} maxLength={200} autoFocus placeholder="name@company.com" onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Message</span>
        <textarea
          className={styles.textarea}
          value={message}
          maxLength={2000}
          placeholder="Optional. Shown above the invoice details."
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}

function VoidDialog({ doc, onClose, onDone }: { doc: DocumentDetail; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = doc.kind === 'credit_note' ? 'credit note' : 'invoice';

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await voidDocumentAction(doc.id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(`${doc.number} was voided.`);
    });

  return (
    <InvoiceDialog
      title={`Void ${doc.number}?`}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Keep it
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={submit} disabled={pending}>
            {pending ? 'Voiding…' : `Void ${what}`}
          </button>
        </>
      }
    >
      <ul>
        <li>
          The {what} stops counting: nothing is owed on it and it leaves your totals.
        </li>
        <li>
          It <strong>keeps its number</strong> and stays in the list marked “Void”, so your sequence has no gap.
        </li>
        <li>
          This <strong>cannot be undone</strong>. If the customer already has it, tell them it has been cancelled.
        </li>
      </ul>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Reason</span>
        <input className={styles.input} value={reason} maxLength={500} autoFocus placeholder="e.g. Raised for the wrong customer" onChange={(e) => setReason(e.target.value)} />
        <span className={styles.fieldHint}>Kept with the document for your records.</span>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}

function RemovePaymentDialog({
  payment,
  isRefund,
  postsToBooks,
  amount,
  onClose,
  onDone,
}: {
  payment: InvoicePayment;
  isRefund: boolean;
  postsToBooks: boolean;
  amount: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = isRefund ? 'refund' : 'payment';

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await deletePaymentAction(payment.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone(`The ${what} was removed.`);
    });

  return (
    <InvoiceDialog
      title={`Remove this ${what}?`}
      onClose={onClose}
      busy={pending}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Keep it
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={submit} disabled={pending}>
            {pending ? 'Removing…' : `Remove ${what}`}
          </button>
        </>
      }
    >
      <p>
        The {what} of <strong>{amount}</strong> on {shortDate(payment.paid_on)} is removed, and that amount is {isRefund ? 'available to refund' : 'owed'} again.
        {postsToBooks ? ' The line it added to Bookkeeping is removed too.' : ''}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}
