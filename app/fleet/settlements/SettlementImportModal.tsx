'use client';

// =============================================================================
// Settlement CSV importer — modal
// =============================================================================
// Operators download weekly per-driver earnings exports from their platform
// fleet portals (Bolt, Uber, …) and re-type them into the settlement form.
// This modal replaces that: pick the platform, drop the CSV in, confirm the
// column mapping (auto-guessed, remembered per platform), fix any unmatched
// driver names, and the figures are staged into the settlement workspace.

import { useMemo, useState } from 'react';
import type { PlatformConfig } from '@/lib/config/settlements';
import { parseCsv, parseLocaleNumber, guessColumns, matchDriver, type ParsedCsv } from '@/lib/utils/csv';
import { formatCurrency, round2 } from '@/lib/utils/settlementCalculations';
import styles from './settlement-import.module.css';

export interface ImportedFigures {
  grossFare: number;
  tips: number;
  cashRide: number;
  campaigns: number;
}

/** driverId → platformId → figures (what the modal hands back to the workspace). */
export type StagedImport = Record<string, Record<string, ImportedFigures>>;

interface DriverOption {
  id: string;
  full_name: string;
}

interface Props {
  platforms: PlatformConfig[];
  drivers: DriverOption[];
  onApply: (platformId: string, rows: Record<string, ImportedFigures>) => void;
  onClose: () => void;
}

interface ColumnMap {
  driver: number;
  gross: number;
  tips: number;
  cash: number;
  campaigns: number;
}

const NONE = -1;
const MAP_STORAGE_PREFIX = 'rovora-import-map-';

function loadSavedMap(platformId: string, headerCount: number): ColumnMap | null {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_PREFIX + platformId);
    if (!raw) return null;
    const map = JSON.parse(raw) as ColumnMap;
    // Reject saved maps that point past this file's columns.
    const values = [map.driver, map.gross, map.tips, map.cash, map.campaigns];
    if (values.some((v) => typeof v !== 'number' || v >= headerCount)) return null;
    return map;
  } catch {
    return null;
  }
}

export default function SettlementImportModal({ platforms, drivers, onApply, onClose }: Props) {
  const [platformId, setPlatformId] = useState(platforms[0]?.id ?? '');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [map, setMap] = useState<ColumnMap>({ driver: NONE, gross: NONE, tips: NONE, cash: NONE, campaigns: NONE });
  // CSV row index → driver id ('' = skip). Seeded by the fuzzy matcher.
  const [rowDrivers, setRowDrivers] = useState<Record<number, string>>({});

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseError('');
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length < 2 || parsed.rows.length === 0) {
        setParseError('Could not read that file — it needs a header row and at least one data row.');
        return;
      }
      setFileName(file.name);
      setCsv(parsed);
      const initial = loadSavedMap(platformId, parsed.headers.length) ?? { ...guessColumns(parsed.headers) };
      setMap(initial);
      seedDriverMatches(parsed, initial.driver);
    } catch {
      setParseError('Could not read that file.');
    }
  };

  const seedDriverMatches = (parsed: ParsedCsv, driverCol: number) => {
    const seeded: Record<number, string> = {};
    if (driverCol !== NONE) {
      parsed.rows.forEach((row, i) => {
        seeded[i] = matchDriver(row[driverCol] ?? '', drivers) ?? '';
      });
    }
    setRowDrivers(seeded);
  };

  const setMapField = (field: keyof ColumnMap, value: number) => {
    const next = { ...map, [field]: value };
    setMap(next);
    if (field === 'driver' && csv) seedDriverMatches(csv, value);
  };

  const preview = useMemo(() => {
    if (!csv) return [];
    return csv.rows.map((row, i) => {
      const name = map.driver !== NONE ? (row[map.driver] ?? '').trim() : `Row ${i + 1}`;
      const figures: ImportedFigures = {
        grossFare: map.gross !== NONE ? round2(parseLocaleNumber(row[map.gross] ?? '')) : 0,
        tips: map.tips !== NONE ? round2(parseLocaleNumber(row[map.tips] ?? '')) : 0,
        cashRide: map.cash !== NONE ? round2(parseLocaleNumber(row[map.cash] ?? '')) : 0,
        campaigns: map.campaigns !== NONE ? round2(parseLocaleNumber(row[map.campaigns] ?? '')) : 0,
      };
      return { index: i, name, figures };
    }).filter((r) => r.figures.grossFare !== 0 || r.figures.tips !== 0 || r.figures.cashRide !== 0 || r.figures.campaigns !== 0);
  }, [csv, map]);

  const matchedCount = preview.filter((r) => rowDrivers[r.index]).length;
  const canApply = platformId && map.driver !== NONE && map.gross !== NONE && matchedCount > 0;

  const apply = () => {
    if (!canApply) return;
    try {
      localStorage.setItem(MAP_STORAGE_PREFIX + platformId, JSON.stringify(map));
    } catch {
      // localStorage unavailable — mapping just won't be remembered.
    }

    // Merge rows mapped to the same driver (some exports split per vehicle).
    const byDriver: Record<string, ImportedFigures> = {};
    preview.forEach((r) => {
      const driverId = rowDrivers[r.index];
      if (!driverId) return;
      const cur = byDriver[driverId] ?? { grossFare: 0, tips: 0, cashRide: 0, campaigns: 0 };
      byDriver[driverId] = {
        grossFare: round2(cur.grossFare + r.figures.grossFare),
        tips: round2(cur.tips + r.figures.tips),
        cashRide: round2(cur.cashRide + r.figures.cashRide),
        campaigns: round2(cur.campaigns + r.figures.campaigns),
      };
    });
    onApply(platformId, byDriver);
  };

  const platform = platforms.find((p) => p.id === platformId);

  const columnPicker = (label: string, field: keyof ColumnMap, required: boolean) => (
    <label className={styles.mapField}>
      <span className={styles.mapLabel}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </span>
      <select
        value={map[field]}
        onChange={(e) => setMapField(field, parseInt(e.target.value, 10))}
        className={styles.select}
      >
        <option value={NONE}>{required ? 'Pick a column…' : 'Not in this file'}</option>
        {csv?.headers.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h2 className={styles.title}>Import earnings from CSV</h2>
            <p className={styles.subtitle}>
              Upload the weekly per-driver export from a platform&apos;s fleet portal. The figures are
              staged into this week&apos;s settlements — nothing is saved until you create the drafts.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Step 1: platform + file */}
        <div className={styles.row}>
          <label className={styles.mapField}>
            <span className={styles.mapLabel}>Platform</span>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className={styles.select}>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </label>

          <label className={styles.fileField}>
            <span className={styles.mapLabel}>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv,.txt"
              onChange={(e) => handleFile(e.target.files?.[0])}
              className={styles.fileInput}
            />
            {fileName && <span className={styles.fileName}>{fileName} — {csv?.rows.length ?? 0} rows</span>}
          </label>
        </div>

        {parseError && <div className={styles.error}>{parseError}</div>}

        {/* Step 2: column mapping */}
        {csv && (
          <>
            <div className={styles.sectionLabel}>Which column is which?</div>
            <div className={styles.mapGrid}>
              {columnPicker('Driver name', 'driver', true)}
              {columnPicker('Gross fare', 'gross', true)}
              {columnPicker('Tips', 'tips', false)}
              {columnPicker('Cash collected', 'cash', false)}
              {columnPicker('Campaigns / bonuses', 'campaigns', false)}
            </div>

            {/* Step 3: preview + driver matching */}
            <div className={styles.sectionLabel}>
              Preview — {matchedCount} of {preview.length} rows matched to drivers
            </div>
            <div className={styles.previewWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>In file</th>
                    <th>Driver</th>
                    <th>Gross</th>
                    <th>Tips</th>
                    <th>Cash</th>
                    <th>Campaigns</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.index} className={rowDrivers[r.index] ? '' : styles.unmatched}>
                      <td className={styles.csvName}>{r.name}</td>
                      <td>
                        <select
                          value={rowDrivers[r.index] ?? ''}
                          onChange={(e) => setRowDrivers((prev) => ({ ...prev, [r.index]: e.target.value }))}
                          className={styles.selectSm}
                        >
                          <option value="">— skip —</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.full_name}</option>
                          ))}
                        </select>
                      </td>
                      <td className={styles.num}>{formatCurrency(r.figures.grossFare)}</td>
                      <td className={styles.num}>{formatCurrency(r.figures.tips)}</td>
                      <td className={styles.num}>{formatCurrency(r.figures.cashRide)}</td>
                      <td className={styles.num}>{formatCurrency(r.figures.campaigns)}</td>
                    </tr>
                  ))}
                  {preview.length === 0 && (
                    <tr><td colSpan={6} className={styles.emptyRow}>No rows with figures found — check the column mapping.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" disabled={!canApply} onClick={apply}>
            Stage {matchedCount > 0 ? `${matchedCount} driver${matchedCount === 1 ? '' : 's'}` : 'import'}
            {platform ? ` for ${platform.name}` : ''}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
