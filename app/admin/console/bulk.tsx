'use client';

// =============================================================================
// Admin Console — the pieces every list shares for filtering and bulk editing:
// a selection that follows the visible rows, a tick box with a "some" state, a
// filter dropdown that looks like the console's chips, and the action bar that
// slides up while rows are selected.
// =============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { BulkResult } from '@/lib/actions/platform-bulk';

// ── Running a bulk action ───────────────────────────────────────────────────

/** Runs one bulk server action, then refreshes the console's data. */
export function useBulkRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  // The result line fades out on its own after a few seconds.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.error ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [note]);

  const run = (fn: () => Promise<BulkResult>, success: (updated: number) => string, after?: () => void) => {
    setNote(null);
    start(async () => {
      try {
        const r = await fn();
        if (r.error) {
          setNote({ text: r.error, error: true });
          return;
        }
        setNote({ text: success(r.updated ?? 0) });
        after?.();
        router.refresh();
      } catch {
        setNote({ text: 'Something went wrong — nothing may have changed. Refresh and try again.', error: true });
      }
    });
  };

  return {
    busy,
    message: note && !note.error ? note.text : undefined,
    error: note?.error ? note.text : undefined,
    run,
    say: (text: string) => setNote({ text }),
  };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── Selection ───────────────────────────────────────────────────────────────

export interface Selection {
  /** Selected ids that are still visible (filters hide rows → they drop out). */
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Select every visible row, or clear when they are all selected already. */
  toggleAll: () => void;
  clear: () => void;
  all: boolean;
  some: boolean;
}

export function useSelection(visibleIds: string[]): Selection {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const ids = useMemo(() => visibleIds.filter((id) => picked.has(id)), [visibleIds, picked]);
  const all = visibleIds.length > 0 && ids.length === visibleIds.length;

  const toggle = useCallback((id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setPicked(new Set()), []);
  const toggleAll = useCallback(() => {
    setPicked((cur) => {
      const allPicked = visibleIds.length > 0 && visibleIds.every((id) => cur.has(id));
      return allPicked ? new Set([...cur].filter((id) => !visible.has(id))) : new Set([...cur, ...visibleIds]);
    });
  }, [visibleIds, visible]);

  return { ids, count: ids.length, has: (id) => picked.has(id) && visible.has(id), toggle, toggleAll, clear, all, some: ids.length > 0 && !all };
}

// ── Tick box ────────────────────────────────────────────────────────────────

export function Check({ checked, indeterminate, onChange, label }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        width: 18, height: 18, flexShrink: 0, padding: 0, borderRadius: 5, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line-2)'}`,
        background: on ? 'var(--accent)' : 'var(--bg-1)', color: '#fff',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      {indeterminate ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      ) : checked ? (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.8 5.2 4 7.3 8.2 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : null}
    </button>
  );
}

// ── Filter dropdown ─────────────────────────────────────────────────────────

export interface FilterOption { value: string; label: string; count?: number }

/** A native <select> dressed as a chip: "Plan: Pro ▾". '' means "any". */
export function FilterSelect({ label, value, options, onChange, anyLabel = 'Any' }: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  anyLabel?: string;
}) {
  const active = value !== '';
  const current = options.find((o) => o.value === value);
  return (
    <label
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 26px 6px 11px',
        borderRadius: 7, fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer',
        background: active ? 'var(--accent-soft)' : 'var(--bg-1)',
        border: `1px solid ${active ? 'var(--accent-line)' : 'var(--line-1)'}`,
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }}>{label}:</span>
      <span style={{ fontWeight: active ? 500 : 400 }}>{current ? current.label : anyLabel}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', marginTop: -5, opacity: 0.7 }}>
        <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', fontSize: 16 }}
      >
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}{o.count != null ? ` (${o.count})` : ''}</option>
        ))}
      </select>
    </label>
  );
}

export const clearBtn: CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 12.5, fontFamily: 'inherit',
  cursor: 'pointer', padding: '6px 4px', textDecoration: 'underline', textUnderlineOffset: 3,
};

/** The row of filters above a list, with "Clear filters" when any is set. */
export function FilterRow({ children, active, onClear, right }: { children: ReactNode; active: boolean; onClear: () => void; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, minWidth: 0 }}>
      {children}
      {active && <button type="button" onClick={onClear} style={clearBtn}>Clear filters</button>}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

// ── Bulk action bar ─────────────────────────────────────────────────────────

export const bulkBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'var(--bg-2)',
  border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 12.5,
  fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
};
export const bulkBtnDanger: CSSProperties = { ...bulkBtn, color: 'var(--neg)', borderColor: 'var(--neg-soft)' };

/**
 * Sticks to the bottom of the page while rows are selected. `message` is the
 * result of the last action ("Updated 7 operators"), `error` a failure.
 */
export function BulkBar({ count, noun, onClear, busy, message, error, children }: {
  count: number;
  noun: [string, string];
  onClear: () => void;
  busy?: boolean;
  message?: string;
  error?: string;
  children: ReactNode;
}) {
  if (count === 0 && !message && !error) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      style={{
        position: 'sticky', bottom: 12, zIndex: 15, marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 11,
        boxShadow: '0 10px 30px rgba(0,0,0,0.28)', opacity: busy ? 0.75 : 1, transition: 'opacity 120ms ease',
      }}
    >
      {count > 0 ? (
        <>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginRight: 4, whiteSpace: 'nowrap' }}>
            {count} {count === 1 ? noun[0] : noun[1]} selected
          </span>
          {children}
          <button type="button" onClick={onClear} style={{ ...clearBtn, marginLeft: 'auto' }} disabled={busy}>Deselect</button>
        </>
      ) : null}
      {(message || error) && (
        <span role="status" style={{ fontSize: 12.5, color: error ? 'var(--neg)' : 'var(--pos)', width: count > 0 ? '100%' : undefined }}>
          {error || message}
        </span>
      )}
    </div>
  );
}

/** A small menu of choices inside the bulk bar ("Change plan ▾"). */
export function BulkMenu({ label, options, onPick, disabled }: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ ...bulkBtn, position: 'relative', paddingRight: 24, opacity: disabled ? 0.6 : 1 }}>
      {label}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ position: 'absolute', right: 9, top: '50%', marginTop: -5, opacity: 0.7 }}>
        <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        aria-label={label}
        value=""
        disabled={disabled}
        onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', fontSize: 16 }}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Copy to the clipboard, falling back to a hidden textarea on older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** "Signed up" windows shared by the operator lists. */
export const SINCE_OPTIONS: FilterOption[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'older', label: 'Over 90 days ago' },
];

export function inSince(iso: string | null | undefined, since: string, now: number): boolean {
  if (!since) return true;
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return false;
  const days = (now - t) / 86_400_000;
  return since === 'older' ? days > 90 : days <= Number(since);
}
