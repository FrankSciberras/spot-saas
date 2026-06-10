'use client';

import { useState, useEffect } from 'react';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { SessionUser } from '@/lib/types/database';
import BrandingSettings from './BrandingSettings';
import styles from './settings.module.css';

interface AppSetting {
  key: string;
  value: boolean;
  description: string | null;
  updated_at: string;
}

const SETTING_INFO: Record<string, { label: string; icon: string }> = {
  package_update_check_enabled: {
    label: 'Weekly Package Update Check',
    icon: '📦',
  },
};

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [driverPushPrompt, setDriverPushPrompt] = useState<boolean | null>(null);
  const [savingDriverPush, setSavingDriverPush] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await fetch('/api/auth/user');
      const userData = await userRes.json();
      setUser(userData);

      const settingsRes = await fetch('/api/admin/settings');
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
      }

      const pushRes = await fetch('/api/fleet/driver-push-prompt');
      if (pushRes.ok) {
        const pushData = await pushRes.json();
        setDriverPushPrompt(pushData.prompt_drivers_push !== false);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showMessage('error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleDriverPushPrompt = async () => {
    if (driverPushPrompt === null) return;
    const next = !driverPushPrompt;
    setSavingDriverPush(true);
    try {
      const res = await fetch('/api/fleet/driver-push-prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDriverPushPrompt(updated.prompt_drivers_push !== false);
        showMessage('success', `Setting updated successfully`);
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Error updating driver push prompt setting:', error);
      showMessage('error', 'Failed to update setting');
    } finally {
      setSavingDriverPush(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const toggleSetting = async (key: string, currentValue: boolean) => {
    setSaving(key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: !currentValue }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSettings((prev) =>
          prev.map((s) => (s.key === key ? { ...s, value: updated.value, updated_at: updated.updated_at } : s))
        );
        showMessage('success', `Setting updated successfully`);
      } else {
        throw new Error('Failed to update');
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      showMessage('error', 'Failed to update setting');
    } finally {
      setSaving(null);
    }
  };

  if (loading || !user) {
    return (
      <FleetShell user={user as SessionUser} title="Settings">
        <FleetPageSkeleton variant="form" />
      </FleetShell>
    );
  }

  return (
    <FleetShell user={user} title="Settings">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Admin / Settings</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Settings</h1>
            </div>
            <p className={styles.subtitle}>Manage system-wide feature toggles and configuration</p>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        {user.role === 'admin' && <BrandingSettings />}

        <div className={styles.settingsGrid}>
          {user.role === 'admin' && driverPushPrompt !== null && (
            <div className={styles.settingCard}>
              <div className={styles.settingIcon}>🔔</div>
              <div className={styles.settingContent}>
                <div className={styles.settingLabel}>Prompt drivers to enable notifications</div>
                <div className={styles.settingDescription}>
                  When enabled, drivers in your fleet who haven&apos;t turned on push
                  notifications see a &ldquo;Stay in the loop&rdquo; prompt on login. Turn this off
                  to stop nudging them.
                </div>
              </div>
              <div className={styles.settingAction}>
                <label className={`${styles.toggle} ${savingDriverPush ? styles.toggleDisabled : ''}`}>
                  <input
                    type="checkbox"
                    checked={driverPushPrompt}
                    onChange={toggleDriverPushPrompt}
                    disabled={savingDriverPush}
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
                <span className={styles.statusLabel}>
                  {driverPushPrompt ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}

          {settings.map((setting) => {
            const info = SETTING_INFO[setting.key] || {
              label: setting.key,
              icon: '⚙️',
            };
            const isToggling = saving === setting.key;

            return (
              <div key={setting.key} className={styles.settingCard}>
                <div className={styles.settingIcon}>{info.icon}</div>
                <div className={styles.settingContent}>
                  <div className={styles.settingLabel}>{info.label}</div>
                  {setting.description && (
                    <div className={styles.settingDescription}>{setting.description}</div>
                  )}
                  <div className={styles.settingMeta}>
                    Last updated: {new Date(setting.updated_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className={styles.settingAction}>
                  <label className={`${styles.toggle} ${isToggling ? styles.toggleDisabled : ''}`}>
                    <input
                      type="checkbox"
                      checked={!!setting.value}
                      onChange={() => toggleSetting(setting.key, !!setting.value)}
                      disabled={isToggling}
                    />
                    <span className={styles.toggleSlider}></span>
                  </label>
                  <span className={styles.statusLabel}>
                    {setting.value ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            );
          })}

          {settings.length === 0 && !(user.role === 'admin' && driverPushPrompt !== null) && (
            <div className={styles.empty}>
              <p>No settings configured yet.</p>
              <p className={styles.emptyHint}>
                Run the database migration to create the app_settings table and seed initial values.
              </p>
            </div>
          )}
        </div>

        <div className={styles.infoCard}>
          <div className={styles.infoIcon}>ℹ️</div>
          <div>
            <strong>About the Package Update Check</strong>
            <p>
              When enabled, a weekly automated check runs every Monday at 8:00 AM UTC. 
              It compares installed npm packages against the latest versions on the npm registry 
              and sends an email report to <strong>franksciberras@gmail.com</strong> if any updates are available.
            </p>
          </div>
        </div>
      </div>
    </FleetShell>
  );
}
