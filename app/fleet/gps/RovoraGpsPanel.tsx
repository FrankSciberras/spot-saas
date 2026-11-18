'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addRovoraTrackerAction } from '@/lib/actions/gps';
import RovoraSetupSteps from './RovoraSetupSteps';
import type { VehicleChoice } from './GpsDevicesTable';
import styles from './gps.module.css';

/**
 * Rovora GPS — trackers on Rovora's own GPS server. Add a tracker by its IMEI
 * (and the car it's in), then follow the setup text message.
 */
export default function RovoraGpsPanel({
  host,
  port,
  priceEur,
  vehicles,
  trackerCount,
}: {
  host: string;
  port: number;
  priceEur: number;
  vehicles: VehicleChoice[];
  trackerCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(trackerCount === 0);
  const [imei, setImei] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState<{ name: string; imei: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const priceLabel = priceEur > 0 ? `€${Number.isInteger(priceEur) ? priceEur : priceEur.toFixed(2)} per tracker a month` : 'Included';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const res = await addRovoraTrackerAction({ imei, vehicleId: vehicleId || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAdded({ name: res.name, imei: res.imei });
      setImei('');
      setVehicleId('');
      router.refresh();
    });
  };

  return (
    <section className={styles.rovoraPanel}>
      <div className={styles.rovoraHead}>
        <span className={styles.providerLogo} style={{ background: '#2bbd7e', color: '#fff', fontSize: 18 }} aria-hidden>
          R
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 className={styles.connectTitle}>Rovora GPS — plug-and-play trackers</h2>
          <p className={styles.connectLead}>
            No GPS company needed. Buy a Teltonika tracker, add it here, send it one text message — the car is on your
            Live Map. <strong>{priceLabel}</strong>, cancel any time.
          </p>
        </div>
        {!open && !added && (
          <button className={styles.primary} type="button" onClick={() => setOpen(true)}>
            + Add a tracker
          </button>
        )}
      </div>

      {added ? (
        <div>
          <p className={styles.noteOk} style={{ margin: '4px 0 10px' }}>
            Added {added.name} (IMEI {added.imei}). Now switch it on:
          </p>
          <RovoraSetupSteps host={host} port={port} />
          <div className={styles.formActions}>
            <button
              className={styles.ghostBtn}
              type="button"
              onClick={() => {
                setAdded(null);
                setOpen(true);
              }}
            >
              + Add another tracker
            </button>
            <button className={styles.ghostBtn} type="button" onClick={() => { setAdded(null); setOpen(false); }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        open && (
          <div className={styles.connectWrap} style={{ marginBottom: 0 }}>
            <form className={styles.connectCard} onSubmit={submit}>
              {error && <div className={styles.error}>{error}</div>}
              <label className={styles.label} htmlFor="rovora-imei">
                Tracker IMEI
              </label>
              <input
                id="rovora-imei"
                className={styles.input}
                value={imei}
                onChange={(e) => setImei(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="15 digits, e.g. 350612070000001"
                disabled={pending}
              />
              <p className={styles.hint}>Printed on the tracker&rsquo;s label and on its box.</p>

              <label className={styles.label} htmlFor="rovora-vehicle">
                Which car is it in? <span className={styles.optional}>(optional)</span>
              </label>
              <select
                id="rovora-vehicle"
                className={styles.input}
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                disabled={pending}
              >
                <option value="">— Choose later —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>

              <div className={styles.formActions}>
                <button className={styles.primary} type="submit" disabled={pending || imei.replace(/\D/g, '').length < 15}>
                  {pending ? 'Adding…' : 'Add tracker'}
                </button>
                {trackerCount > 0 && (
                  <button className={styles.ghostBtn} type="button" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <aside className={styles.steps}>
              <h3 className={styles.stepsTitle}>What to buy</h3>
              <ul className={styles.benefits}>
                <li>
                  <strong>Teltonika FMC920 or FMC130</strong> (about €50) — wired in by any car electrician, can&rsquo;t
                  be unplugged, knows when the engine is on. Best for taxis.
                </li>
                <li>
                  <strong>Teltonika FMC003</strong> (about €90) — plugs into the OBD port in a minute, no installer.
                </li>
                <li>
                  A <strong>data SIM</strong> that can receive texts: GO, Melita, Epic, or an IoT SIM like 1NCE (€12 once
                  for 10 years).
                </li>
              </ul>
              <p className={styles.stepsNote}>
                The tracker keeps saving positions when it has no signal and sends them when it&rsquo;s back.
              </p>
            </aside>
          </div>
        )
      )}
    </section>
  );
}
