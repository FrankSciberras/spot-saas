'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';

interface FleetTopbarProps {
  title: string;
  onMenuClick: () => void;
}

export default function FleetTopbar({ title, onMenuClick }: FleetTopbarProps) {
  const { theme, toggleTheme } = useFleetTheme();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const dateStr = now?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) ?? '';
  const timeStr = now?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) ?? '';

  return (
    <div style={st.topbar} className="topbar-mobile">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button onClick={onMenuClick} className="show-mobile-only fleetHover" style={st.menuBtn} aria-label="Open menu">
          <FleetIcon name="menu" size={20} stroke={2} />
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <h1 style={st.pageTitle}>{title}</h1>
          <span className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span>
          <span className="hide-mobile" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{dateStr}</span>
          <span className="mono tnum hide-mobile" style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>{timeStr}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={st.searchBox} className="hide-mobile">
          <FleetIcon name="search" size={15} />
          <input placeholder="Search drivers, plates, settlements…" style={st.searchInput} />
          <kbd style={st.kbd}>⌘K</kbd>
        </div>
        <button
          onClick={toggleTheme}
          style={st.ghostBtn}
          className="fleetHover"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <FleetIcon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--line-2)', margin: '0 4px' }} className="hide-mobile" />
        <button style={st.primaryBtn} className="hide-mobile fleetHover">
          <FleetIcon name="plus" size={14} stroke={2} />
          New
        </button>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  topbar: {
    height: 'var(--topbar-h)',
    padding: '0 24px',
    borderBottom: '1px solid var(--line-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--topbar-bg)',
    backdropFilter: 'blur(10px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  pageTitle: { margin: 0, fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-1)' },
  menuBtn: { width: 36, height: 36, background: 'transparent', border: 'none', color: 'var(--text-1)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 320 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  kbd: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--line-1)' },
  ghostBtn: { width: 32, height: 32, background: 'transparent', border: '1px solid var(--line-1)', color: 'var(--text-2)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500 },
};
