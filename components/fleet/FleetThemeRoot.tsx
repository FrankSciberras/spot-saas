'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { usePreference, useSettingsAdmin, useSetPreference } from './FleetSettingsProvider';

type FleetTheme = 'dark' | 'light';
export type FleetThemeChoice = FleetTheme | 'system';

interface FleetThemeContextValue {
  /** The theme being shown right now. */
  theme: FleetTheme;
  /** What the person picked — 'system' follows the device. */
  choice: FleetThemeChoice;
  setChoice: (choice: FleetThemeChoice) => void;
  /** Flip to the opposite of what's shown (and stop following the device). */
  toggleTheme: () => void;
}

const FleetThemeContext = createContext<FleetThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'rovora-fleet-theme';
const LOCAL_EVENT = 'rovora-fleet-theme-change';
const isChoice = (v: unknown): v is FleetThemeChoice => v === 'dark' || v === 'light' || v === 'system';

// ── The device's light/dark setting ─────────────────────────────────────────
const DARK_QUERY = '(prefers-color-scheme: dark)';
function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia?.(DARK_QUERY);
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}
const systemIsDark = () => window.matchMedia?.(DARK_QUERY).matches ?? true;

// ── The copy kept on this device (localStorage) ─────────────────────────────
function subscribeLocal(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}
function readLocal(): FleetThemeChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isChoice(v) ? v : null;
  } catch {
    return null;
  }
}
function writeLocal(v: FleetThemeChoice) {
  try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/**
 * The theme is a personal preference (Settings → Preferences, key
 * `appearance.theme`) saved to the account, so it follows the person between
 * devices. A copy is kept in localStorage too: older sessions stored it only
 * there, so a local choice is carried over to the account the first time, and
 * the theme keeps working even if saving to the account fails.
 */
export function FleetThemeRoot({ children }: { children: ReactNode }) {
  const serverChoice = usePreference('appearance.theme');
  const savedOnServer = useSettingsAdmin().prefs.overridden.includes('appearance.theme');
  const savePref = useSetPreference();

  const local = useSyncExternalStore(subscribeLocal, readLocal, () => null);
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => true);

  // The account value wins once there is one; until then the device's copy.
  const choice: FleetThemeChoice = savedOnServer ? serverChoice : local ?? serverChoice;

  // Carry an older per-device choice over to the account (once per page load —
  // if it can't be saved we simply keep using the local copy).
  const carriedOver = useRef(false);
  useEffect(() => {
    if (savedOnServer || carriedOver.current || !local || local === serverChoice) return;
    carriedOver.current = true;
    void savePref('appearance.theme', local);
  }, [savedOnServer, local, serverChoice, savePref]);

  const setChoice = useCallback((next: FleetThemeChoice) => {
    writeLocal(next);
    void savePref('appearance.theme', next).then((err) => {
      if (err) console.warn('[theme] not saved to account:', err);
    });
  }, [savePref]);

  const theme: FleetTheme = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
  const toggleTheme = useCallback(() => setChoice(theme === 'dark' ? 'light' : 'dark'), [setChoice, theme]);

  return (
    <FleetThemeContext.Provider value={{ theme, choice, setChoice, toggleTheme }}>
      <div className="fleetTheme" data-fleet-theme={theme}>
        {children}
      </div>
    </FleetThemeContext.Provider>
  );
}

export function useFleetTheme() {
  const ctx = useContext(FleetThemeContext);
  if (!ctx) throw new Error('useFleetTheme must be used within FleetThemeRoot');
  return ctx;
}
