'use client';

import { useEffect, useRef, useState } from 'react';

/** Broadcast channel so every mounted toggle shows the same icon. */
const SYNC_EVENT = 'rovora-theme-change';

/**
 * Light/dark toggle for the Rovora marketing + auth surfaces.
 * Flips the `data-theme` attribute on the nearest `.rovora-site` ancestor
 * and remembers the choice in localStorage.
 *
 * More than one can be on the page at a time (the footer and the mobile menu),
 * so each instance listens for the others' changes instead of drifting.
 */
export default function RovoraThemeToggle() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const apply = (next: 'light' | 'dark') => {
    const root = btnRef.current?.closest<HTMLElement>('.rovora-site');
    if (root) root.setAttribute('data-theme', next);
  };

  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? window.localStorage.getItem('rovora-theme')
      : null) as 'light' | 'dark' | null;
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored);
      apply(stored);
    }

    const onSync = (e: Event) => {
      const next = (e as CustomEvent<'light' | 'dark'>).detail;
      setTheme(next);
      apply(next);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    apply(next);
    try {
      window.localStorage.setItem('rovora-theme', next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
