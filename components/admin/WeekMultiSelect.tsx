'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './WeekMultiSelect.module.css';

export interface WeekOption {
  key: string;
  label: string;
  start: string;
  end: string;
}

interface WeekMultiSelectProps {
  /** Every selectable week, oldest → newest. */
  options: WeekOption[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  /** Cycle lengths offered as one-click presets. */
  presets?: number[];
}

const DEFAULT_PRESETS = [1, 2, 4, 8, 13];

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

/**
 * Tick several weeks at once instead of one at a time.
 *
 * Pay cycles rarely line up with a single settlement week — a four-week cycle
 * meant hand-typing the From/To dates every time. The presets pick the last N
 * weeks, and the step buttons walk the same window back a whole cycle so you
 * can compare cycle to cycle without doing date arithmetic.
 */
export default function WeekMultiSelect({
  options,
  selectedKeys,
  onChange,
  disabled = false,
  presets = DEFAULT_PRESETS,
}: WeekMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selected = useMemo(() => options.filter((o) => selectedSet.has(o.key)), [options, selectedSet]);

  // Where the ticked weeks sit in the list. Drives both the gap warning and
  // the step buttons, which slide the window by its own length.
  const selectedIndexes = useMemo(() => {
    const out: number[] = [];
    options.forEach((o, i) => {
      if (selectedSet.has(o.key)) out.push(i);
    });
    return out;
  }, [options, selectedSet]);

  const isContiguous =
    selectedIndexes.length > 0 &&
    selectedIndexes[selectedIndexes.length - 1] - selectedIndexes[0] + 1 === selectedIndexes.length;

  const summary =
    selected.length === 0
      ? 'No weeks selected'
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} weeks · ${shortDate(selected[0].start)} – ${shortDate(selected[selected.length - 1].end)}`;

  const emit = (keys: Set<string>) => onChange(options.filter((o) => keys.has(o.key)).map((o) => o.key));

  const pickLast = (n: number) => {
    anchorIndex.current = null;
    onChange(options.slice(Math.max(0, options.length - n)).map((o) => o.key));
  };

  const windowStartFor = (direction: -1 | 1) => selectedIndexes[0] + direction * selectedIndexes.length;

  const canShift = (direction: -1 | 1) => {
    if (!isContiguous) return false;
    const nextStart = windowStartFor(direction);
    return nextStart >= 0 && nextStart + selectedIndexes.length <= options.length;
  };

  const shiftWindow = (direction: -1 | 1) => {
    if (!canShift(direction)) return;
    const size = selectedIndexes.length;
    const nextStart = windowStartFor(direction);
    anchorIndex.current = null;
    onChange(options.slice(nextStart, nextStart + size).map((o) => o.key));
  };

  const toggle = (index: number, withShift: boolean) => {
    const anchor = anchorIndex.current;

    if (withShift && anchor !== null) {
      const from = Math.min(anchor, index);
      const to = Math.max(anchor, index);
      const next = new Set(selectedKeys);
      options.slice(from, to + 1).forEach((o) => next.add(o.key));
      emit(next);
      return;
    }

    anchorIndex.current = index;
    const key = options[index].key;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    emit(next);
  };

  const availablePresets = presets.filter((n) => n <= options.length);
  const rows = options.map((option, index) => ({ option, index })).reverse();
  const isEmpty = options.length === 0;

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || isEmpty}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={styles.triggerText}>{isEmpty ? 'No weeks available' : summary}</span>
        <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && !isEmpty ? (
        <div className={styles.panel}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Quick pick</div>
            <div className={styles.presets}>
              {availablePresets.map((n) => (
                <button key={n} type="button" className={styles.presetBtn} onClick={() => pickLast(n)}>
                  {n === 1 ? 'Latest week' : `Last ${n}`}
                </button>
              ))}
              <button type="button" className={styles.presetBtn} onClick={() => pickLast(options.length)}>
                All weeks
              </button>
            </div>
          </div>

          {isContiguous && selectedIndexes.length > 0 ? (
            <div className={styles.stepRow}>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => shiftWindow(-1)}
                disabled={!canShift(-1)}
                title="Move the whole selection one cycle earlier"
              >
                ← Previous {selectedIndexes.length}
              </button>
              <button
                type="button"
                className={styles.stepBtn}
                onClick={() => shiftWindow(1)}
                disabled={!canShift(1)}
                title="Move the whole selection one cycle later"
              >
                Next {selectedIndexes.length} →
              </button>
            </div>
          ) : null}

          <div className={styles.list} role="listbox" aria-multiselectable="true">
            {rows.map(({ option, index }) => {
              const checked = selectedSet.has(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`${styles.row} ${checked ? styles.rowChecked : ''}`}
                  onClick={(e) => toggle(index, e.shiftKey)}
                >
                  <span className={`${styles.box} ${checked ? styles.boxChecked : ''}`} aria-hidden="true">
                    {checked ? (
                      <svg viewBox="0 0 12 12">
                        <path d="M2.5 6.2 4.8 8.5 9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className={styles.rowLabel}>{option.label}</span>
                  {index === options.length - 1 ? <span className={styles.tag}>Latest</span> : null}
                </button>
              );
            })}
          </div>

          <div className={styles.footer}>
            <div className={styles.footerText}>
              <span>{summary}</span>
              {selected.length > 1 && !isContiguous ? (
                <span className={styles.warn}>Skipped weeks are left out of the totals.</span>
              ) : (
                <span className={styles.hint}>Shift-click to pick a run of weeks.</span>
              )}
            </div>
            <div className={styles.footerActions}>
              <button type="button" className={styles.linkBtn} onClick={() => onChange([])}>
                Clear
              </button>
              <button type="button" className={styles.doneBtn} onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
