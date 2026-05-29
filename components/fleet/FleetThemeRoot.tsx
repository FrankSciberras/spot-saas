'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type FleetTheme = 'dark' | 'light';

interface FleetThemeContextValue {
  theme: FleetTheme;
  toggleTheme: () => void;
}

const FleetThemeContext = createContext<FleetThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'spot-fleet-theme';

export function FleetThemeRoot({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<FleetTheme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as FleetTheme | null;
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <FleetThemeContext.Provider value={{ theme, toggleTheme }}>
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
