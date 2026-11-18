'use client';

import { useState } from 'react';
import { SIM_CHOICES, teltonikaSetupSms } from '@/lib/gps/hosted/sms';
import styles from './gps.module.css';

/**
 * "How to switch the tracker on" — pick the SIM, copy the text message, send
 * it to the tracker's SIM number. Shown right after adding a tracker, and from
 * the "Setup text" button on any Rovora GPS tracker.
 */
export default function RovoraSetupSteps({
  host,
  port,
  initialSim = 'go',
}: {
  host: string;
  port: number;
  initialSim?: string;
}) {
  const [sim, setSim] = useState(initialSim);
  const [customApn, setCustomApn] = useState('');
  const [copied, setCopied] = useState(false);
  const choice = SIM_CHOICES.find((s) => s.key === sim) ?? SIM_CHOICES[0];
  const apn = choice.key === 'other' ? customApn.trim() : choice.apn;
  const sms = apn ? teltonikaSetupSms({ apn, host, port }) : '';

  const copy = async () => {
    if (!sms) return;
    try {
      await navigator.clipboard.writeText(sms);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the text is selectable */
    }
  };

  return (
    <div className={styles.setupBox}>
      <ol className={styles.stepList}>
        <li>
          Put a data SIM in the tracker (PIN switched off) and connect the tracker to the car — or plug it into the
          OBD port for an FMC003.
        </li>
        <li>
          Which SIM is in it?{' '}
          <select className={styles.inlineSelect} value={sim} onChange={(e) => setSim(e.target.value)} aria-label="SIM card">
            {SIM_CHOICES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {choice.key === 'other' && (
            <input
              className={styles.inlineInput}
              value={customApn}
              onChange={(e) => setCustomApn(e.target.value)}
              placeholder="APN, e.g. internet"
              aria-label="APN"
              spellCheck={false}
            />
          )}
        </li>
        <li>
          From any phone, send this text message to the <strong>tracker&rsquo;s SIM number</strong> — exactly as
          shown, including the two spaces at the start:
          {sms ? (
            <div className={styles.smsRow}>
              <code className={styles.sms}>{sms}</code>
              <button type="button" className={styles.ghostBtn} onClick={copy}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className={styles.hint}>Type your SIM&rsquo;s APN to see the message.</p>
          )}
        </li>
        <li>
          Within a few minutes the tracker shows <strong>Live</strong> here and the car appears on the Live Map. Take
          the car outside if it&rsquo;s parked indoors — the tracker needs to see the sky for its first fix.
        </li>
      </ol>
      <p className={styles.stepsNote}>
        Teltonika FMC920, FMC130 and FMC003 understand this message. Other brands: point them at{' '}
        <strong>
          {host}:{port}
        </strong>{' '}
        (TCP, Teltonika protocol) — ask us if unsure.
      </p>
    </div>
  );
}
