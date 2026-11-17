'use client';

import { useFleetTheme, type FleetThemeChoice } from '@/components/fleet/FleetThemeRoot';
import { SETTINGS } from '@/lib/settings/catalog';
import { CatalogSection } from './CatalogSettings';
import { SettingsSection, type Notify } from './SettingsParts';
import styles from './settings.module.css';

const THEME = SETTINGS['appearance.theme'];

/**
 * Settings → Preferences: personal choices that only affect the person signed
 * in (unlike every other tab, which changes the whole fleet). Saved to their
 * account. Only the Appearance section is drawn here (the theme card applies
 * instantly); the settings page adds every other preference from
 * lib/settings/catalog.ts.
 */
export default function PreferencesSettings({ isAdmin, notify }: { isAdmin: boolean; notify: Notify }) {
  const { choice, setChoice } = useFleetTheme();

  return (
    <>
      <SettingsSection title="Appearance" description="These only change Rovora for you — not for the rest of your team.">
        <div className={styles.settingCard}>
          <div className={styles.settingIcon} aria-hidden>{THEME.icon}</div>
          <div className={styles.settingContent}>
            <div className={styles.settingLabel}>{THEME.label}</div>
            <div className={styles.settingDescription}>{THEME.description}</div>
          </div>
          <div className={styles.settingAction}>
            <div className={styles.segmented} role="radiogroup" aria-label={THEME.label}>
              {THEME.options.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={choice === t.value}
                  data-active={choice === t.value ? 'true' : undefined}
                  className={styles.segment}
                  onClick={() => { if (choice !== t.value) setChoice(t.value as FleetThemeChoice); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <CatalogSection tab="preferences" section="Appearance" isAdmin={isAdmin} notify={notify} />
      </SettingsSection>
    </>
  );
}
