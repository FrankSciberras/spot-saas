'use client';

import { useEffect, useState } from 'react';
import { useFleetSetting } from '@/components/fleet/FleetSettingsProvider';
import { CatalogSection } from './CatalogSettings';
import { PanelLoading, SettingsSection, ToggleCard, sendJson, type Notify } from './SettingsParts';
import styles from './settings.module.css';

type ShiftCheck = { enabled: boolean; afterHours: number; graceMinutes: number };

/** Settings → Shifts: the "Still on shift?" check that ends forgotten shifts. */
export default function ShiftSettings({ notify, isAdmin }: { notify: Notify; isAdmin: boolean }) {
  const autoCloseHours = useFleetSetting('shifts.auto_close_hours');
  const [check, setCheck] = useState<ShiftCheck | null>(null);
  const [draft, setDraft] = useState({ afterHours: '12', graceMinutes: '30' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = (sc: ShiftCheck) => {
    setCheck(sc);
    setDraft({ afterHours: String(sc.afterHours), graceMinutes: String(sc.graceMinutes) });
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fleet/shift-check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((sc) => { if (!cancelled && sc) apply(sc); })
      .catch(() => notify('error', 'Failed to load shift settings'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [notify]);

  const save = async (patch: Partial<ShiftCheck>) => {
    setSaving(true);
    try {
      apply(await sendJson<ShiftCheck>('/api/fleet/shift-check', 'PUT', patch));
      notify('success', 'Shift check saved');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const unchanged =
    check !== null &&
    draft.afterHours === String(check.afterHours) &&
    draft.graceMinutes === String(check.graceMinutes);

  return (
    <SettingsSection title="Forgotten shifts" description="Keep shift hours honest when a driver forgets to end their shift.">
      {loading ? (
        <PanelLoading rows={1} />
      ) : check ? (
        <ToggleCard
          label="“Still on shift?” check"
          description={
            <>
              Catches shifts drivers forget to end. After the hours below, Rovora asks the driver if they&apos;re still
              working (a phone notification from the app, plus in-app and email). Opening the app answers it and the
              shift carries on — they&apos;re asked again after the same number of hours. If there&apos;s no answer in
              time, the shift ends at the moment we asked and you&apos;re notified.
              {!check.enabled && ` While off, shifts still open after ${autoCloseHours} hours are ended automatically.`}
            </>
          }
          checked={check.enabled}
          onToggle={() => save({ enabled: !check.enabled })}
          saving={saving}
        >
          {check.enabled && (
            <div className={styles.inlineFields}>
              <label className={styles.inlineField}>
                Ask after
                <input
                  className={styles.numInput}
                  type="number"
                  min={1}
                  max={23}
                  step={0.5}
                  value={draft.afterHours}
                  onChange={(e) => setDraft((d) => ({ ...d, afterHours: e.target.value }))}
                  aria-label="Ask after hours on shift"
                />
                hours on shift
              </label>
              <label className={styles.inlineField}>
                · end the shift if no answer within
                <input
                  className={styles.numInput}
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  value={draft.graceMinutes}
                  onChange={(e) => setDraft((d) => ({ ...d, graceMinutes: e.target.value }))}
                  aria-label="Minutes to wait for an answer"
                />
                minutes
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || unchanged}
                onClick={() => save({ afterHours: Number(draft.afterHours), graceMinutes: Number(draft.graceMinutes) })}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </ToggleCard>
      ) : (
        <div className={styles.empty}><p>Couldn’t load the shift settings. Refresh to try again.</p></div>
      )}
      {/* The plain time limit only applies while the check is off. */}
      {check && !check.enabled && <CatalogSection tab="shifts" section="Forgotten shifts" isAdmin={isAdmin} notify={notify} />}
    </SettingsSection>
  );
}
