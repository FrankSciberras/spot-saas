'use client';

// A small remembered choice (e.g. a list's Grid / Table view), kept per browser
// in localStorage and shared live between components and tabs. Server render
// and hydration use `fallback`, then the stored value applies — so the markup
// always matches.

import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'rovora:stored-choice';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const read = useCallback(() => {
    try {
      const v = localStorage.getItem(key);
      return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  }, [key, allowed, fallback]);

  const value = useSyncExternalStore(subscribe, read, () => fallback);

  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Private mode — the choice just won't be remembered.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
