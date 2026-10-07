'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { isAppRoute } from '@/lib/routes';
import { getConsent, hasPrivacySignal, setConsent, type ConsentChoice } from '@/lib/analytics/client';
import { OPEN_CONSENT_EVENT } from '@/lib/analytics/constants';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import styles from './CookieBanner.module.css';

/** Pages where asking would only get in the way (mostly returning customers). */
const QUIET = /^\/(login|auth|offline)(\/|$)/;
const THEME_EVENT = 'rovora-theme-change';

/**
 * The cookie banner. Rovora counts visits without cookies regardless of the
 * answer; "Allow" adds a single first-party cookie so return visits — and the
 * channel that first brought someone who signs up days later — can be
 * recognised. Both choices are one click and equally prominent, nothing is
 * pre-selected, and browsers sending Global Privacy Control are never asked.
 *
 * Re-opened from the footer's "Cookie settings" (OPEN_CONSENT_EVENT).
 */
export default function CookieBanner() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [busy, setBusy] = useState(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  // First visit: ask, a moment after the page has settled.
  useEffect(() => {
    if (getConsent() || hasPrivacySignal()) return;
    if ((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, []);

  // "Cookie settings" in the footer.
  useEffect(() => {
    const onOpen = () => {
      setChoice(getConsent());
      setReopened(true);
      setOpen(true);
      requestAnimationFrame(() => firstButton.current?.focus());
    };
    window.addEventListener(OPEN_CONSENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, onOpen);
  }, []);

  // Match the marketing site's light/dark toggle.
  useEffect(() => {
    const read = () => {
      const t = document.querySelector('.rovora-site')?.getAttribute('data-theme');
      setTheme(t === 'dark' ? 'dark' : 'light');
    };
    read();
    const onTheme = (e: Event) => setTheme((e as CustomEvent<'light' | 'dark'>).detail === 'dark' ? 'dark' : 'light');
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, [pathname, open]);

  const hidden = !open || isAppRoute(pathname) || (QUIET.test(pathname) && !reopened);

  // Let the page hide the chat launcher on small screens while we're showing.
  useEffect(() => {
    document.body.classList.toggle('cookie-banner-open', !hidden);
    return () => document.body.classList.remove('cookie-banner-open');
  }, [hidden]);

  if (hidden) return null;

  const answer = async (c: ConsentChoice) => {
    if (busy) return;
    setBusy(true);
    setChoice(c);
    setOpen(false);
    setReopened(false);
    try {
      await setConsent(c);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`${styles.banner} ${rovoraFontVars}`}
      data-theme={theme}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-body"
    >
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-5-5 4 4 0 0 1-4-4Z" />
            <circle cx="8.5" cy="11.5" r="0.6" fill="currentColor" />
            <circle cx="12.5" cy="15.5" r="0.6" fill="currentColor" />
            <circle cx="15.5" cy="11" r="0.6" fill="currentColor" />
          </svg>
        </span>
        <h2 id="cookie-banner-title" className={styles.title}>Cookies on Rovora</h2>
        {reopened && (
          <button type="button" className={styles.close} aria-label="Close" onClick={() => { setOpen(false); setReopened(false); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <p id="cookie-banner-body" className={styles.body}>
        We count visits anonymously, without cookies. If you allow it, we&rsquo;ll also set one
        first-party cookie so we can tell when you come back. No ads, no third-party trackers.{' '}
        <Link href="/privacy#cookies" className={styles.link}>Privacy policy</Link>
      </p>
      {reopened && choice && (
        <p className={styles.status}>
          Currently: <strong>{choice === 'granted' ? 'allowed' : 'declined'}</strong>
        </p>
      )}
      <div className={styles.actions}>
        <button ref={firstButton} type="button" className={styles.btn} onClick={() => answer('denied')} disabled={busy}>
          Decline
        </button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => answer('granted')} disabled={busy}>
          Allow
        </button>
      </div>
    </div>
  );
}

/** Footer link that re-opens the banner so a visitor can change their mind. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}
