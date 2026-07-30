'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types/database';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { openInstallPrompt } from '@/components/shared/InstallPrompt';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';

interface FleetAccountMenuProps {
  user: SessionUser;
  /** 'fleet' (default) = operator dashboard; 'driver' = driver dashboard. */
  variant?: 'fleet' | 'driver';
  /** Below the 720px breakpoint the menu opens as a bottom sheet, not a dropdown. */
  isMobile?: boolean;
}

interface MenuLink {
  label: string;
  href: string;
  icon: string;
}

/**
 * Avatar button in the topbar + the account menu it opens.
 *
 * This replaces the old sidebar "Account" group, the loose "Help & tour"
 * button and the user card — identity and account chrome now live top-right,
 * leaving the sidebar for navigation only.
 *
 * Desktop renders a dropdown anchored to the avatar; mobile portals a bottom
 * sheet so the actions land under the thumb instead of in the far corner.
 */
export default function FleetAccountMenu({ user, variant = 'fleet', isMobile = false }: FleetAccountMenuProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useFleetTheme();
  // Hidden once Rovora is running as an installed app — there is nothing left
  // to install at that point.
  const { ready: installReady, standalone: installed } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isDriver = variant === 'driver';

  useEffect(() => setMounted(true), []);

  // Desktop: close on outside click. Both: close on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (isMobile) return; // the sheet has its own scrim
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  // Stop the page scrolling behind the mobile sheet.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const handleLogout = async () => {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const startTour = () => {
    setOpen(false);
    window.dispatchEvent(new Event('rovora:start-tour'));
  };

  const showInstall = () => {
    setOpen(false);
    openInstallPrompt();
  };

  // Profile lives on a different route per role — mirrors the old nav entries.
  const profileHref = isDriver
    ? '/driver/profile'
    : user?.role === 'admin'
      ? '/fleet/profile'
      : '/staff/profile';

  const links: MenuLink[] = [{ label: 'My profile', href: profileHref, icon: 'driver' }];
  if (!isDriver && user?.role === 'admin') {
    links.push({ label: 'Billing and plan', href: '/fleet/billing', icon: 'settle' });
  }

  // A driver who is also staff can hop between the two dashboards.
  const showSwitch = user?.also_staff && user?.role === 'driver';
  const switchHref = isDriver ? '/fleet' : '/driver';

  const initial =
    user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?';
  const roleLabel = user?.also_staff && user?.role === 'driver' ? 'Staff' : user?.role || 'Member';

  const menuBody = (
    <>
      <div style={s.identity}>
        <div style={s.avatarLg}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={s.identityName}>{user?.full_name || user?.email || 'User'}</div>
          <div style={s.identityMeta}>
            <span style={{ textTransform: 'capitalize' }}>{roleLabel}</span>
            {user?.organization_name ? ` · ${user.organization_name}` : ''}
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {links.map((l) => (
        <button key={l.href} role="menuitem" className="fleetMenuItem" style={s.item} onClick={() => go(l.href)}>
          <FleetIcon name={l.icon} size={17} stroke={1.6} />
          <span>{l.label}</span>
        </button>
      ))}

      {!isDriver && (
        <button role="menuitem" className="fleetMenuItem" style={s.item} onClick={startTour}>
          <FleetIcon name="info" size={17} stroke={1.6} />
          <span>Help and tour</span>
        </button>
      )}

      {installReady && !installed && (
        <button role="menuitem" className="fleetMenuItem" style={s.item} onClick={showInstall}>
          <FleetIcon name="download" size={17} stroke={1.6} />
          <span>Install app</span>
        </button>
      )}

      {showSwitch && (
        <button role="menuitem" className="fleetMenuItem" style={s.item} onClick={() => go(switchHref)}>
          <FleetIcon name="refresh" size={17} stroke={1.6} />
          <span>{isDriver ? 'Switch to fleet view' : 'Switch to driver view'}</span>
        </button>
      )}

      <div style={s.divider} />

      <div style={s.appearanceRow}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Appearance</span>
        <div style={s.segmented} role="group" aria-label="Colour theme">
          {(['light', 'dark'] as const).map((t) => {
            const active = theme === t;
            return (
              <button
                key={t}
                onClick={() => { if (!active) toggleTheme(); }}
                aria-pressed={active}
                aria-label={`${t} mode`}
                className={`fleetSegBtn${active ? ' fleetSegBtnActive' : ''}`}
                style={s.segBtn}
              >
                <FleetIcon name={t === 'light' ? 'sun' : 'moon'} size={14} stroke={1.7} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.divider} />

      <button role="menuitem" className="fleetMenuItem fleetMenuItemDanger" style={s.item} onClick={handleLogout}>
        <FleetIcon name="logout" size={17} stroke={1.6} />
        <span>Sign out</span>
      </button>
    </>
  );

  const trigger = (
    <button
      onClick={() => setOpen((o) => !o)}
      style={{ ...s.avatarBtn, ...(open ? s.avatarBtnActive : {}) }}
      className="fleetAvatarBtn"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Account menu"
      title={user?.email || 'Account'}
    >
      {initial}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        {mounted && open && createPortal(
          // Portalled to <body>, which is outside the .fleetTheme wrapper — so
          // re-apply it here or none of the design tokens resolve.
          <div
            style={s.sheetScrim}
            className="fleetSheetScrim fleetTheme"
            data-fleet-theme={theme}
            onClick={() => setOpen(false)}
          >
            <div
              style={s.sheet}
              className="fleetSheet"
              role="menu"
              aria-label="Account"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={s.grabber} />
              {menuBody}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {trigger}
      {open && (
        <div style={s.menu} className="fleetNewMenu" role="menu" aria-label="Account">
          {menuBody}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  avatarBtn: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'border-color .12s',
  },
  avatarBtnActive: { borderColor: 'var(--accent-line)' },

  menu: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: 250,
    padding: 6,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 40,
  },

  sheetScrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(2px)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    padding: '8px 10px calc(14px + env(safe-area-inset-bottom, 0px))',
    background: 'var(--bg-1)',
    borderTop: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
    boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
    zIndex: 61,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--line-3)',
    margin: '2px auto 10px',
  },

  identity: { display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px 12px' },
  avatarLg: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: '50%',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityName: {
    fontSize: 13.5,
    fontWeight: 500,
    color: 'var(--text-1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  identityMeta: {
    fontSize: 11.5,
    color: 'var(--text-3)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  divider: { height: 1, background: 'var(--line-1)', margin: '4px 4px 6px' },

  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    padding: '9px 10px',
    // Background in fleet-theme.css (.fleetMenuItem) — inline blocks :hover.
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: 13.5,
    fontFamily: 'inherit',
    color: 'var(--text-1)',
  },

  appearanceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 10px 8px',
  },
  segmented: {
    display: 'flex',
    gap: 2,
    padding: 2,
    background: 'var(--bg-2)',
    border: '1px solid var(--line-1)',
    borderRadius: 8,
  },
  segBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 22,
    // Surface/colour in fleet-theme.css (.fleetSegBtn) so :hover applies.
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
};
