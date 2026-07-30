'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types/database';
import { useBranding } from '@/components/shared/BrandingProvider';
import { useEnabledModules } from './FleetModulesProvider';
import { useFleetTheme } from './FleetThemeRoot';
import FleetOrgSwitcher from './FleetOrgSwitcher';
import {
  BOTTOM_TAB_FALLBACKS,
  BOTTOM_TABS,
  DRIVER_BOTTOM_TABS,
  DRIVER_NAV_GROUPS,
  NAV_GROUPS,
  canSeeNavItem,
  type NavItem,
} from './navConfig';
import FleetIcon from './FleetIcon';

/**
 * Raised centre button in the driver's mobile tab bar: one press to go online
 * (→ /driver/go-online) or, while on shift, to end it (confirm → /api/shifts/end).
 */
function DriverShiftFab() {
  const router = useRouter();
  const pathname = usePathname();
  const [onShift, setOnShift] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-check whenever the driver navigates (e.g. right after starting a shift).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!driver) return;
      const { data: shift } = await supabase
        .from('driver_shifts')
        .select('id')
        .eq('driver_id', driver.id)
        .is('end_time', null)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setOnShift(Boolean(shift));
    };
    void check();
    return () => { cancelled = true; };
  }, [pathname]);

  const handlePress = async () => {
    if (busy) return;
    if (!onShift) {
      router.push('/driver/go-online');
      return;
    }
    if (!window.confirm('End your shift now?')) return;
    setBusy(true);
    try {
      // Stop background location in the app (no-op in a plain browser).
      const native = (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView;
      if (native) native.postMessage(JSON.stringify({ type: 'stop-tracking' }));
      const res = await fetch('/api/shifts/end', { method: 'POST' });
      if (res.ok) {
        setOnShift(false);
        router.push('/driver');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button
        onClick={handlePress}
        disabled={busy}
        aria-label={onShift ? 'End shift' : 'Go online'}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          marginTop: -20,
          background: onShift ? 'var(--neg)' : 'var(--accent)',
          color: '#fff',
          border: '4px solid var(--bg-1)',
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: busy ? 'wait' : 'pointer',
          transition: 'background 160ms ease',
        }}
      >
        {onShift ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden>
            <path d="M8 5.5v13l11-6.5-11-6.5z" />
          </svg>
        )}
      </button>
      <span style={{ fontSize: 9.5, marginTop: 2, fontWeight: 600, color: onShift ? 'var(--neg)' : 'var(--accent)' }}>
        {busy ? 'Ending…' : onShift ? 'End shift' : 'Go online'}
      </span>
    </div>
  );
}

interface FleetSidebarProps {
  user: SessionUser;
  variant?: 'fleet' | 'driver';
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  onMenuToggle: () => void;
  /** Desktop only: render as a narrow icon rail. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function FleetSidebar({
  user,
  variant = 'fleet',
  isMobile,
  open,
  onClose,
  onMenuToggle,
  collapsed = false,
  onToggleCollapsed,
}: FleetSidebarProps) {
  const pathname = usePathname();
  const { logoUrl } = useBranding();
  const enabledModules = useEnabledModules();
  const { theme } = useFleetTheme();

  const railed = collapsed && !isMobile;

  // Rail tooltip. Portalled to <body> because the nav scrolls (overflow-y:
  // auto forces overflow-x to clip too), so anything drawn outside the 64px
  // rail would be cut off. Position comes from the hovered item's own rect.
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showTip = useCallback((e: { currentTarget: HTMLElement }, label: string) => {
    if (!railed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  }, [railed]);

  const hideTip = useCallback(() => setTip(null), []);

  // Expanding the sidebar mid-hover would otherwise strand the tooltip.
  useEffect(() => { if (!railed) setTip(null); }, [railed]);

  const isDriver = variant === 'driver';
  const rootHref = isDriver ? '/driver' : '/fleet';
  const navGroups = isDriver ? DRIVER_NAV_GROUPS : NAV_GROUPS;

  // Identity, billing, profile, help and sign-out now live in the topbar
  // account menu (FleetAccountMenu) — the sidebar is navigation only.
  const canSee = (item: NavItem) =>
    canSeeNavItem(item, {
      role: user?.role,
      alsoStaff: user?.also_staff,
      enabledModules,
      isDriver,
    });

  const isActive = (href: string) =>
    pathname === href || (href !== rootHref && pathname.startsWith(href));

  // Mobile tab bar respects the same gates as the sidebar, topping up from the
  // fallback list so a fleet with modules switched off still gets a full bar.
  const bottomTabs: NavItem[] = isDriver
    ? DRIVER_BOTTOM_TABS
    : (() => {
        const picked = BOTTOM_TABS.filter(canSee);
        for (const extra of BOTTOM_TAB_FALLBACKS) {
          if (picked.length >= BOTTOM_TABS.length) break;
          if (canSee(extra) && !picked.some((p) => p.id === extra.id)) picked.push(extra);
        }
        return picked;
      })();

  // Sits in the top-right of the sidebar header, beside the org switcher. In
  // rail mode there's no room alongside the monogram, so it drops to its own
  // centred row directly underneath — still at the top, not buried at the foot
  // of the nav where it used to live.
  const collapseToggle =
    !isMobile && onToggleCollapsed ? (
      <button
        onClick={() => { hideTip(); onToggleCollapsed(); }}
        onMouseEnter={(e) => showTip(e, 'Expand sidebar')}
        onMouseLeave={hideTip}
        className="fleetCollapseBtn"
        style={s.collapseBtn}
        // Native title only when expanded — in the rail it would double up with
        // the custom tooltip.
        title={railed ? undefined : 'Collapse sidebar  ['}
        aria-label={railed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <FleetIcon name={railed ? 'chevron-right' : 'chevron-left'} size={16} stroke={1.7} />
      </button>
    ) : null;

  const body = (
    <>
      <div style={{ ...s.logoWrap, ...(railed ? s.logoWrapRail : {}), ...(isMobile ? s.logoWrapMobile : {}) }}>
        {/* The drawer covers most of the screen, leaving barely any scrim to
            tap — so give it an explicit close control. */}
        {isMobile && (
          <button onClick={onClose} style={s.closeBtn} className="fleetIconBtn fleetIconBtnBare" aria-label="Close menu">
            <FleetIcon name="close" size={20} stroke={2} />
          </button>
        )}
        {/* Handlers sit on the wrapper so the switcher itself needs no tooltip
            plumbing — hover bubbles up from the trigger inside it. */}
        <div
          style={s.orgSlot}
          onMouseEnter={(e) => showTip(e, user?.organization_name || 'Rovora')}
          onMouseLeave={hideTip}
          onClick={hideTip}
        >
          <FleetOrgSwitcher
            user={user}
            logoUrl={logoUrl}
            railed={railed}
            isMobile={isMobile}
            onNavigate={onClose}
          />
        </div>
        {!railed && collapseToggle}
      </div>

      {railed && collapseToggle && <div style={s.railToggleRow}>{collapseToggle}</div>}

      <nav style={{ ...s.nav, ...(railed ? s.navRail : {}) }}>
        {navGroups.map((g, gi) => {
          const items = g.items.filter(canSee);
          if (!items.length) return null;
          return (
            <div key={gi} style={{ marginBottom: railed ? 8 : 14 }}>
              {g.label && (railed ? <div style={s.railDivider} /> : <div style={s.navLabel}>{g.label}</div>)}
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => { hideTip(); onClose(); }}
                    onMouseEnter={(e) => showTip(e, item.name)}
                    onMouseLeave={hideTip}
                    onBlur={hideTip}
                    onFocus={(e) => showTip(e, item.name)}
                    data-tour={`nav-${item.id}`}
                    // No `title` — that draws the OS's own grey tooltip. The
                    // rail renders its own (portalled, see railTip below).
                    aria-label={railed ? item.name : undefined}
                    className={`fleetNavItem${active ? ' fleetNavItemActive' : ''}`}
                    style={{
                      ...s.navItem,
                      ...(railed ? s.navItemRail : {}),
                      textDecoration: 'none',
                    }}
                  >
                    {/* Colours come from .fleetNavItem / .fleetNavItemActive in
                        fleet-theme.css — inline colours here would outrank the
                        hover rules and freeze the transition. */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <FleetIcon name={item.icon} size={17} stroke={1.6} />
                      {!railed && (
                        <span style={{ fontWeight: active ? 500 : 400 }}>{item.name}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

    </>
  );

  const renderBottomTab = (tab: NavItem) => {
    const active = isActive(tab.href);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className={`fleetBottomTab${active ? ' fleetBottomTabActive' : ''}`}
        style={{ ...s.bottomTab, ...(active ? s.bottomTabActive : {}) }}
      >
        <FleetIcon name={tab.icon} size={20} stroke={active ? 1.9 : 1.6} />
        <span style={{ fontSize: 10.5, marginTop: 2 }}>{tab.name}</span>
      </Link>
    );
  };

  if (isMobile) {
    return (
      <>
        {open && <div style={s.scrim} onClick={onClose} />}
        <aside style={{ ...s.sidebar, ...s.sidebarMobile, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
          {body}
        </aside>
        <nav style={s.bottomBar}>
          {(isDriver ? bottomTabs.slice(0, 2) : bottomTabs).map(renderBottomTab)}
          {isDriver && <DriverShiftFab />}
          {isDriver && bottomTabs.slice(2).map(renderBottomTab)}
          <button
            onClick={onMenuToggle}
            style={{ ...s.bottomTab, ...(open ? s.bottomTabActive : {}) }}
            className={`fleetBottomTab${open ? ' fleetBottomTabActive' : ''}`}
          >
            <FleetIcon name="dots" size={20} stroke={1.6} />
            <span style={{ fontSize: 10.5, marginTop: 2 }}>More</span>
          </button>
        </nav>
      </>
    );
  }

  return (
    <>
      <aside style={{ ...s.sidebar, ...(railed ? s.sidebarRail : {}) }}>{body}</aside>
      {railed && tip && mounted && createPortal(
        <div
          className="fleetRailTip fleetTheme"
          data-fleet-theme={theme}
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </div>,
        document.body,
      )}
    </>
  );
}

const s: Record<string, CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-w)',
    minHeight: '100vh',
    background: 'var(--bg-0)',
    borderRight: '1px solid var(--line-1)',
    display: 'flex',
    flexDirection: 'column',
    position: 'sticky',
    top: 0,
    flexShrink: 0,
    zIndex: 1,
    transition: 'width 180ms cubic-bezier(.4,.0,.2,1)',
  },
  sidebarRail: { width: 'var(--sidebar-rail-w)' },
  sidebarMobile: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    minHeight: 'auto',
    height: '100vh',
    // Full-screen on an iPhone the drawer starts behind the status bar.
    paddingTop: 'env(safe-area-inset-top, 0px)',
    zIndex: 50,
    transition: 'transform 220ms cubic-bezier(.4,.0,.2,1)',
    boxShadow: '8px 0 32px rgba(0,0,0,0.3)',
    background: 'var(--bg-1)',
  },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49, backdropFilter: 'blur(2px)' },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    // Everything here is border-box, so the home-indicator inset has to be
    // ADDED to the height — otherwise the padding eats the tabs and they end
    // up ~26px tall on an iPhone once the app runs full-screen.
    height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    background: 'var(--bg-1)',
    borderTop: '1px solid var(--line-1)',
    display: 'flex',
    zIndex: 30,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  },
  bottomTab: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-3)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    padding: 0,
    textDecoration: 'none',
  },
  bottomTabActive: { color: 'var(--accent)' },
  // 9px padding + the 42px-tall switcher trigger + 1px border = 61px, matching
  // the topbar so the two headers line up across the seam.
  logoWrap: { display: 'flex', alignItems: 'center', gap: 4, padding: '9px 10px', borderBottom: '1px solid var(--line-1)', minHeight: 61 },
  logoWrapRail: { padding: '9px 6px', justifyContent: 'center', gap: 0 },
  logoWrapMobile: { padding: '9px 10px 9px 4px', gap: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav:{ flex: 1, overflowY: 'auto', padding: '14px 10px' },
  navRail: { padding: '14px 8px', overflowX: 'hidden' },
  navLabel: { fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '8px 10px 4px' },
  railDivider: { height: 1, background: 'var(--line-1)', margin: '6px 8px 8px' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '9px 10px',
    border: 'none',
    borderRadius: 7,
    fontSize: 13.5,
    textAlign: 'left',
    // Background, colour and transitions live in fleet-theme.css
    // (.fleetNavItem / .fleetNavItemActive). Setting them inline would outrank
    // the stylesheet and the hover state would never show.
    marginBottom: 1,
    fontFamily: 'inherit',
  },
  navItemRail: { justifyContent: 'center', padding: '10px 0' },
  /** Lets the org switcher shrink so the collapse button keeps its corner. */
  orgSlot: { flex: 1, minWidth: 0 },
  collapseBtn: {
    width: 30,
    height: 30,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 'none',
    borderRadius: 7,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  railToggleRow: { display: 'flex', justifyContent: 'center', padding: '8px 0 0' },
};
