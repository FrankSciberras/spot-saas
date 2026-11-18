'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectGpsAction, syncGpsNowAction } from '@/lib/actions/gps';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './gps.module.css';

/** "Sync now" + "Disconnect" for one connected GPS account. */
export default function GpsAccountControls({
  connectionId,
  providerName,
  onReconnect,
  needsReconnect,
  hosted = false,
}: {
  connectionId: string;
  providerName: string;
  needsReconnect: boolean;
  onReconnect?: () => void;
  /** Rovora's own GPS server: disconnecting removes every tracker from it. */
  hosted?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null);
  const [, startTransition] = useTransition();

  const sync = () => {
    setNote(null);
    setBusy('sync');
    startTransition(async () => {
      const res = await syncGpsNowAction(connectionId);
      setNote(res.error ? { kind: 'error', text: res.error } : { kind: 'ok', text: res.message ?? 'Up to date.' });
      setBusy(null);
      router.refresh();
    });
  };

  const disconnect = () => {
    setNote(null);
    setBusy('disconnect');
    startTransition(async () => {
      const res = await disconnectGpsAction(connectionId);
      setBusy(null);
      if (res.error) {
        setNote({ kind: 'error', text: res.error });
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className={styles.controls}>
      <div className={styles.controlRow}>
        {needsReconnect && onReconnect ? (
          <button className={styles.primary} type="button" onClick={onReconnect} disabled={busy !== null}>
            Reconnect
          </button>
        ) : (
          <button className={styles.ghostBtn} type="button" onClick={sync} disabled={busy !== null}>
            <FleetIcon name="refresh" size={14} stroke={1.8} />
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        {!confirming && (
          <button className={styles.ghostBtn} type="button" onClick={() => setConfirming(true)} disabled={busy !== null}>
            {hosted ? 'Stop using' : 'Disconnect'}
          </button>
        )}
      </div>

      {confirming && (
        <div className={styles.confirm}>
          {hosted ? (
            <p>
              Stop using Rovora GPS? <strong>Every tracker on it is removed</strong>, with its vehicle link and route
              history, and billing for them stops. The trackers themselves keep working — you can add them again
              later by IMEI.
            </p>
          ) : (
            <p>
              Disconnect {providerName}? Rovora forgets the saved login <strong>and these trackers, their vehicle
              links and their route history</strong>. Nothing changes in your {providerName} account.
            </p>
          )}
          <div className={styles.controlRow}>
            <button className={styles.dangerBtn} type="button" onClick={disconnect} disabled={busy !== null}>
              {busy === 'disconnect' ? 'Removing…' : hosted ? 'Yes, remove all trackers' : 'Yes, disconnect'}
            </button>
            <button className={styles.ghostBtn} type="button" onClick={() => setConfirming(false)} disabled={busy !== null}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {note && <div className={note.kind === 'ok' ? styles.noteOk : styles.noteError}>{note.text}</div>}
    </div>
  );
}
