'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';

interface FleetTopbarProps {
  title: string;
  onMenuClick: () => void;
  isAdmin?: boolean;
  variant?: 'fleet' | 'driver';
}

interface NewAction {
  label: string;
  hint: string;
  icon: string;
  href: string;
  adminOnly?: boolean;
}

/** Quick-create targets for the topbar "New" dropdown (existing /new routes). */
const NEW_ACTIONS: NewAction[] = [
  { label: 'driver', hint: 'Add a driver & their documents', icon: 'driver', href: '/fleet/drivers/new' },
  { label: 'vehicle', hint: 'Register a car to the fleet', icon: 'vehicle', href: '/fleet/vehicles/new' },
  { label: 'roster', hint: 'Plan a new weekly schedule', icon: 'roster', href: '/fleet/rosters/new' },
  { label: 'service', hint: 'Log a service or repair', icon: 'wrench', href: '/fleet/services/new' },
  { label: 'staff member', hint: 'Invite an operations user', icon: 'staff', href: '/fleet/staff/new', adminOnly: true },
];

export default function FleetTopbar({ title, onMenuClick, isAdmin = false, variant = 'fleet' }: FleetTopbarProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useFleetTheme();
  const [now, setNow] = useState<Date | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

  const actions = NEW_ACTIONS.filter((a) => !a.adminOnly || isAdmin);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Close the "New" menu on outside click or Escape.
  useEffect(() => {
    if (!newOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNewOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  const goNew = (href: string) => {
    setNewOpen(false);
    router.push(href);
  };

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
        {variant === 'fleet' && (
          <div style={st.searchBox} className="hide-mobile">
            <FleetIcon name="search" size={15} />
            <input placeholder="Search drivers, plates, settlements…" style={st.searchInput} />
            <kbd style={st.kbd}>⌘K</kbd>
          </div>
        )}
        <button
          onClick={toggleTheme}
          style={st.ghostBtn}
          className="fleetHover"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <FleetIcon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        {variant === 'fleet' && (
        <>
        <div style={{ width: 1, height: 20, background: 'var(--line-2)', margin: '0 4px' }} className="hide-mobile" />

        {/* New quick-create dropdown */}
        <div ref={newRef} style={{ position: 'relative' }} className="hide-mobile">
          <button
            style={st.primaryBtn}
            className="fleetHover"
            onClick={() => setNewOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={newOpen}
          >
            <FleetIcon name="plus" size={14} stroke={2} />
            New
            <FleetIcon
              name="chevron-down"
              size={13}
              stroke={2}
              style={{ transition: 'transform .15s', transform: newOpen ? 'rotate(180deg)' : 'none', opacity: 0.9 }}
            />
          </button>

          {newOpen && (
            <div style={st.menu} className="fleetNewMenu" role="menu">
              <div style={st.menuLabel}>Create new</div>
              {actions.map((a) => (
                <button
                  key={a.href}
                  role="menuitem"
                  className="fleetNewItem"
                  style={st.menuItem}
                  onClick={() => goNew(a.href)}
                >
                  <span style={st.menuItemIco} className="fleetNewItemIco">
                    <FleetIcon name={a.icon} size={16} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={st.menuItemLabel}>New {a.label}</span>
                    <span style={st.menuItemHint}>{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        </>
        )}
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
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 268,
    padding: 6,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 40,
  },
  menuLabel: {
    padding: '8px 10px 6px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-1)',
  },
  menuItemIco: {
    flexShrink: 0,
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 9,
    background: 'var(--bg-2)',
    border: '1px solid var(--line-2)',
    color: 'var(--text-2)',
    transition: 'color .12s, background .12s, border-color .12s',
  },
  menuItemLabel: { fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', textTransform: 'capitalize' },
  menuItemHint: { fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
