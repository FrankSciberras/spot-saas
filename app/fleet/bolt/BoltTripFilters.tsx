'use client';

import { useRouter } from 'next/navigation';
import styles from './bolt.module.css';

const STATUSES = [
  { key: 'all', label: 'All' },
  { key: 'finished', label: 'Finished' },
  { key: 'declined', label: 'Declined' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

/**
 * Status pills + driver picker for the Trips tab. Both simply rewrite the URL —
 * the list itself is filtered and paged on the server.
 *
 * `params` is the current query (tab + period) WITHOUT status / driver / page,
 * so changing a filter always lands back on page one.
 */
export default function BoltTripFilters({
  params,
  status,
  driver,
  drivers,
}: {
  params: Record<string, string>;
  status: string;
  driver: string;
  drivers: { uuid: string; name: string }[];
}) {
  const router = useRouter();

  const go = (next: { status?: string; driver?: string }) => {
    const q = new URLSearchParams(params);
    const s = next.status ?? status;
    const d = next.driver ?? driver;
    if (s && s !== 'all') q.set('status', s);
    if (d) q.set('driver', d);
    router.push(`/fleet/bolt?${q.toString()}`, { scroll: false });
  };

  return (
    <div className={styles.tripFilters}>
      <div className={styles.pills} role="group" aria-label="Trip status">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={styles.pill}
            data-active={status === s.key ? 'true' : undefined}
            onClick={() => go({ status: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>
      <select
        className={styles.filterSelect}
        value={driver}
        onChange={(e) => go({ driver: e.target.value })}
        aria-label="Driver"
      >
        <option value="">All drivers</option>
        {drivers.map((d) => (
          <option key={d.uuid} value={d.uuid}>{d.name}</option>
        ))}
      </select>
    </div>
  );
}
