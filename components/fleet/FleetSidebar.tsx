'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types/database';
import { useBranding } from '@/components/shared/BrandingProvider';
import { useEnabledModules } from './FleetModulesProvider';
import { moduleForNav } from '@/lib/modules/catalog';
import FleetIcon from './FleetIcon';

interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: string;
  roles?: ('admin' | 'staff' | 'driver')[];
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ id: 'dashboard', name: 'Dashboard', href: '/fleet', icon: 'dashboard' }] },
  {
    label: 'Operations',
    items: [
      { id: 'staff', name: 'Staff', href: '/fleet/staff', icon: 'staff', roles: ['admin'] },
      { id: 'drivers', name: 'Drivers', href: '/fleet/drivers', icon: 'driver' },
      { id: 'vehicles', name: 'Vehicles', href: '/fleet/vehicles', icon: 'vehicle' },
      { id: 'rosters', name: 'Rosters', href: '/fleet/rosters', icon: 'roster' },
      { id: 'shifts', name: 'Shifts', href: '/fleet/shifts', icon: 'shift' },
      { id: 'tracking', name: 'Live Map', href: '/fleet/tracking', icon: 'map' },
      { id: 'trips', name: 'Trips', href: '/fleet/trips', icon: 'pin' },
      { id: 'safety', name: 'Safety', href: '/fleet/safety', icon: 'warning' },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { id: 'services', name: 'Services', href: '/fleet/services', icon: 'wrench' },
      { id: 'damages', name: 'Damages', href: '/fleet/damages', icon: 'damage' },
      { id: 'parts', name: 'Parts', href: '/fleet/parts', icon: 'box' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { id: 'bookkeeping', name: 'Bookkeeping', href: '/fleet/earnings', icon: 'book', roles: ['admin'] },
      { id: 'financials', name: 'Financials', href: '/fleet/financials', icon: 'chart', roles: ['admin'] },
      { id: 'settlements', name: 'Settlements', href: '/fleet/settlements', icon: 'settle', roles: ['admin'] },
      { id: 'adjustments', name: 'Adjustments', href: '/fleet/adjustments', icon: 'adjust', roles: ['admin'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'reminders', name: 'Reminders', href: '/fleet/reminders', icon: 'bell' },
      { id: 'audit', name: 'Audit Log', href: '/fleet/audit-log', icon: 'audit', roles: ['admin'] },
      { id: 'notify', name: 'Notify', href: '/fleet/notifications', icon: 'bell', roles: ['admin'] },
      { id: 'permissions', name: 'Permissions', href: '/fleet/permissions', icon: 'doc', roles: ['admin'] },
      { id: 'integrations', name: 'Integrations', href: '/fleet/integrations', icon: 'plug', roles: ['admin'] },
      { id: 'settings', name: 'Settings', href: '/fleet/settings', icon: 'adjust', roles: ['admin'] },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'billing', name: 'Billing & plan', href: '/fleet/billing', icon: 'settle', roles: ['admin'] },
      { id: 'profile-admin', name: 'My Profile', href: '/fleet/profile', icon: 'driver', roles: ['admin'] },
      { id: 'profile-staff', name: 'My Profile', href: '/staff/profile', icon: 'driver', roles: ['staff'] },
    ],
  },
];

const DRIVER_NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ id: 'dashboard', name: 'Dashboard', href: '/driver', icon: 'dashboard' }] },
  {
    label: 'Work',
    items: [
      { id: 'go-online', name: 'Start Shift', href: '/driver/go-online', icon: 'shift' },
      { id: 'shifts', name: 'My Shifts', href: '/driver/shifts', icon: 'audit' },
      { id: 'vehicles', name: 'Vehicles', href: '/driver/vehicles', icon: 'vehicle' },
      { id: 'roster', name: 'My Roster', href: '/driver/roster', icon: 'roster' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { id: 'earnings', name: 'My Earnings', href: '/driver/earnings', icon: 'chart' },
      { id: 'settlements', name: 'Settlements', href: '/driver/settlements', icon: 'settle' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'notifications', name: 'Notifications', href: '/driver/notifications', icon: 'bell' },
      { id: 'profile', name: 'My Profile', href: '/driver/profile', icon: 'driver' },
    ],
  },
];

const BOTTOM_TABS: { name: string; href: string; icon: string }[] = [
  { name: 'Home', href: '/fleet', icon: 'dashboard' },
  { name: 'Drivers', href: '/fleet/drivers', icon: 'driver' },
  { name: 'Vehicles', href: '/fleet/vehicles', icon: 'vehicle' },
  { name: 'Shifts', href: '/fleet/shifts', icon: 'shift' },
];

// Two tabs each side of the centre Go-online button (+ "More"), so it sits
// exactly in the middle. Earnings stays reachable via More and the dashboard.
const DRIVER_BOTTOM_TABS: { name: string; href: string; icon: string }[] = [
  { name: 'Home', href: '/driver', icon: 'dashboard' },
  { name: 'Shifts', href: '/driver/shifts', icon: 'shift' },
  { name: 'Roster', href: '/driver/roster', icon: 'roster' },
];

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
}

export default function FleetSidebar({ user, variant = 'fleet', isMobile, open, onClose, onMenuToggle }: FleetSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logoUrl } = useBranding();
  const enabledModules = useEnabledModules();

  const isDriver = variant === 'driver';
  const rootHref = isDriver ? '/driver' : '/fleet';
  const navGroups = isDriver ? DRIVER_NAV_GROUPS : NAV_GROUPS;
  const bottomTabs = isDriver ? DRIVER_BOTTOM_TABS : BOTTOM_TABS;

  const canSee = (item: NavItem) => {
    // Module gate (fleet nav only): hide items whose module the fleet switched
    // off. Driver nav is never module-gated — a driver's own pages stay put.
    if (!isDriver) {
      const moduleKey = moduleForNav(item.id);
      if (moduleKey && !enabledModules.has(moduleKey)) return false;
    }
    // Role gate.
    if (!item.roles) return true;
    if (!user?.role) return false;
    if (user.role === 'driver' && user.also_staff && item.roles.includes('staff')) return true;
    return item.roles.includes(user.role);
  };

  const isActive = (href: string) =>
    pathname === href || (href !== rootHref && pathname.startsWith(href));

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const initial =
    user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?';
  const roleLabel =
    user?.also_staff && user?.role === 'driver' ? 'Staff' : user?.role || 'Member';

  const body = (
    <>
      <div style={s.logoWrap}>
        {logoUrl ? (
          // Custom fleet logo (set in Settings → Branding).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={user?.organization_name || 'Fleet logo'} style={s.logoImg} />
        ) : (
          <>
            <div style={s.logo}>
              {/* Icon-only Rovora mark (no wordmark) — the org name sits beside it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="Rovora" style={{ height: 30, width: 'auto' }} />
            </div>
            <div style={s.companyTag}>
              <div style={s.companyName}>{user?.organization_name || 'Rovora'}</div>
              <div style={s.companyMeta}>{isDriver ? 'Driver' : 'Fleet ops'}</div>
            </div>
          </>
        )}
      </div>

      <nav style={s.nav}>
        {navGroups.map((g, gi) => {
          const items = g.items.filter(canSee);
          if (!items.length) return null;
          return (
            <div key={gi} style={{ marginBottom: 14 }}>
              {g.label && <div style={s.navLabel}>{g.label}</div>}
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onClose}
                    data-tour={`nav-${item.id}`}
                    className={`fleetNavItem${active ? ' fleetNavItemActive' : ''}`}
                    style={{ ...s.navItem, ...(active ? s.navItemActive : {}), textDecoration: 'none' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11, color: active ? 'var(--accent)' : 'var(--text-2)' }}>
                      <FleetIcon name={item.icon} size={17} stroke={1.6} />
                      <span style={{ color: active ? 'var(--text-1)' : 'var(--text-2)', fontWeight: active ? 500 : 400 }}>
                        {item.name}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!isDriver && (
        <button
          onClick={() => {
            onClose();
            window.dispatchEvent(new Event('rovora:start-tour'));
          }}
          className="fleetNavItem"
          style={{ ...s.navItem, margin: '0 10px 2px', width: 'auto', cursor: 'pointer' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'var(--text-2)' }}>
            <FleetIcon name="doc" size={17} stroke={1.6} />
            <span>Help &amp; tour</span>
          </span>
        </button>
      )}

      {user?.also_staff && user?.role === 'driver' && (
        <Link
          href={isDriver ? '/fleet' : '/driver'}
          onClick={onClose}
          className="fleetNavItem"
          style={{ ...s.navItem, margin: '0 10px 6px', width: 'auto', textDecoration: 'none' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'var(--text-2)' }}>
            <FleetIcon name="logout" size={17} stroke={1.6} />
            <span>{isDriver ? 'Switch to Fleet View' : 'Switch to Driver View'}</span>
          </span>
        </Link>
      )}

      <div style={s.userCard}>
        <div style={s.userAvatar}>{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.full_name || user?.email || 'User'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {roleLabel} · {user?.email}
          </div>
        </div>
        <button style={s.iconBtn} title="Sign out" onClick={handleLogout} className="fleetHover">
          <FleetIcon name="logout" size={15} />
        </button>
      </div>
    </>
  );

  const renderBottomTab = (tab: { name: string; href: string; icon: string }) => {
    const active = isActive(tab.href);
    return (
      <Link key={tab.href} href={tab.href} style={{ ...s.bottomTab, ...(active ? s.bottomTabActive : {}) }}>
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
          <button onClick={onMenuToggle} style={{ ...s.bottomTab, ...(open ? s.bottomTabActive : {}) }} className="fleetHover">
            <FleetIcon name="dots" size={20} stroke={1.6} />
            <span style={{ fontSize: 10.5, marginTop: 2 }}>More</span>
          </button>
        </nav>
      </>
    );
  }

  return <aside style={s.sidebar}>{body}</aside>;
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
  },
  sidebarMobile: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    minHeight: 'auto',
    height: '100vh',
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
    height: 60,
    background: 'var(--bg-1)',
    borderTop: '1px solid var(--line-1)',
    display: 'flex',
    zIndex: 30,
    paddingBottom: 'env(safe-area-inset-bottom, 0)',
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
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px', borderBottom: '1px solid var(--line-1)', minHeight: 61 },
  logo: { color: 'var(--text-1)', display: 'flex', alignItems: 'center' },
  logoImg: { maxWidth: '100%', maxHeight: 36, objectFit: 'contain' },
  companyTag: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  companyName: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 },
  companyMeta: { fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 },
  nav: { flex: 1, overflowY: 'auto', padding: '14px 10px' },
  navLabel: { fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '8px 10px 4px' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 7,
    color: 'var(--text-2)',
    fontSize: 13.5,
    textAlign: 'left',
    transition: 'background 140ms ease, transform 140ms ease, box-shadow 140ms ease',
    marginBottom: 1,
    fontFamily: 'inherit',
  },
  navItemActive: { background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  userCard: {
    margin: '8px 10px 12px',
    padding: '10px',
    background: 'var(--bg-2)',
    border: '1px solid var(--line-1)',
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 7,
    background: 'linear-gradient(135deg, #2bbd7e, #3b6ad9)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13.5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtn: { width: 28, height: 28, background: 'transparent', border: 'none', color: 'var(--text-3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};
