'use client';

import { type ReactNode, useEffect, useState } from 'react';
import type { SessionUser } from '@/lib/types/database';
import FleetSidebar from './FleetSidebar';
import FleetTopbar from './FleetTopbar';
import FleetTour from './FleetTour';
import FleetTrialBanner from '@/components/shared/FleetTrialBanner';
import PushNotificationPrompt from '@/components/shared/PushNotificationPrompt';

interface FleetShellProps {
  user: SessionUser;
  title: string;
  children: ReactNode;
}

/** Standalone-design shell (sidebar + topbar) used by converted /fleet pages. */
export default function FleetShell({ user, title, children }: FleetShellProps) {
  const [vw, setVw] = useState(1280);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = vw < 720;

  return (
    <div className="fleetCanvas">
      <FleetSidebar
        user={user}
        isMobile={isMobile}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onMenuToggle={() => setMenuOpen((o) => !o)}
      />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, paddingBottom: isMobile ? 'var(--bottom-nav-h)' : 0 }}>
        <FleetTrialBanner />
        <FleetTopbar title={title} onMenuClick={() => setMenuOpen((o) => !o)} isAdmin={user?.role === 'admin'} />
        <div style={{ padding: '22px 24px 32px' }} className="pad-mobile">
          {children}
        </div>
      </main>
      {user?.role && <PushNotificationPrompt variant="admin" role={user.role} />}
      <FleetTour userId={user?.id} role={user?.role} tourCompleted={user?.fleet_tour_completed} />
    </div>
  );
}
