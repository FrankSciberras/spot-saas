'use client';

import { useEffect, useState, useTransition } from 'react';
import { getFleetDetailsAction, updateSpeedLimitAction } from '@/lib/actions/fleet-details';
import { LinkCard, PanelLoading, SettingsSection, ToggleCard, sendJson, type Notify } from './SettingsParts';
import MapStartPicker from './MapStartPicker';
import styles from './settings.module.css';

type Tracking = { on: boolean; requireLocation: boolean };

/**
 * Settings → Live Map: whether shifts share live location, whether location is
 * required to start a shift, and the fleet speed limit behind speeding alerts.
 */
export default function LiveMapSettings({ notify }: { notify: Notify }) {
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'on' | 'require' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fleet/live-tracking', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => {
        if (cancelled || !t) return;
        setTracking({ on: t.track_location_on_shift !== false, requireLocation: t.require_location_for_shift === true });
      })
      .catch(() => notify('error', 'Failed to load Live Map settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [notify]);

  const save = async (which: 'on' | 'require', next: boolean) => {
    setSaving(which);
    try {
      const body = await sendJson<{ track_location_on_shift?: boolean; require_location_for_shift?: boolean }>(
        '/api/fleet/live-tracking',
        'PUT',
        which === 'on' ? { value: next } : { require: next }
      );
      setTracking({ on: body.track_location_on_shift !== false, requireLocation: body.require_location_for_shift === true });
      if (which === 'on') notify('success', next ? 'Live location during shifts is on' : 'Live location during shifts is off');
      else notify('success', next ? 'Drivers now need location working to start a shift' : 'Location is no longer required to start a shift');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to update setting');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <SettingsSection
        title="Location sharing"
        description="How drivers’ phones share their position with the Live Map while they’re on shift."
      >
        {loading ? (
          <PanelLoading />
        ) : tracking ? (
          <>
            <ToggleCard
              icon="📍"
              label="Live location during shifts"
              description={
                <>
                  When on, starting a shift in the Rovora Driver app shares the driver&apos;s live location on your
                  Live Map. The app checks the phone&apos;s location settings and asks the driver to fix them, and
                  keeps reminding on-shift drivers who aren&apos;t sharing. Turn this off to start shifts without
                  location sharing.
                </>
              }
              checked={tracking.on}
              onToggle={() => save('on', !tracking.on)}
              saving={saving === 'on'}
            />
            {tracking.on && (
              <ToggleCard
                icon="🛡️"
                label="Require location to start a shift"
                description={
                  <>
                    When on, drivers can only go online from the Rovora Driver app, and only once their phone&apos;s
                    location is set up properly — the app shows them exactly what to fix. Shifts can no longer be
                    started from a web browser. Drivers on an older version of the app are let through until they
                    update.
                  </>
                }
                checked={tracking.requireLocation}
                onToggle={() => save('require', !tracking.requireLocation)}
                saving={saving === 'require'}
                onLabel="Required"
                offLabel="Optional"
              />
            )}
          </>
        ) : (
          <div className={styles.empty}><p>Couldn’t load the location settings. Refresh to try again.</p></div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Speeding"
        description="Speed above which a live-tracking alert fires and a speeding event counts against a driver’s safety score."
      >
        <SpeedLimitCard notify={notify} />
      </SettingsSection>

      <MapStartPicker notify={notify} />

      <SettingsSection title="Zones">
        <LinkCard
          icon="🗺️"
          label="Zones and arrival alerts"
          description="Draw zones around places you care about — depots, the airport, a client’s site — and get notified when a driver enters or leaves. Zones are drawn right on the map."
          href="/fleet/tracking"
          cta="Open Live Map"
        />
      </SettingsSection>
    </>
  );
}

function SpeedLimitCard({ notify }: { notify: Notify }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getFleetDetailsAction().then((res) => {
      if (cancelled) return;
      const v = res.details?.speed_limit_kmh != null ? String(res.details.speed_limit_kmh) : '';
      setValue(v);
      setSaved(v);
    });
    return () => { cancelled = true; };
  }, []);

  if (saved === null) return <PanelLoading rows={1} />;

  const dirty = value.trim() !== saved;
  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateSpeedLimitAction(value.trim() === '' ? null : value.trim());
      if (res.error) { notify('error', res.error); return; }
      setSaved(value.trim());
      notify('success', value.trim() === '' ? 'Speeding alerts are off' : `Speed limit set to ${value.trim()} km/h`);
    });
  };

  return (
    <form className={styles.settingCard} onSubmit={onSave}>
      <div className={styles.settingIcon} aria-hidden>🚦</div>
      <div className={styles.settingContent}>
        <div className={styles.settingLabel}>Fleet speed limit</div>
        <div className={styles.settingDescription}>
          Alerts when any driver goes over this speed (at most one per driver every 10 minutes). Leave empty to turn
          speeding alerts off.
        </div>
        <div className={styles.inlineFields}>
          <label className={styles.inlineField}>
            <input
              className={styles.numInput}
              type="number"
              inputMode="numeric"
              min={20}
              max={200}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="off"
              aria-label="Fleet speed limit in km/h"
            />
            km/h
          </label>
          <button type="submit" className="btn btn-primary" disabled={!dirty || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className={styles.settingAction}>
        <span className={styles.statusLabel}>{saved === '' ? 'Off' : `${saved} km/h`}</span>
      </div>
    </form>
  );
}
