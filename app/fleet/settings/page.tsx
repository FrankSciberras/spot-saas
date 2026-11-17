'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { useEnabledModules } from '@/components/fleet/FleetModulesProvider';
import { SessionUser } from '@/lib/types/database';
import BrandingSettings from './BrandingSettings';
import FleetDetailsSettings from './FleetDetailsSettings';
import LiveMapSettings from './LiveMapSettings';
import ShiftSettings from './ShiftSettings';
import MessagesSettings from './MessagesSettings';
import NotificationSettings from './NotificationSettings';
import PreferencesSettings from './PreferencesSettings';
import { LinkCard, SettingsSection, type Notify } from './SettingsParts';
import styles from './settings.module.css';

// =============================================================================
// SETTINGS — one tab per part of Rovora. The active tab lives in ?tab= so other
// pages can deep-link straight to their settings (e.g. /fleet/settings?tab=live-map).
// Tabs tied to a module hide when the fleet has that module switched off, the
// same way the sidebar does. Everything but Preferences is admin-only.
// =============================================================================

type TabKey = 'general' | 'branding' | 'live-map' | 'shifts' | 'messages' | 'notifications' | 'settlements' | 'preferences';

interface TabDef {
  key: TabKey;
  label: string;
  /** Fleet module that has to be on for the tab to show. */
  module?: string;
  /** Visible to non-admins too (personal settings). */
  everyone?: boolean;
}

const TABS: TabDef[] = [
  { key: 'general', label: 'General' },
  { key: 'branding', label: 'Branding' },
  { key: 'live-map', label: 'Live Map', module: 'tracking' },
  { key: 'shifts', label: 'Shifts' },
  { key: 'messages', label: 'Messages', module: 'messaging' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'settlements', label: 'Settlements', module: 'settlements' },
  { key: 'preferences', label: 'Preferences', everyone: true },
];

const hrefFor = (key: TabKey, first: TabKey) => (key === first ? '/fleet/settings' : `/fleet/settings?tab=${key}`);

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading user={null} />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsLoading({ user }: { user: SessionUser | null }) {
  return (
    <FleetShell user={user as SessionUser} title="Settings">
      <FleetPageSkeleton variant="form" />
    </FleetShell>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const enabledModules = useEnabledModules();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/auth/user')
      .then((r) => r.json())
      .then(setUser)
      .catch(() => setMessage({ type: 'error', text: 'Failed to load settings' }));
  }, []);

  // Stable so the tab panels can list it as an effect dependency.
  const notify: Notify = useCallback((type, text) => {
    setMessage({ type, text });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), 4000);
  }, []);

  if (!user) return <SettingsLoading user={user} />;

  const isAdmin = user.role === 'admin';
  const tabs = TABS.filter((t) => (isAdmin || t.everyone) && (!t.module || enabledModules.has(t.module)));
  const first = tabs[0].key;
  const requested = searchParams.get('tab');
  const active: TabKey = tabs.find((t) => t.key === requested)?.key ?? first;

  return (
    <FleetShell user={user} title="Settings">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Admin / Settings</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Settings</h1>
            </div>
            <p className={styles.subtitle}>Your fleet’s details, branding and how each part of Rovora works for your team</p>
          </div>
        </div>

        <nav className={styles.tabs} aria-label="Settings sections">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={hrefFor(t.key, first)}
              className={styles.tab}
              data-active={active === t.key ? 'true' : undefined}
              aria-current={active === t.key ? 'page' : undefined}
              scroll={false}
              replace
              // A banner from the last tab shouldn't follow you to the next one.
              onClick={() => setMessage(null)}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {message && (
          <div className={`${styles.message} ${styles[message.type]}`} role="status">
            {message.text}
          </div>
        )}

        <div className={styles.panel} key={active}>
          {active === 'general' && <FleetDetailsSettings />}
          {active === 'branding' && <BrandingSettings />}
          {active === 'live-map' && <LiveMapSettings notify={notify} />}
          {active === 'shifts' && <ShiftSettings notify={notify} />}
          {active === 'messages' && <MessagesSettings notify={notify} />}
          {active === 'notifications' && <NotificationSettings notify={notify} />}
          {active === 'settlements' && (
            <SettingsSection title="Settlement rules" description="How driver earnings are split and settled each week.">
              <LinkCard
                icon="🧾"
                label="Revenue split, tax and rent presets"
                description="Create presets for how each driver’s revenue is split, taxed and charged rent, pick the fleet default, assign presets to drivers and set up recurring adjustments."
                href="/fleet/settlements/settings"
                cta="Open settlement rules"
              />
            </SettingsSection>
          )}
          {active === 'preferences' && <PreferencesSettings />}
        </div>
      </div>
    </FleetShell>
  );
}
