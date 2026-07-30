'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import styles from './InstallPrompt.module.css';

/**
 * "Add Rovora to your home screen" nudge, mounted once per dashboard by
 * FleetShell so operators and drivers both get it.
 *
 * Two shapes, because the platforms differ:
 *   • Chrome/Edge/Android — a real Install button wired to the deferred
 *     `beforeinstallprompt` event (see hooks/useInstallPrompt).
 *   • iOS + desktop Safari/Firefox — no install API exists, so we show the
 *     manual Share → Add to Home Screen steps instead.
 *
 * It auto-appears once, then snoozes for two weeks if dismissed. After that
 * the account menu's "Install app" item re-opens it on demand (which is what
 * the `rovora:show-install` event is for — same pattern as
 * `rovora:start-tour`).
 */

const SNOOZE_KEY = 'rovora-install-snoozed-until';
const SNOOZE_DAYS = 14;
/** Long enough to let the dashboard paint — and to stay clear of the driver
 *  push-notification modal, which fires at 1.2s. */
const AUTO_SHOW_DELAY = 5000;

/** Opens the prompt from anywhere (e.g. the account menu). */
export function openInstallPrompt() {
  window.dispatchEvent(new Event('rovora:show-install'));
}

function isSnoozed(): boolean {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    return until !== null && Date.now() < Number(until);
  } catch {
    // Private mode / storage disabled — just show it.
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {
    /* nothing we can do, and nothing that should break the dashboard */
  }
}

export default function InstallPrompt() {
  const { ready, canPrompt, standalone, isIos, promptToInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  // Manual opens ignore the snooze and show steps even where we have no
  // native prompt to offer.
  const [forced, setForced] = useState(false);

  // Manual trigger from the account menu.
  useEffect(() => {
    const open = () => {
      setForced(true);
      setShow(true);
    };
    window.addEventListener('rovora:show-install', open);
    return () => window.removeEventListener('rovora:show-install', open);
  }, []);

  // Auto-appearance, once the platform checks have run.
  useEffect(() => {
    if (!ready || standalone) return;
    // Only nudge unprompted when we have something concrete to offer.
    if (!canPrompt && !isIos) return;
    if (isSnoozed()) return;

    const timer = setTimeout(() => setShow(true), AUTO_SHOW_DELAY);
    return () => clearTimeout(timer);
  }, [ready, standalone, canPrompt, isIos]);

  const dismiss = useCallback(() => {
    setShow(false);
    setForced(false);
    snooze();
  }, []);

  const handleInstall = useCallback(async () => {
    const accepted = await promptToInstall();
    setShow(false);
    setForced(false);
    // Declining should not re-nag on the next page load.
    if (!accepted) snooze();
  }, [promptToInstall]);

  // Already installed — nothing to offer, even if something asked us to open.
  if (!ready || standalone || !show) return null;

  const showNativeButton = canPrompt;
  // Non-iOS browsers with no deferred prompt (desktop Safari/Firefox) only ever
  // get here by explicit request, so give them generic menu instructions.
  const steps = isIos ? IOS_STEPS : DESKTOP_STEPS;

  return (
    <div className={styles.wrap} role="dialog" aria-labelledby="rovora-install-title">
      <div className={styles.card}>
        <button className={styles.closeBtn} onClick={dismiss} aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className={styles.head}>
          {/* Decorative app icon — a CSS background rather than an <img> so it
              never counts as content (and never trips the LCP image lint). */}
          <div className={styles.icon} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <h2 className={styles.title} id="rovora-install-title">Install Rovora</h2>
            <p className={styles.subtitle}>
              Add it to your home screen for full-screen access and faster loading.
            </p>
          </div>
        </div>

        {showNativeButton ? (
          <div className={styles.actions}>
            <button className={styles.installBtn} onClick={handleInstall}>Install</button>
            <button className={styles.laterBtn} onClick={dismiss}>Not now</button>
          </div>
        ) : (
          <ol className={styles.steps}>
            {steps.map((step, i) => (
              <li key={i} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Manual opens have no "Not now" button above, so give them a way out
            that isn't just the small × in the corner. */}
        {!showNativeButton && forced && (
          <div className={styles.actions}>
            <button className={styles.laterBtn} style={{ flex: 1 }} onClick={dismiss}>Got it</button>
          </div>
        )}
      </div>
    </div>
  );
}

const ShareGlyph = (
  <svg
    className={styles.shareIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 16V3" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
);

const IOS_STEPS = [
  <>Tap the Share button {ShareGlyph} in the browser bar</>,
  <>Scroll down and tap <strong>Add to Home Screen</strong></>,
  <>Tap <strong>Add</strong> — Rovora appears with your apps</>,
];

const DESKTOP_STEPS = [
  <>Open your browser&rsquo;s menu</>,
  <>Choose <strong>Install</strong> or <strong>Add to Home Screen</strong></>,
  <>Confirm — Rovora opens in its own window</>,
];
