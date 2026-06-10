'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateDefaultDriverSharePctAction,
  updateDriverSharePctAction,
} from '@/lib/actions/settlement-settings';
import styles from './settlements-settings.module.css';

export interface DriverShareRow {
  id: string;
  full_name: string;
  /** Per-driver override, or null when the driver inherits the fleet default. */
  overridePct: number | null;
}

interface Props {
  defaultPct: number;
  drivers: DriverShareRow[];
}

function fmtPct(n: number): string {
  // Trim a trailing ".00" but keep e.g. 47.5.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export default function SettlementSettingsClient({ defaultPct, drivers }: Props) {
  const router = useRouter();

  const [defaultValue, setDefaultValue] = useState(fmtPct(defaultPct));
  const [savedDefault, setSavedDefault] = useState(defaultPct);
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries(drivers.map((d) => [d.id, d.overridePct === null ? '' : fmtPct(d.overridePct)]))
  );

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [savingDefault, startDefault] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startRow] = useTransition();

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const saveDefault = () => {
    setError('');
    const pct = defaultValue.trim() === '' ? null : parseFloat(defaultValue);
    startDefault(async () => {
      const res = await updateDefaultDriverSharePctAction(pct);
      if (res.error) {
        setError(res.error);
        return;
      }
      const applied = pct === null || Number.isNaN(pct) ? 50 : Math.min(100, Math.max(0, pct));
      setSavedDefault(applied);
      setDefaultValue(fmtPct(applied));
      flash('Default split saved.');
      router.refresh();
    });
  };

  const saveDriver = (id: string) => {
    setError('');
    const raw = overrides[id]?.trim() ?? '';
    const pct = raw === '' ? null : parseFloat(raw);
    setSavingId(id);
    startRow(async () => {
      const res = await updateDriverSharePctAction(id, pct);
      setSavingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      flash('Driver split saved.');
      router.refresh();
    });
  };

  const clearDriver = (id: string) => {
    setOverrides((prev) => ({ ...prev, [id]: '' }));
    setError('');
    setSavingId(id);
    startRow(async () => {
      const res = await updateDriverSharePctAction(id, null);
      setSavingId(null);
      if (res.error) {
        setError(res.error);
        return;
      }
      flash('Reverted to the fleet default.');
      router.refresh();
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>Settlements / Settlement Rules</div>
        <h1 className={styles.title}>Settlement Rules</h1>
        <p className={styles.subtitle}>
          Set the share of gross fare each driver keeps. Use the company default for everyone, then
          override individual drivers as needed. Changes only affect settlements you create from now
          on — existing settlements keep the split they were saved with.
        </p>
      </div>

      {notice && <div className={`${styles.message} ${styles.success}`}>{notice}</div>}
      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

      {/* Company default ---------------------------------------------------- */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardLabel}>Company default split</div>
          <div className={styles.cardDesc}>
            The driver&apos;s cut of gross fare, applied to every driver unless overridden below.
            50% is the classic 50/50 split.
          </div>
        </div>
        <div className={styles.defaultRow}>
          <div className={styles.pctField}>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={defaultValue}
              disabled={savingDefault}
              onChange={(e) => setDefaultValue(e.target.value)}
              className={styles.pctInput}
              aria-label="Default driver share percentage"
            />
            <span className={styles.pctSuffix}>% to driver</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingDefault}
            onClick={saveDefault}
          >
            {savingDefault ? 'Saving…' : 'Save default'}
          </button>
        </div>
      </div>

      {/* Per-driver overrides ---------------------------------------------- */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.cardLabel}>Per-driver overrides</div>
          <div className={styles.cardDesc}>
            Leave a driver blank to use the company default ({fmtPct(savedDefault)}%). Enter a number
            to give that driver a different split.
          </div>
        </div>

        {drivers.length === 0 ? (
          <div className={styles.empty}>No active drivers yet.</div>
        ) : (
          <div className={styles.driverList}>
            {drivers.map((d) => {
              const raw = overrides[d.id] ?? '';
              const hasOverride = raw.trim() !== '';
              const parsed = parseFloat(raw);
              const effective = hasOverride && !Number.isNaN(parsed)
                ? Math.min(100, Math.max(0, parsed))
                : savedDefault;
              const isSaving = savingId === d.id;

              return (
                <div key={d.id} className={styles.driverRow}>
                  <div className={styles.driverName}>{d.full_name}</div>
                  <div className={styles.pctField}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={raw}
                      placeholder={fmtPct(savedDefault)}
                      disabled={isSaving}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [d.id]: e.target.value }))
                      }
                      className={styles.pctInput}
                      aria-label={`${d.full_name} share percentage`}
                    />
                    <span className={styles.pctSuffix}>%</span>
                  </div>
                  <div className={styles.effective}>
                    keeps <strong>{fmtPct(effective)}%</strong>
                    {!hasOverride && <span className={styles.inheritTag}>default</span>}
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={isSaving}
                      onClick={() => saveDriver(d.id)}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    {hasOverride && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={isSaving}
                        onClick={() => clearDriver(d.id)}
                      >
                        Use default
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
