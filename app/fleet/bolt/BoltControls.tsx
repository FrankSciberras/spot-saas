'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectBoltAction, syncBoltNowAction } from '@/lib/actions/bolt';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './bolt.module.css';

/** "Sync now" + "Disconnect" for a connected fleet. */
export default function BoltControls() {
  const router = useRouter();
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null);
  const [, startTransition] = useTransition();

  const sync = () => {
    setNote(null);
    setBusy('sync');
    startTransition(async () => {
      const res = await syncBoltNowAction();
      setNote(res.error ? { kind: 'error', text: res.error } : { kind: 'ok', text: res.message ?? 'Up to date.' });
      setBusy(null);
      router.refresh();
    });
  };

  const disconnect = () => {
    setNote(null);
    setBusy('disconnect');
    startTransition(async () => {
      const res = await disconnectBoltAction();
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
        <button className={styles.ghostBtn} type="button" onClick={sync} disabled={busy !== null}>
          <FleetIcon name="refresh" size={14} stroke={1.8} />
          {busy === 'sync' ? 'Syncing…' : 'Sync now'}
        </button>
        {!confirming && (
          <button className={styles.ghostBtn} type="button" onClick={() => setConfirming(true)} disabled={busy !== null}>
            Disconnect
          </button>
        )}
      </div>

      {confirming && (
        <div className={styles.confirm}>
          <p>
            Disconnect Bolt? This removes the saved key <strong>and all rides, drivers and vehicles imported
            from Bolt</strong>. Your own Rovora drivers, vehicles and settlements are not touched.
          </p>
          <div className={styles.controlRow}>
            <button className={styles.dangerBtn} type="button" onClick={disconnect} disabled={busy !== null}>
              {busy === 'disconnect' ? 'Disconnecting…' : 'Yes, disconnect'}
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
