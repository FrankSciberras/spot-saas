'use client';

// Which sidebar sections (Operations, Tracking, Maintenance…) the person has
// folded away. Kept per browser in localStorage, like the sidebar's own
// collapse state, and shared live between every sidebar on the page (desktop
// + mobile drawer) and other tabs via the `storage` event.

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const KEY = 'rovora-nav-collapsed-groups';
const EVENT = 'rovora:nav-collapsed-groups';

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function parse(raw: string): Set<string> {
  try {
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function useCollapsedNavGroups(): { collapsed: Set<string>; toggle: (label: string) => void } {
  // Server render (and hydration) see nothing collapsed; the stored state is
  // applied right after, so the markup always matches.
  const raw = useSyncExternalStore(subscribe, read, () => '[]');
  const collapsed = useMemo(() => parse(raw), [raw]);

  const toggle = useCallback((label: string) => {
    const next = parse(read());
    if (next.has(label)) next.delete(label);
    else next.add(label);
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // Private mode — the section still toggles for this page view.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { collapsed, toggle };
}
