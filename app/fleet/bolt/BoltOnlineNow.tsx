'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './bolt.module.css';

interface OnlineDriver {
  uuid: string | null;
  name: string;
  state: 'waiting' | 'on_ride' | 'on_break';
  since: string | null;
  vehicle: { reg: string; model: string } | null;
  category: string | null;
}

const STATE_LABEL: Record<OnlineDriver['state'], string> = {
  on_ride: 'On a ride',
  waiting: 'Waiting for rides',
  on_break: 'On a break',
};

const STATE_ORDER: OnlineDriver['state'][] = ['on_ride', 'waiting', 'on_break'];

function sinceText(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `for ${mins} min`;
  const h = Math.floor(mins / 60);
  return `for ${h} h ${mins % 60} min`;
}

/**
 * Who is online on Bolt this minute — read live from Bolt (not from the hourly
 * import) and refreshed every minute while the tab is visible.
 */
export default function BoltOnlineNow() {
  const [drivers, setDrivers] = useState<OnlineDriver[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/bolt/online', { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not load who is online.');
      setDrivers(body.drivers as OnlineDriver[]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load who is online.');
    }
  }, []);

  useEffect(() => {
    // First read right after mount, then once a minute while the tab is showing.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const sorted = [...(drivers ?? [])].sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.name.localeCompare(b.name),
  );
  const count = (s: OnlineDriver['state']) => sorted.filter((d) => d.state === s).length;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          <span className={styles.liveDot} aria-hidden /> Online on Bolt now
        </h2>
        {drivers && (
          <span className={styles.panelMeta}>
            {drivers.length === 0
              ? 'Nobody online'
              : `${count('on_ride')} on a ride · ${count('waiting')} waiting${count('on_break') ? ` · ${count('on_break')} on a break` : ''}`}
          </span>
        )}
      </div>

      {error && <div className={styles.panelEmpty}>{error}</div>}
      {!error && drivers === null && <div className={styles.panelEmpty}>Checking with Bolt…</div>}
      {!error && drivers?.length === 0 && (
        <div className={styles.panelEmpty}>None of your drivers are online on Bolt at the moment.</div>
      )}

      {!error && sorted.length > 0 && (
        <div className={styles.onlineGrid}>
          {sorted.map((d, i) => (
            <div className={styles.onlineCard} key={d.uuid ?? i} data-state={d.state}>
              <div className={styles.onlineName}>{d.name}</div>
              <div className={styles.onlineState}>
                {STATE_LABEL[d.state]} <span>{sinceText(d.since)}</span>
              </div>
              {d.vehicle && (
                <div className={styles.onlineCar}>
                  {d.vehicle.reg}
                  {d.vehicle.model ? ` · ${d.vehicle.model}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
