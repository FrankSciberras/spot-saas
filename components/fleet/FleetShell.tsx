'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '@/lib/types/database';
import FleetSidebar from './FleetSidebar';
import FleetTopbar from './FleetTopbar';
import FleetTour from './FleetTour';
import FleetCommandPalette from './FleetCommandPalette';
import AssistantPanel from '@/components/assistant/AssistantPanel';
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
  // null = this browser has never chosen, so the width decides (see below).
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(null);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sidebar collapse persists per browser. Read after mount so SSR markup matches.
  useEffect(() => {
    const saved = localStorage.getItem('rovora-sidebar-collapsed');
    setCollapsedPref(saved === '1' ? true : saved === '0' ? false : null);
  }, []);

  // Matches the 720px breakpoint in fleet-theme.css (`max-width: 720px`).
  const isMobile = vw <= 720;
  // On a tablet the full 232px sidebar leaves the page barely 500px wide, so
  // it starts as the icon rail there until the person expands it themselves.
  const isTablet = !isMobile && vw < 1100;
  const collapsed = collapsedPref ?? isTablet;

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    localStorage.setItem('rovora-sidebar-collapsed', next ? '1' : '0');
    setCollapsedPref(next);
  }, [collapsed]);

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

  // While the drawer is open the page behind it must not scroll — otherwise a
  // swipe inside the menu drags the page instead of the menu.
  useEffect(() => {
    if (!(isMobile && menuOpen)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, menuOpen]);

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
      {/* No z-index here on purpose. A z-index made <main> its own stacking
          layer, which trapped every dialog, sheet and floating button inside
          it UNDER the phone's bottom tab bar — the Save button of "Add
          expense" sat hidden behind the tabs. Without it, their own z-indexes
          (200–1000) apply against the whole page, as they were written to. */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', paddingBottom: isMobile ? 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px))' : 0 }}>
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
      {/* Rovora AI — renders nothing unless switched on for this fleet. */}
      {variant === 'fleet' && <AssistantPanel />}
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
