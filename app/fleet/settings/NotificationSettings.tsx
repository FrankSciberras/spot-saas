'use client';

import { useEffect, useState } from 'react';
import { PanelLoading, SettingsSection, ToggleCard, sendJson, type Notify } from './SettingsParts';
import styles from './settings.module.css';

/** Settings → Notifications: how Rovora nudges drivers about push notifications. */
export default function NotificationSettings({ notify }: { notify: Notify }) {
  const [prompt, setPrompt] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fleet/driver-push-prompt', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b) setPrompt(b.prompt_drivers_push !== false); })
      .catch(() => notify('error', 'Failed to load notification settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [notify]);

  const toggle = async () => {
    if (prompt === null) return;
    setSaving(true);
    try {
      const body = await sendJson<{ prompt_drivers_push?: boolean }>('/api/fleet/driver-push-prompt', 'PUT', { value: !prompt });
      setPrompt(body.prompt_drivers_push !== false);
      notify('success', 'Setting updated successfully');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Driver notifications" description="Push notifications are how drivers hear about shift checks, messages and reminders.">
      {loading ? (
        <PanelLoading rows={1} />
      ) : prompt !== null ? (
        <ToggleCard
          icon="🔔"
          label="Prompt drivers to enable notifications"
          description={
            <>
              When enabled, drivers in your fleet who haven&apos;t turned on push notifications see a &ldquo;Stay in
              the loop&rdquo; prompt on login. Turn this off to stop nudging them.
            </>
          }
          checked={prompt}
          onToggle={toggle}
          saving={saving}
        />
      ) : (
        <div className={styles.empty}><p>Couldn’t load the notification settings. Refresh to try again.</p></div>
      )}
    </SettingsSection>
  );
}
