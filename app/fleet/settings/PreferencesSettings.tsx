'use client';

import { useFleetTheme } from '@/components/fleet/FleetThemeRoot';
import { SettingsSection } from './SettingsParts';
import styles from './settings.module.css';

const THEMES = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
] as const;

/**
 * Settings → Preferences: personal choices that only affect the person signed
 * in (unlike every other tab, which changes the whole fleet).
 */
export default function PreferencesSettings() {
  const { theme, toggleTheme } = useFleetTheme();

  return (
    <SettingsSection title="Appearance" description="Only changes Rovora for you, on this device — not for the rest of your team.">
      <div className={styles.settingCard}>
        <div className={styles.settingIcon} aria-hidden>🌓</div>
        <div className={styles.settingContent}>
          <div className={styles.settingLabel}>Theme</div>
          <div className={styles.settingDescription}>Switch the dashboard between dark and light mode.</div>
        </div>
        <div className={styles.settingAction}>
          <div className={styles.segmented} role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={theme === t.key}
                data-active={theme === t.key ? 'true' : undefined}
                className={styles.segment}
                onClick={() => { if (theme !== t.key) toggleTheme(); }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
