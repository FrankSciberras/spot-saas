"use client";

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { SessionUser } from '@/lib/types/database';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  href: string;
  section?: string;
  icon: ReactNode;
  roles?: ('admin' | 'staff' | 'driver')[];
}

 interface NavSection {
  title: string;
  items: NavItem[];
 }

 function groupNavItems(items: NavItem[], preferredOrder: string[]): NavSection[] {
  const groups = new Map<string, NavItem[]>();
  const discoveredOrder: string[] = [];

  for (const item of items) {
    const sectionTitle = item.section || 'General';
    if (!groups.has(sectionTitle)) {
      groups.set(sectionTitle, []);
      discoveredOrder.push(sectionTitle);
    }
    groups.get(sectionTitle)!.push(item);
  }

  const orderedTitles = [
    ...preferredOrder.filter((title) => groups.has(title)),
    ...discoveredOrder.filter((title) => !preferredOrder.includes(title)),
  ];

  return orderedTitles.map((title) => ({ title, items: groups.get(title)! }));
 }

const DashboardIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="2.5" />
    <rect x="14" y="3" width="7" height="5" rx="2.5" />
    <rect x="14" y="11" width="7" height="10" rx="2.5" />
    <rect x="3" y="13" width="7" height="7" rx="2.5" />
  </svg>
);

const UserIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5C6.4 16.4 8.8 15 12 15s5.6 1.4 7 4.5" />
  </svg>
);

const VehicleIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="8" width="18" height="7" rx="2.5" />
    <circle cx="8" cy="17" r="1.6" />
    <circle cx="16" cy="17" r="1.6" />
  </svg>
);

const ListIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="5" width="4" height="4" rx="1.5" />
    <rect x="3" y="10" width="4" height="4" rx="1.5" />
    <rect x="3" y="15" width="4" height="4" rx="1.5" />
    <path d="M11 7h9M11 12h9M11 17h7" />
  </svg>
);

const MoneyIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="6" width="16" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.3" />
    <path d="M7.5 9.5h1.5M15 14.5h1.5" />
  </svg>
);

const BellIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 10a6 6 0 0 1 12 0c0 3 1.2 4.5 1.8 5.2A1 1 0 0 1 19 17H5a1 1 0 0 1-.8-1.8C4.8 14.5 6 13 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

const CalendarIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M9 3v4M15 3v4M4 10h16" />
  </svg>
);

const StatsIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 20V10M12 20V4M6 20v-6" />
  </svg>
);

const RosterIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 4v6M15 4v6" />
  </svg>
);

const ServiceIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const DamagesIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const SettlementIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 14l6-6" />
    <path d="M9.5 8.5h.01M14.5 13.5h.01" />
    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
  </svg>
);

const SettingsIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

const StaffIcon = () => (
  <svg
    className={styles.navIcon}
    viewBox="0 0 24 24"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const adminNavItems: NavItem[] = [
  // Overview
  { label: 'Dashboard', href: '/admin', section: 'Overview', icon: <DashboardIcon /> },
  // Operations
  { label: 'Staff', href: '/admin/staff', section: 'Operations', icon: <StaffIcon />, roles: ['admin'] },
  { label: 'Drivers', href: '/admin/drivers', section: 'Operations', icon: <UserIcon /> },
  { label: 'Vehicles', href: '/admin/vehicles', section: 'Operations', icon: <VehicleIcon /> },
  { label: 'Rosters', href: '/admin/rosters', section: 'Operations', icon: <RosterIcon /> },
  { label: 'Shifts', href: '/admin/shifts', section: 'Operations', icon: <ListIcon /> },
  // Maintenance
  { label: 'Services', href: '/admin/services', section: 'Maintenance', icon: <ServiceIcon /> },
  { label: 'Damages', href: '/admin/damages', section: 'Maintenance', icon: <DamagesIcon /> },
  // Financial
  { label: 'Bookkeeping', href: '/admin/earnings', section: 'Financial', icon: <MoneyIcon />, roles: ['admin'] },
  { label: 'Financials', href: '/admin/financials', section: 'Financial', icon: <StatsIcon />, roles: ['admin'] },
  { label: 'Settlements', href: '/admin/settlements', section: 'Financial', icon: <SettlementIcon />, roles: ['admin'] },
  { label: 'Adjustments', href: '/admin/adjustments', section: 'Financial', icon: <MoneyIcon />, roles: ['admin'] },
  // Admin
  { label: 'Events', href: '/admin/events', section: 'Admin', icon: <CalendarIcon /> },
  { label: 'Notify', href: '/admin/notifications', section: 'Admin', icon: <BellIcon />, roles: ['admin'] },
  { label: 'Permissions', href: '/admin/permissions', section: 'Admin', icon: <ShieldIcon />, roles: ['admin'] },
  { label: 'Settings', href: '/admin/settings', section: 'Admin', icon: <SettingsIcon />, roles: ['admin'] },
  // Profile
  { label: 'My Profile', href: '/admin/profile', section: 'Profile', icon: <UserIcon />, roles: ['admin'] },
  { label: 'My Profile', href: '/staff/profile', section: 'Profile', icon: <UserIcon />, roles: ['staff'] },
];

const driverNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/driver', section: 'Overview', icon: <DashboardIcon /> },
  { label: 'Go Online', href: '/driver/go-online', section: 'Work', icon: <ListIcon /> },
  { label: 'My Shifts', href: '/driver/shifts', section: 'Work', icon: <ListIcon /> },
  { label: 'Vehicles', href: '/driver/vehicles', section: 'Work', icon: <VehicleIcon /> },
  { label: 'My Roster', href: '/driver/roster', section: 'Work', icon: <RosterIcon /> },
  { label: 'My Earnings', href: '/driver/earnings', section: 'Financial', icon: <MoneyIcon /> },
  { label: 'Settlements', href: '/driver/settlements', section: 'Financial', icon: <SettlementIcon /> },
  { label: 'Notifications', href: '/driver/notifications', section: 'Updates', icon: <BellIcon /> },
  { label: 'My Profile', href: '/driver/profile', section: 'Profile', icon: <UserIcon /> },
];

interface SidebarProps {
  user: SessionUser;
  variant: 'admin' | 'driver';
}

export default function Sidebar({ user, variant }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const navItems = variant === 'admin' ? adminNavItems : driverNavItems;

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    if (!user?.role) return false;
    return item.roles.includes(user.role);
  });

  const navSections = groupNavItems(
    filteredNavItems,
    variant === 'admin'
      ? ['Overview', 'Operations', 'Maintenance', 'Financial', 'Admin', 'Profile', 'General']
      : ['Overview', 'Work', 'Financial', 'Updates', 'Profile', 'General']
  );

  // Close sidebar on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Map of nav items to their tour IDs
  const tourIds: Record<string, string> = {
    '/driver/roster': 'roster-link',
    '/driver/go-online': 'go-online-link',
    '/driver/profile': 'profile-link',
  };

  return (
    <>
    {/* Mobile overlay */}
    <div 
      className={`${styles.overlay} ${isOpen ? styles.visible : ''}`}
      onClick={() => setIsOpen(false)}
    />
    
    {/* Mobile toggle button */}
    <button 
      className={styles.mobileToggle}
      onClick={() => setIsOpen(!isOpen)}
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
    >
      {isOpen ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>

    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`} data-tour="sidebar">
      <div className={styles.logo}>
        <Image
          src="/Black Logo.svg"
          alt="Spot dashboard logo"
          className={styles.logoImage}
          width={98}
          height={28}
          style={{ width: 'auto', height: 'auto' }}
          priority
        />
      </div>

      <nav className={styles.nav}>
        {navSections.map((section) => (
          <div key={section.title} className={styles.navSection}>
            <div className={styles.navSectionTitle}>{section.title}</div>
            {section.items.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && item.href !== '/driver' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  data-tour={tourIds[item.href]}
                >
                  {item.icon}
                  <span className={styles.navLabel}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {user && (
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>
            {user.full_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>{user.full_name || user.email || 'User'}</span>
            <span className={styles.userRole}>{user.role || 'Loading...'}</span>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}
