'use client';

import { useEffect, useState } from 'react';

/** The Rovora Driver app fires this when it comes back to the foreground (1.0.3+). */
export const APP_RESUMED_EVENT = 'rovora:app-resumed';

/**
 * Answers "Are you still on shift?" (lib/shifts/shift-check) just by the driver
 * being here: whenever the driver portal opens, or the app/tab comes back into
 * view, it tells the server they're still around. If a check was pending, the
 * shift carries on and the driver sees a short "thanks". Mounted in the driver
 * layout; renders nothing otherwise.
 */
export default function ShiftCheckConfirmer() {
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    let lastAt = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const confirm = async () => {
      if (Date.now() - lastAt < 30_000) return; // one call per half-minute is plenty
      lastAt = Date.now();
      const res = await fetch('/api/shifts/still-on-shift', { method: 'POST' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (res?.confirmed) {
        setThanks(true);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setThanks(false), 6000);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void confirm();
    };

    void confirm();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener(APP_RESUMED_EVENT, onVisible);
    return () => {
      clearTimeout(hideTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener(APP_RESUMED_EVENT, onVisible);
    };
  }, []);

  if (!thanks) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: 'calc(100vw - 32px)',
        padding: '12px 16px',
        borderRadius: 12,
        background: 'var(--bg-1, #fff)',
        border: '1px solid var(--accent-line, #b9e4cf)',
        boxShadow: 'var(--shadow-elevated, 0 8px 30px rgba(0,0,0,.15))',
        color: 'var(--text-1, #0e1116)',
        fontSize: 14,
      }}
    >
      ✓ Thanks — your shift continues.
    </div>
  );
}
