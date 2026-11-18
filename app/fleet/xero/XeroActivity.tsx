'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { retryXeroItemAction } from '@/lib/actions/xero';
import { useMoney } from '@/components/fleet/FleetSettingsProvider';
import type { RemoteState, SyncEntityType, SyncStatus } from '@/lib/xero/types';
import styles from './xero.module.css';

export interface ActivityRow {
  entityType: SyncEntityType;
  entityId: string;
  label: string;
  amount: number | null;
  status: SyncStatus;
  remoteState: RemoteState;
  message: string | null;
  when: string | null;
  rovoraHref: string | null;
  xeroHref: string | null;
}

const KIND: Record<SyncEntityType, string> = {
  contact: 'Customer',
  invoice: 'Invoice',
  credit_note: 'Credit note',
  allocation: 'Credit applied',
  payment: 'Payment',
  bank_transaction: 'Bookkeeping',
};

type Filter = 'all' | 'error' | 'pending' | 'synced';

function statusOf(row: ActivityRow): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (row.status === 'error') return { text: 'Refused', tone: 'bad' };
  if (row.status === 'pending') return { text: 'Waiting', tone: 'warn' };
  if (row.status === 'skipped') return { text: 'Not sent', tone: 'muted' };
  if (row.remoteState === 'voided') return { text: 'Voided in Xero', tone: 'muted' };
  if (row.remoteState === 'deleted') return { text: 'Removed in Xero', tone: 'muted' };
  return { text: 'In Xero', tone: 'ok' };
}

/** What was sent, what is waiting and what Xero refused — newest first. */
export default function XeroActivity({ rows }: { rows: ActivityRow[] }) {
  const router = useRouter();
  const money = useMoney();
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const count = (f: Filter) => (f === 'all' ? rows.length : rows.filter((r) => r.status === f).length);

  const retry = (row: ActivityRow) => {
    const key = `${row.entityType}:${row.entityId}`;
    setBusyKey(key);
    setError(null);
    startTransition(async () => {
      const res = await retryXeroItemAction(row.entityType, row.entityId);
      if (!res.ok) setError(res.error);
      setBusyKey(null);
      router.refresh();
    });
  };

  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Activity</h2>
        <div className={styles.filters} role="tablist" aria-label="Filter activity">
          {(['all', 'error', 'pending', 'synced'] as Filter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} data-active={filter === f ? 'true' : undefined} className={styles.filter} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'error' ? 'Refused' : f === 'pending' ? 'Waiting' : 'In Xero'} <span>{count(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      {shown.length === 0 ? (
        <div className={styles.empty}>
          {rows.length === 0
            ? 'Nothing has been sent yet. Issue an invoice and it appears here within a few seconds.'
            : 'Nothing in this view.'}
        </div>
      ) : (
        <ul className={styles.activity}>
          {shown.map((row) => {
            const status = statusOf(row);
            const key = `${row.entityType}:${row.entityId}`;
            return (
              <li key={key} className={styles.activityRow}>
                <div className={styles.activityMain}>
                  <span className={styles.kind}>{KIND[row.entityType]}</span>
                  {row.rovoraHref ? (
                    <Link href={row.rovoraHref} className={styles.activityLabel}>{row.label}</Link>
                  ) : (
                    <span className={styles.activityLabel}>{row.label}</span>
                  )}
                  {row.amount !== null && <span className={`${styles.amount} mono tnum`}>{money(row.amount)}</span>}
                </div>
                <div className={styles.activityMeta}>
                  <span className={styles.status} data-tone={status.tone}>{status.text}</span>
                  {row.when && <span className={styles.when}>{time(row.when)}</span>}
                  {row.xeroHref && (
                    <a className={styles.link} href={row.xeroHref} target="_blank" rel="noopener noreferrer">Open in Xero</a>
                  )}
                  {row.status === 'error' && (
                    <button type="button" className={styles.retry} onClick={() => retry(row)} disabled={pending}>
                      {busyKey === key ? 'Trying…' : 'Try again'}
                    </button>
                  )}
                </div>
                {row.message && row.status !== 'synced' && <p className={styles.activityMsg} data-tone={status.tone}>{row.message}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
