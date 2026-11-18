'use client';

import { useState, useTransition } from 'react';
import { setGpsPrivacyAction } from '@/lib/actions/gps';
import styles from './gps.module.css';

/** GPS privacy: show cars only while a driver is on shift in them (default). */
export default function GpsPrivacyToggle({ initialHide }: { initialHide: boolean }) {
  const [hide, setHide] = useState(initialHide);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setHide(next);
    setNote(null);
    startTransition(async () => {
      const res = await setGpsPrivacyAction(next);
      if (res.error) {
        setHide(!next);
        setNote({ kind: 'error', text: res.error });
      } else {
        setNote({ kind: 'ok', text: 'Saved.' });
      }
    });
  };

  return (
    <section className={styles.panel} id="privacy">
      <h2 className={styles.panelTitle}>Privacy</h2>
      <label className={styles.toggleRow}>
        <input type="checkbox" checked={hide} onChange={(e) => change(e.target.checked)} disabled={pending} />
        <span>
          <strong>Only show a car while a driver is on shift in it</strong> (recommended)
          <span className={styles.toggleHint}>
            GPS trackers report day and night. With this on, a car is hidden from the Live Map — and its route isn&rsquo;t
            kept — whenever nobody is on shift in it, so drivers who take the car home aren&rsquo;t tracked in their own
            time. EU privacy rules expect this. Turn it off only if your cars are never used privately.
          </span>
        </span>
      </label>
      {note && <div className={note.kind === 'ok' ? styles.noteOk : styles.noteError}>{note.text}</div>}
    </section>
  );
}
