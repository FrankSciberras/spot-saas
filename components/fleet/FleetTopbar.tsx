'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/types/database';
import FleetIcon from './FleetIcon';
import { useEnabledModules } from './FleetModulesProvider';
import FleetAccountMenu from './FleetAccountMenu';
import FleetNotifications from './FleetNotifications';

interface FleetTopbarProps {
  title: string;
  onMenuClick: () => void;
  isAdmin?: boolean;
  variant?: 'fleet' | 'driver';
  user: SessionUser;
  /** Below 720px the account menu opens as a bottom sheet instead of a dropdown. */
  isMobile?: boolean;
}

interface NewAction {
  label: string;
  hint: string;
  icon: string;
  href: string;
  adminOnly?: boolean;
  /** Hidden when the fleet has this module switched off (undefined = always shown). */
  module?: string;
}

/** Quick-create targets for the topbar "New" dropdown (existing /new routes). */
const NEW_ACTIONS: NewAction[] = [
  { label: 'driver', hint: 'Add a driver & their documents', icon: 'driver', href: '/fleet/drivers/new' },
  { label: 'vehicle', hint: 'Register a car to the fleet', icon: 'vehicle', href: '/fleet/vehicles/new' },
  { label: 'roster', hint: 'Plan a new weekly schedule', icon: 'roster', href: '/fleet/rosters/new', module: 'rostering' },
  { label: 'service', hint: 'Log a service or repair', icon: 'wrench', href: '/fleet/services/new', module: 'maintenance' },
  { label: 'staff member', hint: 'Invite an operations user', icon: 'staff', href: '/fleet/staff/new', adminOnly: true },
];

export default function FleetTopbar({ title, onMenuClick, isAdmin = false, variant = 'fleet', user, isMobile = false }: FleetTopbarProps) {
  const router = useRouter();
  const enabledModules = useEnabledModules();
  const [now, setNow] = useState<Date | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

  const actions = NEW_ACTIONS.filter(
    (a) => (!a.adminOnly || isAdmin) && (!a.module || enabledModules.has(a.module)),
  );

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

  // FleetCommandPalette (mounted in FleetShell) listens for this.
  const openSearch = () => window.dispatchEvent(new Event('rovora:open-search'));

  const dateStr = now?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) ?? '';
  const timeStr = now?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) ?? '';

  return (
    <div style={st.topbar} className="topbar-mobile">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button onClick={onMenuClick} className="show-mobile-only fleetIconBtn fleetIconBtnBare" style={st.menuBtn} aria-label="Open menu">
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
          <>
            {/* Desktop: a real button dressed as an input — opens the ⌘K palette. */}
            <button
              style={st.searchBox}
              className="hide-mobile fleetSearchBtn"
              onClick={openSearch}
              aria-label="Search drivers, plates, or jump to a page"
            >
              <FleetIcon name="search" size={15} />
              <span style={st.searchText}>Search drivers, plates, settlements…</span>
              <kbd style={st.kbd}>⌘K</kbd>
            </button>
            {/* Mobile: same palette, icon-only. */}
            <button
              style={st.ghostBtn}
              className="show-mobile-only fleetIconBtn"
              onClick={openSearch}
              aria-label="Search"
            >
              <FleetIcon name="search" size={16} />
            </button>
          </>
        )}

        <FleetNotifications variant={variant} isMobile={isMobile} />

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

        <FleetAccountMenu user={user} variant={variant} isMobile={isMobile} />
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  topbar: {
    // Installed on an iPhone the app runs full-screen, so the bar would sit
    // UNDER the status bar. Grow it by the inset and push the contents down —
    // the extra height is tinted bar, not clipped controls. Resolves to 0
    // everywhere else (and in a normal browser tab).
    height: 'calc(var(--topbar-h) + env(safe-area-inset-top, 0px))',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingLeft: 24,
    paddingRight: 24,
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
  // NOTE: no background/border/colour here — those live in fleet-theme.css so
  // the :hover rules can win the cascade. Inline styles always outrank them.
  menuBtn: { width: 36, height: 36, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, color: 'var(--text-3)', minWidth: 320, cursor: 'pointer', textAlign: 'left' },
  searchText: { flex: 1, fontSize: 13, fontFamily: 'inherit', color: 'var(--text-3)' },
  kbd: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--line-1)' },
  ghostBtn: { width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' },
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
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-1)',
  },
  // Surface + transition in fleet-theme.css (.fleetNewItemIco) so the parent's
  // :hover can retint it — inline values here blocked that entirely.
  menuItemIco: {
    flexShrink: 0,
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 9,
  },
  menuItemLabel: { fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', textTransform: 'capitalize' },
  menuItemHint: { fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
