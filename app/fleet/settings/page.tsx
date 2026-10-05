'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { SessionUser } from '@/lib/types/database';
import BrandingSettings from './BrandingSettings';
import FleetDetailsSettings from './FleetDetailsSettings';
import styles from './settings.module.css';

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [driverPushPrompt, setDriverPushPrompt] = useState<boolean | null>(null);
  const [savingDriverPush, setSavingDriverPush] = useState(false);
  const [liveTracking, setLiveTracking] = useState<{ on: boolean; moduleOn: boolean } | null>(null);
  const [savingLiveTracking, setSavingLiveTracking] = useState(false);
  // Fleet rule: shifts only start from the app, with location working.
  const [requireLocation, setRequireLocation] = useState(false);
  const [savingRequire, setSavingRequire] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await fetch('/api/auth/user');
      const userData = await userRes.json();
      setUser(userData);

      const pushRes = await fetch('/api/fleet/driver-push-prompt');
      if (pushRes.ok) {
        const pushData = await pushRes.json();
        setDriverPushPrompt(pushData.prompt_drivers_push !== false);
      }

      const trackingRes = await fetch('/api/fleet/live-tracking', { cache: 'no-store' });
      if (trackingRes.ok) {
        const t = await trackingRes.json();
        setLiveTracking({ on: t.track_location_on_shift !== false, moduleOn: t.module_enabled !== false });
        setRequireLocation(t.require_location_for_shift === true);
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

  const toggleLiveTracking = async () => {
    if (liveTracking === null) return;
    const next = !liveTracking.on;
    setSavingLiveTracking(true);
    try {
      const res = await fetch('/api/fleet/live-tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to update setting');
      setLiveTracking({ on: body.track_location_on_shift !== false, moduleOn: body.module_enabled !== false });
      showMessage('success', next ? 'Live location during shifts is on' : 'Live location during shifts is off');
    } catch (error) {
      console.error('Error updating live tracking setting:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to update setting');
    } finally {
      setSavingLiveTracking(false);
    }
  };

  const toggleRequireLocation = async () => {
    const next = !requireLocation;
    setSavingRequire(true);
    try {
      const res = await fetch('/api/fleet/live-tracking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to update setting');
      setRequireLocation(body.require_location_for_shift === true);
      showMessage('success', next ? 'Drivers now need location working to start a shift' : 'Location is no longer required to start a shift');
    } catch (error) {
      console.error('Error updating require-location setting:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to update setting');
    } finally {
      setSavingRequire(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
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
            <p className={styles.subtitle}>Your fleet’s details, branding and preferences</p>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        {user.role === 'admin' && <FleetDetailsSettings />}
        {user.role === 'admin' && <BrandingSettings />}

        <div className={styles.settingsGrid}>
          {user.role === 'admin' && liveTracking !== null && (
            <div className={styles.settingCard}>
              <div className={styles.settingIcon}>📍</div>
              <div className={styles.settingContent}>
                <div className={styles.settingLabel}>Live location during shifts</div>
                <div className={styles.settingDescription}>
                  When on, starting a shift in the Rovora Driver app shares the driver&apos;s live
                  location on your Live Map. The app checks the phone&apos;s location settings and
                  asks the driver to fix them, and keeps reminding on-shift drivers who aren&apos;t
                  sharing. Turn this off to start shifts without location sharing.
                  {!liveTracking.moduleOn && (
                    <>
                      {' '}
                      <strong>
                        The Live Tracking module is switched off, so this has no effect until you turn it
                        on in <Link href="/fleet/integrations">Integrations</Link>.
                      </strong>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.settingAction}>
                <label className={`${styles.toggle} ${savingLiveTracking ? styles.toggleDisabled : ''}`}>
                  <input
                    type="checkbox"
                    checked={liveTracking.on}
                    onChange={toggleLiveTracking}
                    disabled={savingLiveTracking}
                    aria-label="Live location during shifts"
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
                <span className={styles.statusLabel}>
                  {liveTracking.on ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}

          {user.role === 'admin' && liveTracking !== null && liveTracking.on && (
            <div className={styles.settingCard}>
              <div className={styles.settingIcon}>🛡️</div>
              <div className={styles.settingContent}>
                <div className={styles.settingLabel}>Require location to start a shift</div>
                <div className={styles.settingDescription}>
                  When on, drivers can only go online from the Rovora Driver app, and only once their
                  phone&apos;s location is set up properly — the app shows them exactly what to fix.
                  Shifts can no longer be started from a web browser. Drivers on an older version of
                  the app are let through until they update.
                </div>
              </div>
              <div className={styles.settingAction}>
                <label className={`${styles.toggle} ${savingRequire ? styles.toggleDisabled : ''}`}>
                  <input
                    type="checkbox"
                    checked={requireLocation}
                    onChange={toggleRequireLocation}
                    disabled={savingRequire}
                    aria-label="Require location to start a shift"
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
                <span className={styles.statusLabel}>{requireLocation ? 'Required' : 'Optional'}</span>
              </div>
            </div>
          )}

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

          {!(user.role === 'admin' && (driverPushPrompt !== null || liveTracking !== null)) && (
            <div className={styles.empty}>
              <p>No settings available for your role yet.</p>
            </div>
          )}
        </div>
      </div>
    </FleetShell>
  );
}
