'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkBoltDriverAction } from '@/lib/actions/bolt';
import styles from './bolt.module.css';

export interface BoltDriverStat {
  uuid: string;
  name: string;
  /** Bolt portal status: active | suspended | deactivated | null (no longer in the fleet). */
  status: string | null;
  linkedDriverId: string | null;
  offers: number;
  finished: number;
  /** 0–1, or null when there was nothing to accept or decline. */
  acceptance: number | null;
  fares: number;
  tips: number;
  cash: number;
  busySeconds: number;
  perHour: number | null;
  rating: number | null;
}

type SortKey = 'name' | 'finished' | 'acceptance' | 'fares' | 'tips' | 'cash' | 'busySeconds' | 'perHour' | 'rating';

const COLUMNS: { key: SortKey; label: string; hint?: string }[] = [
  { key: 'finished', label: 'Rides', hint: 'Finished rides (of all rides offered)' },
  { key: 'acceptance', label: 'Accepted', hint: 'Share of offers the driver accepted' },
  { key: 'fares', label: 'Fares', hint: 'What riders paid, before Bolt’s commission' },
  { key: 'tips', label: 'Tips' },
  { key: 'cash', label: 'Cash', hint: 'Part of the fares the driver collected in cash' },
  { key: 'busySeconds', label: 'On jobs', hint: 'Time driving to pickups and carrying riders' },
  { key: 'perHour', label: 'Per hour', hint: 'Fares per hour spent on jobs' },
  { key: 'rating', label: 'Rating', hint: 'Average rider rating in this period' },
];

function hours(seconds: number): string {
  if (seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h >= 20 ? `${Math.round(mins / 60)} h` : `${h} h ${mins % 60} m`;
}

/**
 * Per-driver Bolt numbers for the chosen period. Click a column heading to
 * sort. The "Rovora driver" picker ties a Bolt driver to the fleet's own driver
 * record, which is what lets later features (settlements, utilisation against
 * shift hours) line the two up.
 */
export default function BoltDriversTable({
  rows,
  rovoraDrivers,
  currency,
}: {
  rows: BoltDriverStat[];
  rovoraDrivers: { id: string; name: string }[];
  currency: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'fares', dir: -1 });
  const [savingUuid, setSavingUuid] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const money = useMemo(
    () => new Intl.NumberFormat('en-MT', { style: 'currency', currency, maximumFractionDigits: 2 }),
    [currency],
  );

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir;
      // Blanks (no data) always sink to the bottom, whichever way we sort.
      const key = sort.key as Exclude<SortKey, 'name'>;
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir || a.name.localeCompare(b.name);
    });
    return list;
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }));

  const link = (uuid: string, driverId: string) => {
    setError('');
    setSavingUuid(uuid);
    startTransition(async () => {
      const res = await linkBoltDriverAction(uuid, driverId || null);
      if (res.error) setError(res.error);
      setSavingUuid(null);
      router.refresh();
    });
  };

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '');

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thName}>
                <button type="button" onClick={() => toggleSort('name')}>Driver{arrow('name')}</button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} title={c.hint}>
                  <button type="button" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
              <th className={styles.thLink} title="The matching driver in your Rovora fleet">Rovora driver</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.uuid} data-quiet={r.offers === 0 ? 'true' : undefined}>
                <td className={styles.tdName}>
                  <span className={styles.driverName}>{r.name}</span>
                  {r.status && r.status !== 'active' && (
                    <span className={styles.statusChip} data-status={r.status}>
                      {r.status === 'suspended' ? 'Suspended' : 'Deactivated'}
                    </span>
                  )}
                </td>
                <td>
                  {r.finished}
                  <span className={styles.sub}> / {r.offers}</span>
                </td>
                <td data-low={r.acceptance != null && r.acceptance < 0.5 ? 'true' : undefined}>
                  {r.acceptance == null ? '—' : `${Math.round(r.acceptance * 100)}%`}
                </td>
                <td className={styles.strong}>{r.finished ? money.format(r.fares) : '—'}</td>
                <td>{r.tips ? money.format(r.tips) : '—'}</td>
                <td>{r.cash ? money.format(r.cash) : '—'}</td>
                <td>{hours(r.busySeconds)}</td>
                <td>{r.perHour == null ? '—' : money.format(r.perHour)}</td>
                <td>{r.rating == null ? '—' : r.rating.toFixed(2)}</td>
                <td className={styles.tdLink}>
                  <select
                    className={styles.linkSelect}
                    value={r.linkedDriverId ?? ''}
                    onChange={(e) => link(r.uuid, e.target.value)}
                    disabled={savingUuid === r.uuid}
                    aria-label={`Rovora driver for ${r.name}`}
                    data-linked={r.linkedDriverId ? 'true' : undefined}
                  >
                    <option value="">Not linked</option>
                    {rovoraDrivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
