'use client';

import { useEffect, useState } from 'react';
import { PanelLoading, SettingsSection, ToggleCard, sendJson, type Notify } from './SettingsParts';
import styles from './settings.module.css';

/** Settings → Messages: who can start chats with whom. */
export default function MessagesSettings({ notify }: { notify: Notify }) {
  const [driverDms, setDriverDms] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/messages/settings', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!cancelled && b?.settings) setDriverDms(b.settings.driverDms === true); })
      .catch(() => notify('error', 'Failed to load chat settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [notify]);

  const toggle = async () => {
    if (driverDms === null) return;
    const next = !driverDms;
    setSaving(true);
    try {
      const body = await sendJson<{ settings: { driverDms: boolean } }>('/api/messages/settings', 'PATCH', { driverDms: next });
      setDriverDms(body.settings.driverDms);
      notify('success', next ? 'Drivers can now message each other privately' : 'Drivers can no longer start private chats with each other');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Chat" description="Rules for in-app chat between your office and your drivers.">
      {loading ? (
        <PanelLoading rows={1} />
      ) : driverDms !== null ? (
        <ToggleCard
          icon="💬"
          label="Let drivers message each other privately"
          description="Off: drivers can message managers, and talk to each other in the groups you create. On: drivers can also start one-to-one chats with other drivers."
          checked={driverDms}
          onToggle={toggle}
          saving={saving}
          onLabel="Allowed"
          offLabel="Off"
        />
      ) : (
        <div className={styles.empty}><p>Couldn’t load the chat settings. Refresh to try again.</p></div>
      )}
    </SettingsSection>
  );
}
