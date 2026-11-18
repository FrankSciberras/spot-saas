'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { useEnabledModules } from '@/components/fleet/FleetModulesProvider';
import { SessionUser } from '@/lib/types/database';
import { settingsForTab } from '@/lib/settings/catalog';
import { SETTINGS_TABS, type SettingsTabKey } from '@/lib/settings/types';
import { safeReturnPath, settingsHref } from '@/lib/settings/pages';
import FleetBackLink from '@/components/fleet/FleetBackLink';
import { fleetPageName } from '@/components/fleet/navConfig';
import CatalogSettings from './CatalogSettings';
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
// The tab list lives in lib/settings/types.ts; the settings on each tab come
// from hand-written panels below plus lib/settings/catalog.ts.
// =============================================================================

type TabKey = SettingsTabKey;

/**
 * Hand-written panels. Tabs not listed here (Documents, Maintenance) are
 * drawn entirely from lib/settings/catalog.ts; every tab also
 * gets the catalog settings filed under it, below its own panel.
 */
type PanelProps = { notify: Notify; isAdmin: boolean };

const SettlementsPanel = () => (
  <SettingsSection title="Settlement rules" description="How driver earnings are split and settled each week.">
    <LinkCard
      icon="🧾"
      label="Revenue split, tax and rent presets"
      description="Create presets for how each driver’s revenue is split, taxed and charged rent, pick the fleet default, assign presets to drivers and set up recurring adjustments."
      href="/fleet/settlements/settings"
      cta="Open settlement rules"
    />
  </SettingsSection>
);

const PANELS: Partial<Record<TabKey, { Panel: ComponentType<PanelProps>; catalogFirst?: boolean; ownSections?: string[] }>> = {
  general: { Panel: FleetDetailsSettings },
  branding: { Panel: BrandingSettings },
  'live-map': { Panel: LiveMapSettings },
  // Starting / ending a shift (catalog) read best above the forgotten-shift check.
  shifts: { Panel: ShiftSettings, catalogFirst: true, ownSections: ['Forgotten shifts'] },
  messages: { Panel: MessagesSettings },
  notifications: { Panel: NotificationSettings },
  settlements: { Panel: SettlementsPanel },
  preferences: { Panel: PreferencesSettings, ownSections: ['Appearance'] },
};

/** Tab link; keeps ?from= so "Back to …" survives switching tabs. */
const hrefFor = (key: TabKey, first: TabKey, from: string | null) =>
  key === first && !from ? '/fleet/settings' : settingsHref(key, from);

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
  const hasCatalog = (key: TabKey) =>
    settingsForTab(key).some(({ def }) => !def.ownPanel && (def.scope === 'user' || isAdmin) && (!def.module || enabledModules.has(def.module)));
  const tabs = SETTINGS_TABS.filter(
    (t) =>
      (isAdmin || ('everyone' in t && t.everyone)) &&
      (!('module' in t) || enabledModules.has(t.module)) &&
      (PANELS[t.key] || hasCatalog(t.key))
  );
  const first = tabs[0].key;
  const requested = searchParams.get('tab');
  const active: TabKey = tabs.find((t) => t.key === requested)?.key ?? first;
  // Came here from a page's gear (lib/settings/pages.ts): offer the way back.
  const from = safeReturnPath(searchParams.get('from'));
  const fromName = from ? fleetPageName(from) : null;
  const panel = PANELS[active];
  const Panel = panel?.Panel;
  const catalog = <CatalogSettings tab={active} isAdmin={isAdmin} notify={notify} skipSections={panel?.ownSections} />;

  return (
    <FleetShell user={user} title="Settings">
      <div className={styles.container}>
        {from && <FleetBackLink href={from} label={`Back to ${fromName ?? 'previous page'}`} />}
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
              href={hrefFor(t.key, first, from)}
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
          {panel?.catalogFirst && catalog}
          {Panel && <Panel notify={notify} isAdmin={isAdmin} />}
          {!panel?.catalogFirst && catalog}
        </div>
      </div>
    </FleetShell>
  );
}
