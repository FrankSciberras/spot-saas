'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '@/lib/types/database';
import FleetSidebar from './FleetSidebar';
import FleetTopbar from './FleetTopbar';
import FleetTour from './FleetTour';
import FleetCommandPalette from './FleetCommandPalette';
import FleetTrialBanner from '@/components/shared/FleetTrialBanner';
import PushNotificationPrompt from '@/components/shared/PushNotificationPrompt';
import InstallPrompt from '@/components/shared/InstallPrompt';

interface FleetShellProps {
  user: SessionUser;
  title: string;
  children: ReactNode;
  /** 'fleet' (default) = operator dashboard; 'driver' = driver dashboard. */
  variant?: 'fleet' | 'driver';
}

/** Standalone-design shell (sidebar + topbar) used by converted /fleet and /driver pages. */
export default function FleetShell({ user, title, children, variant = 'fleet' }: FleetShellProps) {
  const [vw, setVw] = useState(1280);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sidebar collapse persists per browser. Read after mount so SSR markup matches.
  useEffect(() => {
    setCollapsed(localStorage.getItem('rovora-sidebar-collapsed') === '1');
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem('rovora-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }, []);

  // "[" toggles the sidebar, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      toggleCollapsed();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const isMobile = vw < 720;

  return (
    <div className="fleetCanvas">
      <FleetSidebar
        user={user}
        variant={variant}
        isMobile={isMobile}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onMenuToggle={() => setMenuOpen((o) => !o)}
        collapsed={!isMobile && collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      {/* The bottom nav pads itself past the iPhone home indicator, so the
          content above it has to clear the nav AND that same inset. */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, paddingBottom: isMobile ? 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px))' : 0 }}>
        {variant === 'fleet' && <FleetTrialBanner />}
        <FleetTopbar
          title={title}
          variant={variant}
          onMenuClick={() => setMenuOpen((o) => !o)}
          isAdmin={user?.role === 'admin'}
          user={user}
          isMobile={isMobile}
        />
        <div style={{ padding: '22px 24px 32px' }} className="pad-mobile">
          {children}
        </div>
      </main>
      <FleetCommandPalette user={user} variant={variant} />
      {user?.role && <PushNotificationPrompt variant={variant === 'driver' ? 'driver' : 'admin'} role={user.role} />}
      {/* Home-screen install nudge. Self-hiding when already installed, and
          re-openable from the account menu after it's been dismissed. */}
      <InstallPrompt />
      {variant === 'fleet' && (
        <FleetTour userId={user?.id} role={user?.role} tourCompleted={user?.fleet_tour_completed} />
      )}
    </div>
  );
}
