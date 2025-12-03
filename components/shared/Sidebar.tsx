'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SessionUser } from '@/lib/types/database';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: ('admin' | 'staff' | 'driver')[];
}

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { label: 'Drivers', href: '/admin/drivers', icon: '👤' },
  { label: 'Vehicles', href: '/admin/vehicles', icon: '🚗' },
  { label: 'Shifts', href: '/admin/shifts', icon: '📋' },
  { label: 'Earnings', href: '/admin/earnings', icon: '💰', roles: ['admin'] },
  { label: 'Notifications', href: '/admin/notifications', icon: '🔔', roles: ['admin'] },
  { label: 'Events', href: '/admin/events', icon: '📅' },
];

const driverNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/driver', icon: '📊' },
  { label: 'Go Online', href: '/driver/go-online', icon: '🟢' },
  { label: 'My Shifts', href: '/driver/shifts', icon: '📋' },
  { label: 'My Profile', href: '/driver/profile', icon: '👤' },
  { label: 'My Earnings', href: '/driver/earnings', icon: '💰' },
  { label: 'Notifications', href: '/driver/notifications', icon: '🔔' },
];

interface SidebarProps {
  user: SessionUser;
  variant: 'admin' | 'driver';
}

export default function Sidebar({ user, variant }: SidebarProps) {
  const pathname = usePathname();
  const navItems = variant === 'admin' ? adminNavItems : driverNavItems;

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(user.role);
  });

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🚕</span>
        <span className={styles.logoText}>SPOT</span>
      </div>

      <nav className={styles.nav}>
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/admin' && item.href !== '/driver' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.userInfo}>
        <div className={styles.userAvatar}>
          {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userDetails}>
          <span className={styles.userName}>{user.full_name || user.email}</span>
          <span className={styles.userRole}>{user.role}</span>
        </div>
      </div>
    </aside>
  );
}
