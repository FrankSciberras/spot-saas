'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectXeroAction, syncXeroNowAction } from '@/lib/actions/xero';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './xero.module.css';

/** "Send now", "Reconnect" and "Disconnect" for a connected fleet. */
export default function XeroControls({ needsReconnect, tenantName }: { needsReconnect: boolean; tenantName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const sendNow = () => {
    setNote(null);
    startTransition(async () => {
      const res = await syncXeroNowAction();
      if (!res.ok) {
        setNote({ tone: 'bad', text: res.error });
      } else {
        const parts = [`${res.sent} sent`];
        if (res.failed > 0) parts.push(`${res.failed} refused`);
        if (res.waiting > 0) parts.push(`${res.waiting} waiting`);
        setNote({ tone: res.failed > 0 ? 'bad' : 'ok', text: `${parts.join(', ')}.${res.note ? ` ${res.note}` : ''}` });
      }
      router.refresh();
    });
  };

  const disconnect = () => {
    setNote(null);
    startTransition(async () => {
      const res = await disconnectXeroAction();
      if (!res.ok) setNote({ tone: 'bad', text: res.error });
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        {needsReconnect ? (
          <a className="btn btn-primary" href="/api/xero/connect">Reconnect</a>
        ) : (
          <button type="button" className="btn btn-primary" onClick={sendNow} disabled={pending}>
            <FleetIcon name="refresh" size={14} stroke={2} /> {pending && !confirming ? 'Sending…' : 'Send now'}
          </button>
        )}
        {confirming ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={pending}>Keep connected</button>
            <button type="button" className={`btn ${styles.dangerBtn}`} onClick={disconnect} disabled={pending}>
              {pending ? 'Disconnecting…' : 'Yes, disconnect'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} disabled={pending}>Disconnect</button>
        )}
      </div>
      {confirming && (
        <p className={styles.controlNote}>
          Disconnecting stops sending to {tenantName}. Everything already in Xero stays there, and you can connect again later without anything being sent twice.
        </p>
      )}
      {note && !confirming && <p className={styles.controlNote} data-tone={note.tone} role="status">{note.text}</p>}
    </div>
  );
}
