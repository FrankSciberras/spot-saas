'use client';

import { useEffect } from 'react';
import styles from './thank-you.module.css';

/**
 * A short "you're in" stop between a finished signup / payment and the app.
 *
 * These pages exist for conversion tracking: they sit OUTSIDE the signed-in
 * app (see lib/routes.ts), so Google Tag Manager is allowed to load here once
 * the visitor has clicked "Allow". In GTM, trigger on Page Path equals
 * /thank-you/welcome (new free fleet) or /thank-you/subscribed (paid).
 *
 * The pause before forwarding gives GTM time to fire its tags. It's a full
 * page load into the app, so Google's tags are gone again once we arrive.
 */
const FORWARD_AFTER_MS = 2500;

export default function ThankYou({
  heading,
  sub,
  next,
}: {
  heading: string;
  sub: string;
  next: string;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => window.location.replace(next), FORWARD_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [next]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img src="/logo-full.png" alt="Rovora" className={styles.logo} />
        <div className={styles.tick} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1>{heading}</h1>
        <p>{sub}</p>
        <a href={next} className={styles.btn}>
          Continue
        </a>
        <span className={styles.hint}>Taking you there now…</span>
      </div>
    </div>
  );
}
