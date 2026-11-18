'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkGpsDeviceAction, removeRovoraTrackerAction } from '@/lib/actions/gps';
import RovoraSetupSteps from './RovoraSetupSteps';
import styles from './gps.module.css';

export interface GpsDeviceRow {
  id: string;
  name: string | null;
  uniqueId: string | null;
  plate: string | null;
  providerName: string;
  vehicleId: string | null;
  linkSource: 'auto' | 'manual' | null;
  recordedAt: string | null;
  speedKmh: number | null;
  ignition: boolean | null;
  hasFix: boolean;
  /** On Rovora's own GPS server (can be removed / re-sent its setup text). */
  hosted: boolean;
}

export interface VehicleChoice {
  id: string;
  label: string;
}

function ago(iso: string | null, now: number): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Live (≤5 min), recent (≤1 h) or quiet — same thresholds as the Live Map. */
function freshness(iso: string | null, now: number): { color: string; label: string } {
  if (!iso) return { color: 'var(--text-4)', label: 'No position yet' };
  const age = now - new Date(iso).getTime();
  if (age <= 5 * 60_000) return { color: 'var(--pos)', label: 'Live' };
  if (age <= 60 * 60_000) return { color: 'var(--warn, #f5b54a)', label: 'Recent' };
  return { color: 'var(--text-4)', label: 'Quiet' };
}

export default function GpsDevicesTable({
  devices,
  vehicles,
  hostedServer,
}: {
  devices: GpsDeviceRow[];
  vehicles: VehicleChoice[];
  /** Rovora GPS server address — for the setup text of hosted trackers. */
  hostedServer?: { host: string; port: number } | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [setupFor, setSetupFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const anyHosted = devices.some((d) => d.hosted);

  const remove = (device: GpsDeviceRow) => {
    const ok = window.confirm(
      `Remove tracker “${device.name ?? device.uniqueId}” from Rovora GPS? It stops showing on the map and is no longer billed. You can add it again later with its IMEI.`,
    );
    if (!ok) return;
    setError('');
    setSaving(device.id);
    startTransition(async () => {
      const res = await removeRovoraTrackerAction(device.id);
      setSaving(null);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const takenBy = new Map(devices.filter((d) => d.vehicleId).map((d) => [d.vehicleId!, d]));

  const change = (device: GpsDeviceRow, value: string) => {
    const vehicleId = value || null;
    const other = vehicleId ? takenBy.get(vehicleId) : undefined;
    if (other && other.id !== device.id) {
      const ok = window.confirm(
        `${vehicles.find((v) => v.id === vehicleId)?.label ?? 'That vehicle'} already has tracker “${other.name ?? other.uniqueId ?? 'unnamed'}”. Move it to “${device.name ?? 'this tracker'}” instead?`,
      );
      if (!ok) return;
    }
    setError('');
    setSaving(device.id);
    startTransition(async () => {
      const res = await linkGpsDeviceAction(device.id, vehicleId);
      setSaving(null);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tracker</th>
              <th>In vehicle</th>
              <th>Last position</th>
              <th>Speed</th>
              <th>Ignition</th>
              {anyHosted && <th />}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const f = freshness(d.recordedAt, now);
              return (
                <Fragment key={d.id}>
                <tr>
                  <td>
                    <span className={styles.devName}>{d.name ?? 'Unnamed tracker'}</span>
                    <span className={styles.devSub}>
                      {[d.providerName, d.uniqueId ? `ID ${d.uniqueId}` : null, d.plate ? `plate ${d.plate}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={d.vehicleId ?? ''}
                      onChange={(e) => change(d, e.target.value)}
                      disabled={saving === d.id}
                      aria-label={`Vehicle for ${d.name ?? 'tracker'}`}
                    >
                      <option value="">— Not in a vehicle —</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                          {takenBy.get(v.id) && takenBy.get(v.id)!.id !== d.id ? ' (has a tracker)' : ''}
                        </option>
                      ))}
                    </select>
                    <span className={styles.linkSource}>
                      {saving === d.id
                        ? 'Saving…'
                        : d.vehicleId
                          ? d.linkSource === 'auto'
                            ? 'Matched by plate automatically'
                            : 'Set by you'
                          : d.linkSource === 'manual'
                            ? 'Set by you — won’t be auto-matched'
                            : 'No matching plate found — pick the car'}
                    </span>
                  </td>
                  <td>
                    <span className={styles.dot} style={{ background: f.color }} />
                    {f.label}
                    <span className={styles.devSub}>
                      {d.hasFix
                        ? ago(d.recordedAt, now)
                        : d.hosted
                          ? 'Waiting for first signal — send the setup text'
                          : 'Waiting for the first GPS fix'}
                    </span>
                  </td>
                  <td className={d.speedKmh == null ? styles.muted : undefined}>
                    {d.speedKmh != null ? `${Math.round(d.speedKmh)} km/h` : '—'}
                  </td>
                  <td className={d.ignition == null ? styles.muted : undefined}>
                    {d.ignition == null ? '—' : d.ignition ? 'On' : 'Off'}
                  </td>
                  {anyHosted && (
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {d.hosted && (
                        <span className={styles.controlRow} style={{ justifyContent: 'flex-end' }}>
                          {hostedServer && (
                            <button
                              type="button"
                              className={styles.ghostBtn}
                              onClick={() => setSetupFor(setupFor === d.id ? null : d.id)}
                            >
                              {setupFor === d.id ? 'Hide setup' : 'Setup text'}
                            </button>
                          )}
                          <button type="button" className={styles.ghostBtn} onClick={() => remove(d)} disabled={saving === d.id}>
                            Remove
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
                {setupFor === d.id && hostedServer && (
                  <tr>
                    <td colSpan={anyHosted ? 6 : 5}>
                      <RovoraSetupSteps host={hostedServer.host} port={hostedServer.port} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
