'use client';

// =============================================================================
// Admin Console → Analytics: shared building blocks — number formatting, the
// card / tab / ranked-list / KPI primitives and table styles used by
// AnalyticsPage.tsx and AnalyticsInsights.tsx, so every tab looks the same.
// =============================================================================

import { useState, type CSSProperties, type ReactNode } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';

const Icon = FleetIcon;

// ── Formatting ────────────────────────────────────────────────────────────────
export const fmtNum = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toLocaleString('en-GB');
};
export const fmtPct = (x: number) => {
  if (!Number.isFinite(x)) return '—';
  const p = x * 100;
  return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p).toString()) + '%';
};
export const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
export const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const languageNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
export const countryName = (code: string | null | undefined) => {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};
export const flag = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐';
export const languageName = (code: string) => {
  if (code === 'unknown') return 'Unknown';
  try {
    return languageNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

// ── Primitives (same look as the rest of the console) ─────────────────────────
export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', minWidth: 0, ...style }}>{children}</div>
);
export const CardHeader = ({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 8, maxWidth: '100%', overflowX: 'auto' }}>
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}
          style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            background: value === id ? 'var(--bg-3)' : 'transparent', color: value === id ? 'var(--text-1)' : 'var(--text-3)' }}>
          {label}
        </button>
      ))}
    </div>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => (
  <div style={{ padding: '26px 18px', fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.55 }}>{children}</div>
);

export interface Column<R> { label: string; width: number; render: (r: R) => ReactNode; title?: string }

/** Ranked list with a soft bar behind each row; click a row to filter by it. */
export function BarList<R>({ rows, label, name, value, columns, onSelect, empty, keyOf }: {
  rows: R[];
  label: string;
  name: (r: R) => ReactNode;
  value: (r: R) => number;
  columns: Column<R>[];
  onSelect?: (r: R) => void;
  empty: ReactNode;
  keyOf: (r: R) => string;
}) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map(value), 1);
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div style={{ padding: '0 10px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 6px', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
        <span style={{ flex: 1 }}>{label}</span>
        {columns.map((c) => <span key={c.label} title={c.title} style={{ width: c.width, textAlign: 'right', flexShrink: 0 }}>{c.label}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: all ? 420 : undefined, overflowY: all ? 'auto' : undefined }}>
        {shown.map((r) => {
          const w = (value(r) / max) * 100;
          const inner = (
            <>
              <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${Math.max(w, 1.5)}%`, background: 'var(--accent-soft)', borderRadius: 6 }} />
              <span style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name(r)}</span>
              {columns.map((c) => (
                <span key={c.label} className="mono tnum" style={{ position: 'relative', width: c.width, flexShrink: 0, textAlign: 'right', fontSize: 12.5, color: 'var(--text-2)' }}>{c.render(r)}</span>
              ))}
            </>
          );
          const rowStyle: CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, minHeight: 32, width: '100%', border: 'none', background: 'transparent', textAlign: 'left', fontFamily: 'inherit' };
          return onSelect ? (
            <button key={keyOf(r)} className="an-row" style={{ ...rowStyle, cursor: 'pointer' }} onClick={() => onSelect(r)} title="Filter the whole page by this">{inner}</button>
          ) : (
            <div key={keyOf(r)} style={rowStyle}>{inner}</div>
          );
        })}
      </div>
      {rows.length > 8 && (
        <button onClick={() => setAll((v) => !v)} style={{ marginTop: 6, marginLeft: 8, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

// ── KPI tiles ─────────────────────────────────────────────────────────────────
export function Delta({ cur, prev, upIsGood = true, asPoints = false }: { cur: number; prev: number; upIsGood?: boolean; asPoints?: boolean }) {
  let text: string;
  let dir: 0 | 1 | -1;
  if (asPoints) {
    const d = (cur - prev) * 100;
    dir = Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1;
    text = `${d > 0 ? '+' : ''}${d.toFixed(1)} pts`;
  } else if (prev === 0) {
    dir = cur > 0 ? 1 : 0;
    text = cur > 0 ? 'new' : '—';
  } else {
    const d = ((cur - prev) / prev) * 100;
    dir = Math.abs(d) < 0.5 ? 0 : d > 0 ? 1 : -1;
    text = `${d > 0 ? '+' : ''}${Math.abs(d) >= 100 ? Math.round(d) : d.toFixed(1)}%`;
  }
  const good = dir === 0 ? null : (dir === 1) === upIsGood;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, padding: '2px 6px', borderRadius: 4, fontFamily: 'Geist Mono, monospace',
      whiteSpace: 'nowrap', flexShrink: 0,
      background: good === null ? 'var(--bg-3)' : good ? 'var(--pos-soft)' : 'var(--neg-soft)',
      color: good === null ? 'var(--text-2)' : good ? 'var(--pos)' : 'var(--neg)',
    }}>
      {dir === 1 && <Icon name="arrow-up" size={10} stroke={2.4} />}
      {dir === -1 && <Icon name="arrow-down" size={10} stroke={2.4} />}
      {text}
    </span>
  );
}

export function Kpi({ label, value, delta, sub, active, onClick, hint }: { label: string; value: string; delta: ReactNode; sub?: string; active?: boolean; onClick?: () => void; hint: string }) {
  const style: CSSProperties = {
    position: 'relative', padding: '14px 16px 13px', background: 'var(--bg-1)', borderRadius: 'var(--radius)', textAlign: 'left', fontFamily: 'inherit', minWidth: 0,
    border: `1px solid ${active ? 'var(--accent-line)' : 'var(--line-1)'}`, cursor: onClick ? 'pointer' : 'default',
  };
  const body = (
    <>
      {active && <span style={{ position: 'absolute', top: 0, left: 0, width: 28, height: 2, background: 'var(--accent)', borderRadius: '0 0 2px 0' }} />}
      <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ marginTop: 9, fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        {delta}
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>}
      </div>
    </>
  );
  return onClick ? (
    <button style={style} onClick={onClick} aria-pressed={active} title={hint}>{body}</button>
  ) : (
    <div style={style} title={hint}>{body}</div>
  );
}

// ── Ordered funnel bars ───────────────────────────────────────────────────────
export interface FunnelRow { key: string; title: string; hint?: string; value: number }

/** Bars for an ordered funnel; the step that loses the most people is flagged. `unit` is singular. */
export function StepBars({ rows, unit }: { rows: FunnelRow[]; unit: string }) {
  const base = rows[0]?.value ?? 0;
  let worst = -1;
  let worstLoss = 0;
  rows.forEach((r, i) => {
    const loss = i > 0 ? rows[i - 1].value - r.value : 0;
    if (loss > worstLoss) { worstLoss = loss; worst = i; }
  });
  return (
    <div style={{ padding: '2px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => {
        const prev = i > 0 ? rows[i - 1].value : 0;
        const lost = prev - r.value;
        return (
          <div key={r.key} title={r.hint}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-1)', display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {r.title}
                {i === worst && worstLoss > 0 && (
                  <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 99, background: 'var(--warn-soft)', color: 'var(--warn)', whiteSpace: 'nowrap' }}>biggest drop</span>
                )}
              </span>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{r.value.toLocaleString('en-GB')}</span>
                <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-3)', width: 44, textAlign: 'right' }}>{i === 0 ? '100%' : fmtPct(ratio(r.value, base))}</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${base ? Math.min(100, Math.max((r.value / base) * 100, r.value ? 1.5 : 0)) : 0}%`, height: '100%', background: i === worst && worstLoss > 0 ? 'var(--warn)' : 'var(--accent)', borderRadius: 4 }} />
            </div>
            {i > 0 && prev > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4 }}>
                {fmtPct(ratio(r.value, prev))} of the step before{lost > 0 ? ` · ${lost.toLocaleString('en-GB')} ${unit}${lost === 1 ? '' : 's'} stopped here` : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const Stat = ({ value, label }: { value: string; label: ReactNode }) => (
  <div>
    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-1)' }}>{value}</div>
    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>{label}</div>
  </div>
);
export const whenShort = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const agoShort = (iso: string | null) => {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

// ── Table + chip styles ───────────────────────────────────────────────────────
export const chip: CSSProperties = { padding: '5px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' };
export const chipActive: CSSProperties = { background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)' };
export const th: CSSProperties = { fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '10px 18px', textAlign: 'left', whiteSpace: 'nowrap' };
export const td: CSSProperties = { padding: '10px 18px', verticalAlign: 'top', fontSize: 12.5, color: 'var(--text-2)' };
