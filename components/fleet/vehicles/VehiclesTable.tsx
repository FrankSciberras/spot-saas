'use client';

// Table view of the Vehicles list: one row per vehicle with the things you
// scan for — who drives it, odometer, next service, insurance and road licence
// expiry, damages and utilisation. Click a column header to sort.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFleetSetting } from '@/components/fleet/FleetSettingsProvider';
import type { VehicleItem, VehStatus } from './VehiclesWorkspace';
import styles from './vehiclesTable.module.css';

const STATUS: Record<VehStatus, { label: string; cls: string; rank: number }> = {
  active: { label: 'Active', cls: styles.stActive, rank: 0 },
  service: { label: 'In service', cls: styles.stService, rank: 1 },
  idle: { label: 'Idle', cls: styles.stIdle, rank: 2 },
};

type SortKey = 'plate' | 'status' | 'driver' | 'km' | 'service' | 'insurance' | 'road' | 'damages' | 'util';

const MS_DAY = 86_400_000;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_DAY);
}

function fmtDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** km left until the next service (negative = overdue), or null when there's no km target. */
function kmToService(v: VehicleItem): number | null {
  return v.nextServiceKm != null ? v.nextServiceKm - v.km : null;
}

export default function VehiclesTable({ vehicles, hrefBase }: { vehicles: VehicleItem[]; hrefBase: string }) {
  const router = useRouter();
  const warnDays = Number(useFleetSetting('documents.expiry_warning_days')) || 30;
  const urgentDays = Number(useFleetSetting('documents.urgent_days')) || 7;
  const dueKm = Number(useFleetSetting('maintenance.service_due_km')) || 2000;
  const today = todayIso();

  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'plate', dir: 1 });

  const rows = useMemo(() => {
    const far = Number.POSITIVE_INFINITY;
    const value = (v: VehicleItem): string | number => {
      switch (sort.key) {
        case 'plate':
          return v.plate.toLowerCase();
        case 'status':
          return STATUS[v.status].rank;
        case 'driver':
          return v.driver === '—' ? '￿' : v.driver.toLowerCase();
        case 'km':
          return v.km;
        case 'service': {
          const km = kmToService(v);
          const days = v.nextServiceDate ? daysUntil(v.nextServiceDate, today) : null;
          // Rank by whichever comes first, roughly: 1 day ≈ 100 km.
          return Math.min(km ?? far, days != null ? days * 100 : far);
        }
        case 'insurance':
          return v.insuranceExpiry ?? '9999';
        case 'road':
          return v.roadLicenseExpiry ?? '9999';
        case 'damages':
          return v.damages.severe * 1000 + v.damages.open;
        case 'util':
          return v.util;
      }
    };
    return [...vehicles].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [vehicles, sort, today]);

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key;
    return (
      <th className={align === 'right' ? styles.right : undefined} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={`${styles.sortBtn} ${active ? styles.sortActive : ''}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'damages' || key === 'util' || key === 'km' ? -1 : 1 }))}
        >
          {label}
          <span className={styles.arrow} aria-hidden="true">
            {active ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  const expiryCell = (day: string | null | undefined) => {
    if (!day) return <span className={styles.muted}>—</span>;
    const left = daysUntil(day, today);
    const cls = left < 0 || left <= urgentDays ? styles.bad : left <= warnDays ? styles.warn : '';
    const hint = left < 0 ? `expired ${-left} d ago` : left === 0 ? 'today' : left <= warnDays ? `in ${left} d` : '';
    return (
      <span className={cls}>
        {fmtDate(day)}
        {hint && <span className={styles.sub}>{hint}</span>}
      </span>
    );
  };

  const serviceCell = (v: VehicleItem) => {
    const km = kmToService(v);
    const days = v.nextServiceDate ? daysUntil(v.nextServiceDate, today) : null;
    if (km == null && days == null) return <span className={styles.muted}>Not set</span>;
    const overdue = (km != null && km < 0) || (days != null && days < 0);
    const soon = !overdue && ((km != null && km <= dueKm) || (days != null && days <= 14));
    const cls = overdue ? styles.bad : soon ? styles.warn : '';
    const parts: string[] = [];
    if (km != null) parts.push(km < 0 ? `${Math.abs(km).toLocaleString('en-GB')} km over` : `in ${km.toLocaleString('en-GB')} km`);
    if (days != null) parts.push(days < 0 ? `${-days} d late` : fmtDate(v.nextServiceDate!));
    return (
      <span className={cls}>
        {overdue ? 'Overdue' : soon ? 'Due soon' : parts[0]}
        <span className={styles.sub}>{overdue || soon ? parts.join(' · ') : parts.slice(1).join(' · ')}</span>
      </span>
    );
  };

  if (!rows.length) {
    return <div className={styles.empty}>No vehicles match your filters.</div>;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {header('plate', 'Vehicle')}
            {header('status', 'Status')}
            {header('driver', 'Driver')}
            {header('km', 'Odometer', 'right')}
            {header('service', 'Next service')}
            {header('insurance', 'Insurance')}
            {header('road', 'Road licence')}
            {header('damages', 'Damages')}
            {header('util', 'Use (7 d)', 'right')}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const href = `${hrefBase}/${v.id}`;
            return (
              <tr key={v.id} onClick={() => router.push(href)} className={styles.row}>
                <td>
                  <div className={styles.vehicleCell}>
                    {/* A real link, so the row works with the keyboard and opens in a new tab. */}
                    <Link href={href} className={styles.plate} onClick={(e) => e.stopPropagation()}>
                      {v.plate}
                    </Link>
                    <span className={styles.sub}>
                      {v.model}
                      {v.year ? ` · ${v.year}` : ''}
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`${styles.status} ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
                </td>
                <td className={v.driver === '—' ? styles.muted : undefined}>{v.driver === '—' ? 'Unassigned' : v.driver}</td>
                <td className={`${styles.right} ${styles.num}`}>{v.km ? `${v.km.toLocaleString('en-GB')} km` : '—'}</td>
                <td>{serviceCell(v)}</td>
                <td>{expiryCell(v.insuranceExpiry)}</td>
                <td>{expiryCell(v.roadLicenseExpiry)}</td>
                <td>
                  {v.damages.total === 0 ? (
                    <span className={styles.muted}>None</span>
                  ) : (
                    <span className={styles.dmg}>
                      {v.damages.severe > 0 && <span className={styles.dmgSevere}>{v.damages.severe} severe</span>}
                      {v.damages.open > 0 && <span className={styles.dmgOpen}>{v.damages.open} open</span>}
                      {v.damages.severe === 0 && v.damages.open === 0 && <span className={styles.muted}>{v.damages.total} closed</span>}
                    </span>
                  )}
                </td>
                <td className={`${styles.right} ${styles.num}`}>
                  <span className={styles.utilWrap}>
                    <span className={styles.utilBar}>
                      <span style={{ width: `${Math.round(v.util * 100)}%` }} />
                    </span>
                    {Math.round(v.util * 100)}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
