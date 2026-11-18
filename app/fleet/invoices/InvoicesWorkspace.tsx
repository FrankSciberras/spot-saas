'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import FleetPageHeader from '@/components/fleet/FleetPageHeader';
import { useFleetSetting } from '@/components/fleet/FleetSettingsProvider';
import { STATUS_LABEL, toCents } from '@/lib/invoices/math';
import type { DocumentSummary } from '@/lib/invoices/types';
import { moneyOf, shortDate, STATUS_TONE } from './format';
import styles from './invoices.module.css';

type TabKey = 'all' | 'drafts' | 'awaiting' | 'overdue' | 'paid' | 'credit' | 'void';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'awaiting', label: 'Awaiting payment' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'credit', label: 'Credit notes' },
  { key: 'void', label: 'Void' },
];

function inTab(doc: DocumentSummary, tab: TabKey): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'drafts':
      return doc.status === 'draft';
    case 'awaiting':
      return doc.kind === 'invoice' && ['awaiting', 'part_paid', 'overdue'].includes(doc.display_status);
    case 'overdue':
      return doc.display_status === 'overdue';
    case 'paid':
      return doc.display_status === 'paid';
    case 'credit':
      return doc.kind === 'credit_note';
    case 'void':
      return doc.status === 'void';
  }
}

/** Newest first: drafts (no date yet) on top by when they were started, then by issue date and number. */
function compare(a: DocumentSummary, b: DocumentSummary): number {
  const key = (d: DocumentSummary) => (d.status === 'draft' ? `9${d.created_at}` : `0${d.issue_date ?? ''}${String(d.number_seq ?? 0).padStart(10, '0')}`);
  return key(b).localeCompare(key(a));
}

export default function InvoicesWorkspace({
  documents,
  error,
  customerCount,
  paidLast30Cents,
}: {
  documents: DocumentSummary[];
  /** Set when the list could not be loaded (e.g. invoices not switched on yet). */
  error: string | null;
  customerCount: number;
  paidLast30Cents: number;
}) {
  const router = useRouter();
  const locale = useFleetSetting('finance.number_format');
  const fleetCurrency = useFleetSetting('finance.currency');
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  const money = (cents: number, currency: string = fleetCurrency) => moneyOf(cents, currency, locale);

  const stats = useMemo(() => {
    const issued = documents.filter((d) => d.kind === 'invoice' && d.status === 'issued');
    const overdue = issued.filter((d) => d.display_status === 'overdue');
    return {
      outstanding: issued.reduce((sum, d) => sum + d.balance_cents, 0),
      unpaidCount: issued.filter((d) => d.balance_cents > 0).length,
      overdue: overdue.reduce((sum, d) => sum + d.balance_cents, 0),
      overdueCount: overdue.length,
      drafts: documents.filter((d) => d.status === 'draft').length,
    };
  }, [documents]);

  const counts = useMemo(() => {
    const out = {} as Record<TabKey, number>;
    for (const t of TABS) out[t.key] = documents.filter((d) => inTab(d, t.key)).length;
    return out;
  }, [documents]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents
      .filter((d) => inTab(d, tab))
      .filter((d) => !q || [d.number, d.display_customer, d.reference].some((v) => v?.toLowerCase().includes(q)))
      .sort(compare);
  }, [documents, tab, query]);

  const label = (d: DocumentSummary) => d.number ?? (d.kind === 'credit_note' ? 'Draft credit note' : 'Draft');
  /** A credit note reads as a negative amount in a list of invoices. */
  const signedTotal = (d: DocumentSummary) => (d.kind === 'credit_note' ? -1 : 1) * (toCents(d.total) ?? 0);

  const header = (
    <FleetPageHeader
      breadcrumb="Financial / Invoices"
      title="Invoices"
      count={error ? undefined : documents.filter((d) => d.status !== 'draft').length}
      action={
        <div className={styles.headActions}>
          <Link href="/fleet/invoices/customers" className={styles.btn}>
            <FleetIcon name="staff" size={15} />
            Customers
          </Link>
          <Link href="/fleet/invoices/settings" className={styles.btn}>
            <FleetIcon name="gear" size={15} />
            Settings
          </Link>
          <Link href="/fleet/invoices/new" className={`${styles.btn} ${styles.btnPrimary}`}>
            <FleetIcon name="plus" size={15} stroke={2} />
            New invoice
          </Link>
        </div>
      }
    />
  );

  if (error) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.notice} role="status">
          <FleetIcon name="info" size={16} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <FleetIcon name="doc" size={22} />
          </div>
          <h2>Bill the people who owe your fleet money</h2>
          <p>
            A hotel with an account, a partner fleet, a driver renting a car. Write the invoice here, send it as a PDF,
            record what gets paid, and correct a mistake with a credit note. Each invoice gets the next number in your
            sequence when you issue it.
          </p>
          <div className={styles.emptyActions}>
            {customerCount === 0 && (
              <Link href="/fleet/invoices/customers?new=1" className={styles.btn}>
                <FleetIcon name="plus" size={15} stroke={2} />
                Add a customer
              </Link>
            )}
            <Link href="/fleet/invoices/new" className={`${styles.btn} ${styles.btnPrimary}`}>
              <FleetIcon name="plus" size={15} stroke={2} />
              New invoice
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}

      <div className={styles.tiles}>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Outstanding</div>
          <div className={styles.tileValue}>{money(stats.outstanding)}</div>
          <div className={styles.tileHint}>
            {stats.unpaidCount === 0 ? 'Nothing owed' : `${stats.unpaidCount} unpaid ${stats.unpaidCount === 1 ? 'invoice' : 'invoices'}`}
          </div>
        </div>
        <div className={`${styles.tile} ${stats.overdueCount > 0 ? styles.tileBad : ''}`}>
          <div className={styles.tileLabel}>Overdue</div>
          <div className={styles.tileValue}>{money(stats.overdue)}</div>
          <div className={styles.tileHint}>
            {stats.overdueCount === 0 ? 'Nothing past its due date' : `${stats.overdueCount} past ${stats.overdueCount === 1 ? 'its' : 'their'} due date`}
          </div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Paid in the last 30 days</div>
          <div className={styles.tileValue}>{money(paidLast30Cents)}</div>
          <div className={styles.tileHint}>Payments received on invoices</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Drafts</div>
          <div className={styles.tileValue}>{stats.drafts}</div>
          <div className={styles.tileHint}>{stats.drafts === 0 ? 'Nothing waiting to be issued' : 'Not issued yet, no number'}</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Filter invoices">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              data-active={tab === t.key ? 'true' : undefined}
              className={styles.tab}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key !== 'all' && counts[t.key] > 0 && <span className={styles.tabCount}>{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <FleetIcon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number, customer or reference"
            aria-label="Search invoices"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className={`${styles.tableWrap} ${styles.emptySmall}`} style={{ display: 'block' }}>
          {query.trim() ? `Nothing matches “${query.trim()}”.` : 'Nothing here yet.'}
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className={styles.num}>Total</th>
                  <th className={styles.num}>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} onClick={() => router.push(`/fleet/invoices/${d.id}`)}>
                    <td>
                      <Link href={`/fleet/invoices/${d.id}`} className={styles.docNumber} onClick={(e) => e.stopPropagation()}>
                        {label(d)}
                      </Link>
                      {d.kind === 'credit_note' && d.number && <span className={styles.sub}>Credit note</span>}
                    </td>
                    <td>
                      <div className={styles.ellipsis}>{d.display_customer}</div>
                      {d.reference && <span className={`${styles.sub} ${styles.ellipsis}`}>{d.reference}</span>}
                    </td>
                    <td className={d.issue_date ? undefined : styles.muted}>{d.status === 'draft' ? 'Not issued' : shortDate(d.issue_date)}</td>
                    <td className={styles.muted}>{d.kind === 'invoice' && d.status !== 'draft' ? shortDate(d.due_date) : ''}</td>
                    <td className={styles.num}>{money(signedTotal(d), d.currency)}</td>
                    <td className={`${styles.num} ${d.balance_cents === 0 ? styles.muted : ''}`}>
                      {d.status === 'issued' ? money(d.balance_cents, d.currency) : ''}
                    </td>
                    <td>
                      <span className={styles.chip} data-tone={STATUS_TONE[d.display_status]}>
                        {STATUS_LABEL[d.display_status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cards}>
            {rows.map((d) => (
              <Link key={d.id} href={`/fleet/invoices/${d.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.docNumber}>{label(d)}</span>
                  <span className={styles.cardAmount}>{money(signedTotal(d), d.currency)}</span>
                </div>
                <div className={styles.cardCustomer}>{d.display_customer}</div>
                <div className={styles.cardBottom}>
                  <span className={styles.chip} data-tone={STATUS_TONE[d.display_status]}>
                    {STATUS_LABEL[d.display_status]}
                  </span>
                  <span className={styles.sub}>
                    {d.status === 'draft'
                      ? 'Not issued'
                      : d.kind === 'invoice' && d.balance_cents > 0
                        ? `${money(d.balance_cents, d.currency)} due ${shortDate(d.due_date)}`
                        : shortDate(d.issue_date)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
