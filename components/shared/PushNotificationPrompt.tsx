"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types/database';
import styles from './PushNotificationPrompt.module.css';

interface PushNotificationPromptProps {
  variant: 'admin' | 'driver';
  role?: UserRole;
}

const STORAGE_KEY = 'rovora-push-prompt-shown';

/**
 * Call this on logout to reset the prompt so it shows again on next login.
 */
export function resetPushPrompt() {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export default function PushNotificationPrompt({ variant, role }: PushNotificationPromptProps) {
  const [show, setShow] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Fleet operators found this nudge annoying on the dashboard — never show it
    // on the admin/staff (fleet) side. Drivers keep it (they have their own
    // per-fleet opt-out below, controlled by the operator).
    if (variant === 'admin') return;

    // Only show once between login/logout cycles
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const checkPushStatus = async () => {
      // 0. For drivers, respect the fleet operator's toggle: if they've turned
      //    the "Stay in the loop" nudge off for their fleet, never show it.
      if (variant === 'driver') {
        try {
          const res = await fetch('/api/fleet/driver-push-prompt');
          if (res.ok) {
            const { prompt_drivers_push } = await res.json();
            if (prompt_drivers_push === false) return;
          }
        } catch {
          // Network error — fall through and prompt as usual.
        }
      }

      // 1. Check browser support
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return;
      }

      // 2. If permission is already granted, check if actually subscribed
      if (Notification.permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            return; // Already subscribed, don't show
          }
        } catch {
          // Error checking — fall through to show prompt
        }
      }

      // 3. If permission was explicitly denied, don't show
      if (Notification.permission === 'denied') {
        return;
      }

      // 4. Not subscribed — show prompt once, mark as shown
      sessionStorage.setItem(STORAGE_KEY, '1');
      setShow(true);
    };

    // Small delay so the dashboard loads first
    const timer = setTimeout(checkPushStatus, 1200);
    return () => clearTimeout(timer);
  }, [variant]);

  if (!show) return null;

  const profilePath = variant === 'driver'
    ? '/driver/profile'
    : role === 'staff'
      ? '/staff/profile'
      : '/fleet/profile';

  const handleGoToSettings = () => {
    setShow(false);
    router.push(profilePath);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {/* Close X */}
        <button
          className={styles.closeBtn}
          onClick={() => setShow(false)}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Bell icon */}
        <div className={styles.iconWrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </div>

        <h2 className={styles.title}>Stay in the loop</h2>
        <p className={styles.description}>
          Enable push notifications so you never miss important updates about
          {variant === 'driver'
            ? ' rosters, shifts, and earnings.'
            : ' fleet alerts, driver activity, and system events.'}
        </p>

        {/* CTA */}
        <button className={styles.ctaBtn} onClick={handleGoToSettings}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Enable in Settings
        </button>

        <span className={styles.skipText}>You can always enable this later from your profile.</span>
      </div>
    </div>
  );
}
