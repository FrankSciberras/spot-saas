'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types/database';
import { useBranding } from '@/components/shared/BrandingProvider';
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
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { id: 'services', name: 'Services', href: '/fleet/services', icon: 'wrench' },
      { id: 'damages', name: 'Damages', href: '/fleet/damages', icon: 'damage' },
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
      { id: 'events', name: 'Events', href: '/fleet/events', icon: 'roster' },
      { id: 'notify', name: 'Notify', href: '/fleet/notifications', icon: 'bell', roles: ['admin'] },
      { id: 'permissions', name: 'Permissions', href: '/fleet/permissions', icon: 'doc', roles: ['admin'] },
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

const BOTTOM_TABS: { name: string; href: string; icon: string }[] = [
  { name: 'Home', href: '/fleet', icon: 'dashboard' },
  { name: 'Drivers', href: '/fleet/drivers', icon: 'driver' },
  { name: 'Vehicles', href: '/fleet/vehicles', icon: 'vehicle' },
  { name: 'Shifts', href: '/fleet/shifts', icon: 'shift' },
];

interface FleetSidebarProps {
  user: SessionUser;
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  onMenuToggle: () => void;
}

export default function FleetSidebar({ user, isMobile, open, onClose, onMenuToggle }: FleetSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logoUrl } = useBranding();

  const canSee = (item: NavItem) => {
    if (!item.roles) return true;
    if (!user?.role) return false;
    if (user.role === 'driver' && user.also_staff && item.roles.includes('staff')) return true;
    return item.roles.includes(user.role);
  };

  const isActive = (href: string) =>
    pathname === href || (href !== '/fleet' && pathname.startsWith(href));

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
              <img src="/logo without text.png" alt="Rovora" style={{ height: 30, width: 'auto' }} />
            </div>
            <div style={s.companyTag}>
              <div style={s.companyName}>{user?.organization_name || 'Rovora'}</div>
              <div style={s.companyMeta}>Fleet ops</div>
            </div>
          </>
        )}
      </div>

      <nav style={s.nav}>
        {NAV_GROUPS.map((g, gi) => {
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

  if (isMobile) {
    return (
      <>
        {open && <div style={s.scrim} onClick={onClose} />}
        <aside style={{ ...s.sidebar, ...s.sidebarMobile, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
          {body}
        </aside>
        <nav style={s.bottomBar}>
          {BOTTOM_TABS.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link key={tab.href} href={tab.href} style={{ ...s.bottomTab, ...(active ? s.bottomTabActive : {}) }}>
                <FleetIcon name={tab.icon} size={20} stroke={active ? 1.9 : 1.6} />
                <span style={{ fontSize: 10.5, marginTop: 2 }}>{tab.name}</span>
              </Link>
            );
          })}
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
