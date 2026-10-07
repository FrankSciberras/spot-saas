'use client';

// =============================================================================
// Admin Console → Analytics: who visits rovora.eu, where they come from, and
// which visits turn into signups. Data: /api/admin/analytics (platform admin
// only), backed by analytics_dashboard() — see
// supabase/migrations/20261007_web_analytics.sql for how everything is counted.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import FleetIcon from '@/components/fleet/FleetIcon';
import { HEARD_ABOUT_OPTIONS } from '@/lib/analytics/constants';

const Icon = FleetIcon;

// ── Data shapes (mirror analytics_dashboard / analytics_realtime) ─────────────
interface Row {
  name: string;
  extra?: string;
  visitors: number;
  visits: number;
  bounces?: number;
  engaged_ms?: number;
  signups?: number;
  leads?: number;
}
interface PageRow { name: string; visitors: number; pageviews: number; avg_engaged_ms: number; avg_scroll: number }
interface EventRow { name: string; label: string | null; visitors: number; count: number }
interface Totals { visitors: number; visits: number; pageviews: number; bounces: number; engaged_ms: number; signups: number; leads: number }
type SeriesValues = Pick<Totals, 'visitors' | 'visits' | 'pageviews' | 'signups' | 'leads'>;
interface SeriesPoint extends SeriesValues { t: string; prev: (SeriesValues & { t: string }) | null }
interface Conversion {
  at: string;
  type: 'Signup' | 'Lead';
  props: { org_id?: string; plan?: string; heard?: string | null; form?: string; topic?: string; fleet_size?: string | null };
  consented: boolean;
  tracked: boolean;
  channel: string | null;
  source: string | null;
  referrer: string | null;
  campaign: string | null;
  entry: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  first_at: string | null;
  first_channel: string | null;
  first_source: string | null;
  first_campaign: string | null;
  first_entry: string | null;
  visits_before: number;
  pageviews_before: number;
}
interface Dashboard {
  kpis: { current: Totals; previous: Totals };
  series: SeriesPoint[];
  channels: Row[];
  sources: Row[];
  referrers: Row[];
  campaigns: Row[];
  pages: PageRow[];
  entry_pages: Row[];
  exit_pages: Row[];
  countries: Row[];
  regions: Row[];
  cities: Row[];
  devices: Row[];
  browsers: Row[];
  os: Row[];
  languages: Row[];
  events: EventRow[];
  funnel: { key: 'visited' | 'pricing' | 'started' | 'signed_up'; visitors: number }[];
  heatmap: { dow: number; hour: number; visitors: number }[];
  loyalty: { consented_visitors: number; returning: number };
  consent: { granted: number; denied: number };
  conversions: Conversion[];
  has_data: boolean;
  bucket: Bucket;
  orgs: Record<string, { name: string; plan: string | null; status: string | null }>;
  ignored: boolean;
}
interface Live { visitors: number; pages: { name: string; visitors: number }[]; sources: { name: string; visitors: number }[]; countries: { name: string; visitors: number }[]; minutes: number[] }

type Bucket = 'hour' | 'day' | 'week' | 'month';
type RangeId = 'today' | '7d' | '30d' | '90d' | '12m';
type Metric = 'visitors' | 'visits' | 'pageviews' | 'signups' | 'leads';
type Filters = Record<string, string>;

// ── Date ranges (in the admin's own time zone) ────────────────────────────────
const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '12m', label: '12M' },
];

function rangeFor(id: RangeId) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = (n: number) => new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - n);
  switch (id) {
    case 'today':
      return { from: midnight, to: now, prevFrom: daysBack(1), bucket: 'hour' as Bucket, compare: 'yesterday to this time' };
    case '7d':
      return { from: daysBack(6), to: now, prevFrom: daysBack(13), bucket: 'day' as Bucket, compare: 'the 7 days before' };
    case '30d':
      return { from: daysBack(29), to: now, prevFrom: daysBack(59), bucket: 'day' as Bucket, compare: 'the 30 days before' };
    case '90d':
      return { from: daysBack(89), to: now, prevFrom: daysBack(179), bucket: 'week' as Bucket, compare: 'the 90 days before' };
    case '12m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { from, to: now, prevFrom: new Date(from.getFullYear() - 1, from.getMonth(), 1), bucket: 'month' as Bucket, compare: 'the 12 months before' };
    }
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────
const fmtNum = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(0) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toLocaleString('en-GB');
};
const fmtPct = (x: number) => {
  if (!Number.isFinite(x)) return '—';
  const p = x * 100;
  return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p).toString()) + '%';
};
const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const languageNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
const countryName = (code: string | null | undefined) => {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};
const flag = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐';
const languageName = (code: string) => {
  if (code === 'unknown') return 'Unknown';
  try {
    return languageNames?.of(code) ?? code;
  } catch {
    return code;
  }
};
const HEARD_LABEL: Record<string, string> = Object.fromEntries(HEARD_ABOUT_OPTIONS.map((o) => [o.id, o.label]));

/** Parse the SQL bucket label ("YYYY-MM-DDTHH:MM:SS", already local time). */
const parseLocal = (t: string) => {
  const [d, time = '00:00:00'] = t.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, day, h, mi);
};
const axisLabel = (t: string, bucket: Bucket, spansYears: boolean) => {
  const d = parseLocal(t);
  if (bucket === 'hour') return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (bucket === 'month') return d.toLocaleDateString('en-GB', spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const longLabel = (t: string, bucket: Bucket) => {
  const d = parseLocal(t);
  if (bucket === 'hour') {
    const end = new Date(d.getTime() + 3_600_000);
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (bucket === 'week') return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (bucket === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const CHANNEL_HINT: Record<string, string> = {
  Direct: 'Typed the address, used a bookmark, or the link hid where it came from',
  'Organic Search': 'Unpaid results on Google, Bing, DuckDuckGo…',
  'Paid Search': 'Search ads (Google Ads, Microsoft Ads) or cpc-tagged links',
  'AI Assistants': 'ChatGPT, Perplexity, Claude, Gemini, Copilot…',
  'Organic Social': 'Posts and shares on Facebook, LinkedIn, Instagram, X, WhatsApp…',
  'Paid Social': 'Social ads, or links tagged as paid social',
  Email: 'Webmail, mail apps, or links tagged utm_medium=email',
  Referral: 'A link on another website',
  Display: 'Banner / display advertising',
  Video: 'YouTube, Vimeo and other video sites',
  Affiliate: 'Affiliate links',
  Other: 'Tagged links that don’t match any channel',
};
const FILTER_LABEL: Record<string, string> = {
  channel: 'Channel', source: 'Source', referrer: 'Referrer', campaign: 'Campaign', country: 'Country',
  region: 'Region', city: 'City', device: 'Device', browser: 'Browser', os: 'OS', language: 'Language',
  entry: 'Entry page', exit: 'Exit page', page: 'Page',
};
const filterValueLabel = (k: string, v: string) => (k === 'country' ? countryName(v) : k === 'language' ? languageName(v) : v);

// ── Primitives (same look as the rest of the console) ─────────────────────────
const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', minWidth: 0, ...style }}>{children}</div>
);
const CardHeader = ({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);
function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
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
const Empty = ({ children }: { children: ReactNode }) => (
  <div style={{ padding: '26px 18px', fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.55 }}>{children}</div>
);

interface Column<R> { label: string; width: number; render: (r: R) => ReactNode; title?: string }

/** Ranked list with a soft bar behind each row; click a row to filter by it. */
function BarList<R>({ rows, label, name, value, columns, onSelect, empty, keyOf }: {
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
function Delta({ cur, prev, upIsGood = true, asPoints = false }: { cur: number; prev: number; upIsGood?: boolean; asPoints?: boolean }) {
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

function Kpi({ label, value, delta, sub, active, onClick, hint }: { label: string; value: string; delta: ReactNode; sub?: string; active?: boolean; onClick?: () => void; hint: string }) {
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

// ── Trend chart (one measure; the comparison period as a quiet grey line) ────
function niceTicks(max: number): number[] {
  const top = Math.max(max, 1);
  const raw = top / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? p * 10);
  const end = Math.ceil(top / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= end + 1e-9; v += step) out.push(v);
  return out;
}

function TrendChart({ series, metric, bucket, compareLabel }: { series: SeriesPoint[]; metric: Metric; bucket: Bucket; compareLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so axis text stays legible on a phone.
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(960);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 600 ? 210 : 250, padL = 40, padR = 12, padT = 14, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const cur = series.map((p) => p[metric]);
  const prev = series.map((p) => (p.prev ? p.prev[metric] : null));
  const ticks = niceTicks(Math.max(...cur, ...prev.map((v) => v ?? 0), 0));
  const top = ticks[ticks.length - 1] || 1;
  const n = series.length;
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => padT + ih - (v / top) * ih;
  const line = (vals: (number | null)[]) =>
    vals.map((v, i) => (v == null ? '' : `${i === 0 || vals[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  const curPath = line(cur);
  // The newest bucket is still filling up (it contains "now"), so it's drawn
  // dashed instead of looking like a sudden drop.
  const settledPath = n > 1 ? line(cur.slice(0, n - 1)) : curPath;
  const openPath = n > 1 ? `M${x(n - 2).toFixed(1)},${y(cur[n - 2]).toFixed(1)} L${x(n - 1).toFixed(1)},${y(cur[n - 1]).toFixed(1)}` : '';
  const area = n > 0 ? `${curPath} L${x(n - 1).toFixed(1)},${padT + ih} L${x(0).toFixed(1)},${padT + ih} Z` : '';
  const spansYears = n > 0 && parseLocal(series[0].t).getFullYear() !== parseLocal(series[n - 1].t).getFullYear();
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 120))));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - padL) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover != null ? series[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max((x(hover) / W) * 100, 12), 88) : 0;

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${metric} over time`}>
        <defs>
          <linearGradient id="anArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">{fmtNum(t)}</text>
          </g>
        ))}
        {series.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2) ? (
          <text key={p.t} x={x(i)} y={H - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">
            {axisLabel(p.t, bucket, spansYears)}
          </text>
        ) : null)}
        <path d={line(prev)} fill="none" stroke="var(--text-4)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={area} fill="url(#anArea)" />
        <path d={settledPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {openPath && <path d={openPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" />}
        {n === 1 && <circle cx={x(0)} cy={y(cur[0])} r="4" fill="var(--accent)" />}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--chart-cursor)" />
            {prev[hover] != null && <circle cx={x(hover)} cy={y(prev[hover]!)} r="3.5" fill="var(--text-4)" stroke="var(--bg-1)" strokeWidth="2" />}
            <circle cx={x(hover)} cy={y(cur[hover])} r="4.5" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div style={{ position: 'absolute', top: 6, left: `${tipLeft}%`, transform: 'translateX(-50%)', pointerEvents: 'none', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '8px 11px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', minWidth: 170, zIndex: 2 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>{longLabel(h.t, bucket)}{hover === n - 1 ? ' · so far' : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 12, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
            <span className="mono tnum" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{h[metric].toLocaleString('en-GB')}</span>
            <span style={{ color: 'var(--text-3)' }}>this period</span>
          </div>
          {h.prev && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginTop: 3 }}>
              <span style={{ width: 12, height: 2, background: 'var(--text-4)', borderRadius: 1 }} />
              <span className="mono tnum" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{h.prev[metric].toLocaleString('en-GB')}</span>
              <span style={{ color: 'var(--text-3)' }}>{longLabel(h.prev.t, bucket)}</span>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px 16px', padding: '4px 0 0', fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, background: 'var(--accent)', borderRadius: 1 }} />This period <span style={{ color: 'var(--text-4)' }}>(dashed = still in progress)</span></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, background: 'var(--text-4)', borderRadius: 1 }} />Compared with {compareLabel}</span>
      </div>
    </div>
  );
}

function SeriesTable({ series, bucket }: { series: SeriesPoint[]; bucket: Bucket }) {
  return (
    <div style={{ maxHeight: 300, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{['Period', 'Visitors', 'Visits', 'Pageviews', 'Signups', 'Leads'].map((h, i) => (
            <th key={h} style={{ ...th, textAlign: i === 0 ? 'left' : 'right', position: 'sticky', top: 0, background: 'var(--bg-1)' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {[...series].reverse().map((p) => (
            <tr key={p.t} style={{ borderTop: '1px solid var(--line-1)' }}>
              <td style={td}>{longLabel(p.t, bucket)}</td>
              {(['visitors', 'visits', 'pageviews', 'signups', 'leads'] as const).map((k) => (
                <td key={k} className="mono tnum" style={{ ...td, textAlign: 'right' }}>{p[k].toLocaleString('en-GB')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── When people visit: weekday × hour ─────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function Heatmap({ cells }: { cells: Dashboard['heatmap'] }) {
  const [hover, setHover] = useState<{ dow: number; hour: number; v: number } | null>(null);
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const c of cells) g[c.dow - 1][c.hour] = c.visitors;
    return g;
  }, [cells]);
  const max = Math.max(1, ...cells.map((c) => c.visitors));
  // Five ordered steps of the accent over the card surface — one hue, dim → bright.
  const step = (v: number) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const shade = (s: number) => (s === 0 ? 'var(--bg-2)' : `color-mix(in srgb, var(--accent) ${[0, 18, 34, 52, 74, 100][s]}%, var(--bg-2))`);
  const busiest = useMemo(() => {
    let best = { dow: 0, hour: 0, v: 0 };
    grid.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { dow: d, hour: h, v }; }));
    return best;
  }, [grid]);

  if (cells.length === 0) return <Empty>No visits in this period yet.</Empty>;
  return (
    <div style={{ padding: '0 18px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '30px repeat(24, minmax(0, 1fr))', gap: 2, alignItems: 'center' }}>
        {grid.map((row, d) => (
          <div key={d} style={{ display: 'contents' }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{DAYS[d]}</span>
            {row.map((v, hr) => (
              <span key={hr} tabIndex={0} aria-label={`${DAYS[d]} ${String(hr).padStart(2, '0')}:00 — ${v} visitors`}
                onPointerEnter={() => setHover({ dow: d, hour: hr, v })} onFocus={() => setHover({ dow: d, hour: hr, v })}
                onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
                style={{ aspectRatio: '1 / 1', borderRadius: 3, background: shade(step(v)), outline: hover?.dow === d && hover.hour === hr ? '1.5px solid var(--text-1)' : 'none', outlineOffset: -1 }} />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, hr) => (
          <span key={hr} style={{ fontSize: 9.5, color: 'var(--text-4)', textAlign: 'center', fontFamily: 'Geist Mono, monospace' }}>{hr % 6 === 0 ? String(hr).padStart(2, '0') : ''}</span>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)', minHeight: 18 }}>
          {hover
            ? <><strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{hover.v.toLocaleString('en-GB')}</strong> visitors · {DAYS[hover.dow]} {String(hover.hour).padStart(2, '0')}:00–{String((hover.hour + 1) % 24).padStart(2, '0')}:00</>
            : <>Busiest: <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>{DAYS[busiest.dow]} {String(busiest.hour).padStart(2, '0')}:00–{String((busiest.hour + 1) % 24).padStart(2, '0')}:00</strong> · {busiest.v} visitors</>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--text-3)' }}>
          Fewer {[1, 2, 3, 4, 5].map((s) => <span key={s} style={{ width: 10, height: 10, borderRadius: 2, background: shade(s) }} />)} More
        </span>
      </div>
    </div>
  );
}

// ── Path to signup ────────────────────────────────────────────────────────────
const FUNNEL_LABEL: Record<Dashboard['funnel'][number]['key'], { title: string; hint: string }> = {
  visited: { title: 'Visited the site', hint: 'Unique visitors in this period' },
  pricing: { title: 'Viewed pricing', hint: 'Opened /pricing' },
  started: { title: 'Started sign-up', hint: 'Clicked “Start free trial” or began the sign-up form' },
  signed_up: { title: 'Created a fleet', hint: 'Finished onboarding — a new Rovora account' },
};
function Funnel({ steps }: { steps: Dashboard['funnel'] }) {
  const base = steps[0]?.visitors ?? 0;
  return (
    <div style={{ padding: '2px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].visitors : 0;
        return (
          <div key={s.key} title={FUNNEL_LABEL[s.key].hint}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{FUNNEL_LABEL[s.key].title}</span>
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{s.visitors.toLocaleString('en-GB')}</span>
                <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-3)', width: 44, textAlign: 'right' }}>{i === 0 ? '100%' : fmtPct(ratio(s.visitors, base))}</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${base ? Math.max((s.visitors / base) * 100, s.visitors ? 1.5 : 0) : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, opacity: 1 - i * 0.12 }} />
            </div>
            {i > 0 && prev > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4 }}>{fmtPct(ratio(s.visitors, prev))} of the step before</div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>Each step counts unique visitors who did it in this period — they don’t have to go in order.</div>
    </div>
  );
}

// ── Live ──────────────────────────────────────────────────────────────────────
function LiveCard({ live }: { live: Live | null }) {
  const mins = live?.minutes ?? [];
  const max = Math.max(1, ...mins);
  return (
    <Card>
      <CardHeader title="Right now" subtitle="Visitors active in the last 5 minutes"
        right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)' }}><span className="an-pulse" />Live</span>} />
      <div style={{ padding: '0 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--text-1)', lineHeight: 1 }}>{live ? live.visitors.toLocaleString('en-GB') : '—'}</div>
          <div aria-label="Page views per minute, last 30 minutes" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 38, flex: 1, maxWidth: 180 }}>
            {mins.map((v, i) => (
              <span key={i} title={`${v} page views, ${mins.length - i - 1 === 0 ? 'this minute' : `${mins.length - i - 1} min ago`}`}
                style={{ flex: 1, height: `${v ? Math.max((v / max) * 100, 8) : 4}%`, background: v ? 'var(--accent)' : 'var(--bg-3)', borderRadius: '2px 2px 0 0', opacity: v ? 0.85 : 1 }} />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-4)', textAlign: 'right', marginTop: 4 }}>page views / minute · last 30 min</div>
        {live && live.visitors > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LiveList title="On" rows={live.pages.map((p) => ({ k: p.name, v: p.visitors, node: <span className="mono" style={{ fontSize: 12 }}>{p.name}</span> }))} />
            <LiveList title="From" rows={live.sources.map((p) => ({ k: p.name, v: p.visitors, node: p.name }))} />
            <LiveList title="Where" rows={live.countries.map((p) => ({ k: p.name || '?', v: p.visitors, node: <>{flag(p.name)} {countryName(p.name)}</> }))} />
          </div>
        )}
      </div>
    </Card>
  );
}
const LiveList = ({ title, rows }: { title: string; rows: { k: string; v: number; node: ReactNode }[] }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <span style={{ width: 38, flexShrink: 0, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-4)', paddingTop: 2 }}>{title}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
      {rows.slice(0, 4).map((r) => (
        <span key={r.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 5, padding: '2px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.node}<span className="mono" style={{ color: 'var(--text-4)' }}>{r.v}</span>
        </span>
      ))}
    </div>
  </div>
);

// ── Signups & leads, with where each one came from ───────────────────────────
function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
function ConversionsTable({ rows, orgs }: { rows: Conversion[]; orgs: Dashboard['orgs'] }) {
  const [type, setType] = useState<'all' | 'Signup' | 'Lead'>('all');
  const [limit, setLimit] = useState(10);
  const matching = rows.filter((r) => type === 'all' || r.type === type);
  const shown = matching.slice(0, limit);
  const counts = { all: rows.length, Signup: rows.filter((r) => r.type === 'Signup').length, Lead: rows.filter((r) => r.type === 'Lead').length };
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title="Signups & leads" subtitle="Every conversion in this period, and the visit that brought it in"
        right={<Tabs tabs={[['all', `All ${counts.all}`], ['Signup', `Signups ${counts.Signup}`], ['Lead', `Leads ${counts.Lead}`]]} value={type} onChange={setType} />} />
      {shown.length === 0 ? (
        <Empty>No {type === 'Lead' ? 'leads' : type === 'Signup' ? 'signups' : 'signups or leads'} in this period yet. New fleets and contact-form or chat enquiries appear here with the channel that brought them.</Empty>
      ) : (
        <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>{['When', 'Who', 'Came from', 'First visit', 'Landed on', 'Where', 'Told us'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((c, i) => {
                const org = c.props.org_id ? orgs[c.props.org_id] : undefined;
                const firstDays = c.first_at ? daysBetween(c.first_at, c.at) : 0;
                return (
                  <tr key={`${c.at}-${i}`} style={{ borderTop: '1px solid var(--line-1)' }}>
                    <td style={td}>
                      <div style={{ fontSize: 12.5, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(c.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td style={td}>
                      {c.type === 'Signup' ? (
                        <>
                          {org && c.props.org_id
                            ? <Link href={`/admin/operators/${c.props.org_id}`} style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, textDecoration: 'none' }} className="an-link">{org.name}</Link>
                            : <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.props.org_id ? 'Deleted fleet' : 'New fleet'}</span>}
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Signup · {c.props.plan === 'trial' || !c.props.plan ? 'trial' : c.props.plan}</div>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.props.form === 'chat' ? 'Chat lead' : 'Contact form'}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Lead{c.props.topic ? ` · ${c.props.topic}` : ''}{c.props.fleet_size ? ` · ${c.props.fleet_size} vehicles` : ''}</div>
                        </>
                      )}
                    </td>
                    <td style={td}>
                      {c.tracked ? (
                        <>
                          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.source ?? 'Direct'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.channel}{c.campaign ? ` · ${c.campaign}` : ''}</div>
                        </>
                      ) : (
                        <span style={{ fontSize: 12.5, color: 'var(--text-4)' }} title="We never saw this visitor browse — an ad blocker, or they came back on another device">Not tracked</span>
                      )}
                    </td>
                    <td style={td}>
                      {!c.tracked || !c.first_at ? <span style={{ color: 'var(--text-4)' }}>—</span>
                        : c.visits_before <= 1 ? <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Same visit</span>
                          : (
                            <>
                              <div style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.first_source ?? 'Direct'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{firstDays <= 0 ? 'earlier that day' : `${firstDays} day${firstDays === 1 ? '' : 's'} before`} · {c.visits_before} visits</div>
                            </>
                          )}
                    </td>
                    <td style={td}><span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.entry ?? '—'}</span></td>
                    <td style={td}>
                      {c.tracked ? (
                        <>
                          <div style={{ fontSize: 12.5, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{flag(c.country)} {countryName(c.country)}{c.city ? ` · ${c.city}` : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{[c.device, c.browser].filter(Boolean).join(' · ')}</div>
                        </>
                      ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                    </td>
                    <td style={td}><span style={{ fontSize: 12.5, color: c.props.heard ? 'var(--text-1)' : 'var(--text-4)' }}>{c.props.heard ? HEARD_LABEL[c.props.heard] ?? c.props.heard : '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {matching.length > limit && (
            <div style={{ padding: '10px 18px 14px', borderTop: '1px solid var(--line-1)' }}>
              <button onClick={() => setLimit((l) => l + 25)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                Show more ({matching.length - limit} left)
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── The page ──────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [rangeId, setRangeId] = useState<RangeId>('30d');
  const [filters, setFilters] = useState<Filters>({});
  const [metric, setMetric] = useState<Metric>('visitors');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState<{ message: string; setup?: boolean } | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [ignored, setIgnored] = useState<boolean | null>(null);
  const [savingIgnore, setSavingIgnore] = useState(false);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
  const [srcTab, setSrcTab] = useState<'channels' | 'sources' | 'referrers' | 'campaigns'>('channels');
  const [pageTab, setPageTab] = useState<'pages' | 'entry' | 'exit'>('pages');
  const [geoTab, setGeoTab] = useState<'countries' | 'cities' | 'regions'>('countries');
  const [techTab, setTechTab] = useState<'devices' | 'browsers' | 'os' | 'languages'>('devices');

  const range = useMemo(() => rangeFor(rangeId), [rangeId]);
  const key = `${rangeId}|${JSON.stringify(filters)}`;
  const loading = key !== loadedKey;
  const latest = useRef(key);

  // Dashboard for the chosen range + filters. The previous render stays on
  // screen (dimmed) while the next one loads.
  useEffect(() => {
    latest.current = key;
    const r = rangeFor(rangeId);
    const qs = new URLSearchParams({
      from: r.from.toISOString(),
      to: r.to.toISOString(),
      prevFrom: r.prevFrom.toISOString(),
      bucket: r.bucket,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      filters: JSON.stringify(filters),
    });
    fetch(`/api/admin/analytics?${qs}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (latest.current !== key) return;
        if (!res.ok) {
          setError({ message: body.error || `Request failed (${res.status})`, setup: body.setup });
        } else {
          setError(null);
          setData(body as Dashboard);
          setIgnored((body as Dashboard).ignored);
        }
        setLoadedKey(key);
      })
      .catch(() => {
        if (latest.current !== key) return;
        setError({ message: 'Could not reach the server.' });
        setLoadedKey(key);
      });
  }, [key, rangeId, filters]);

  // Live visitors, refreshed every 20 s while this tab is visible.
  useEffect(() => {
    let stop = false;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/admin/analytics?live=1', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!stop && d) setLive(d as Live); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => { stop = true; clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const addFilter = (k: string, v: string | null | undefined) => {
    if (v == null || v === '') return;
    setFilters((f) => ({ ...f, [k]: v }));
  };
  const removeFilter = (k: string) => setFilters((f) => {
    const next = { ...f };
    delete next[k];
    return next;
  });

  const toggleIgnore = async () => {
    if (ignored === null || savingIgnore) return;
    setSavingIgnore(true);
    try {
      const res = await fetch('/api/admin/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exclude: !ignored }) });
      if (res.ok) setIgnored(((await res.json()) as { ignored: boolean }).ignored);
    } finally {
      setSavingIgnore(false);
    }
  };

  const k = data?.kpis;
  const cur = k?.current;
  const prev = k?.previous;
  const pages = useMemo(() => data?.pages ?? [], [data]);
  const pvByPath = useMemo(() => new Map(pages.map((p) => [p.name, p.pageviews])), [pages]);
  const heard = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of data?.conversions ?? []) if (c.type === 'Signup' && c.props.heard) m.set(c.props.heard, (m.get(c.props.heard) ?? 0) + 1);
    return [...m.entries()].map(([name, n]) => ({ name, visitors: n, visits: n })).sort((a, b) => b.visitors - a.visitors);
  }, [data]);
  const interactions = (data?.events ?? []).filter((e) => e.name !== 'Signup' && e.name !== 'Lead');
  const consentAnswers = (data?.consent.granted ?? 0) + (data?.consent.denied ?? 0);

  // Common BarList columns.
  const visitorsCol: Column<Row> = { label: 'Visitors', width: 64, render: (r) => fmtNum(r.visitors) };
  const signupsCol: Column<Row> = { label: 'Signups', width: 58, render: (r) => (r.signups ? fmtNum(r.signups) : <span style={{ color: 'var(--text-4)' }}>0</span>) };
  const convCol: Column<Row> = { label: 'Conv.', width: 50, title: 'Signups per visitor', render: (r) => (r.signups ? fmtPct(ratio(r.signups, r.visitors)) : <span style={{ color: 'var(--text-4)' }}>—</span>) };
  const bounceCol: Column<Row> = { label: 'Bounce', width: 54, title: 'Visits that saw one page and did nothing else', render: (r) => fmtPct(ratio(r.bounces ?? 0, r.visits)) };
  const shareCol = (total: number): Column<Row> => ({ label: 'Share', width: 50, render: (r) => fmtPct(ratio(r.visitors, total)) });

  return (
    <div style={{ padding: '0 24px 40px' }} className="pad-mobile">
      <style>{`
        .an-row:hover { background: var(--bg-2) !important; }
        .an-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .an-link:hover { color: var(--accent) !important; }
        .an-pulse { width: 7px; height: 7px; border-radius: 99px; background: var(--pos); box-shadow: 0 0 0 0 var(--pos-soft); animation: anPulse 1.8s ease-out infinite; }
        @keyframes anPulse { 0% { box-shadow: 0 0 0 0 rgba(62,207,142,0.45); } 100% { box-shadow: 0 0 0 9px rgba(62,207,142,0); } }
        @media (prefers-reduced-motion: reduce) { .an-pulse { animation: none; } }
        @media (max-width: 720px) { .an-kpis { grid-template-columns: 1fr 1fr !important; } }
      `}</style>

      {/* ── One filter row, scoping everything below ── */}
      <div style={{ padding: '20px 0 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="chips-scroll" style={{ display: 'flex', gap: 6 }} role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRangeId(r.id)} aria-pressed={rangeId === r.id}
              style={{ ...chip, ...(rangeId === r.id ? chipActive : {}) }}>{r.label}</button>
          ))}
        </div>
        {Object.entries(filters).map(([fk, fv]) => (
          <span key={fk} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 7, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', fontSize: 12, color: 'var(--text-1)', maxWidth: 320 }}>
            <span style={{ color: 'var(--text-3)' }}>{FILTER_LABEL[fk] ?? fk}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filterValueLabel(fk, fv)}</span>
            <button onClick={() => removeFilter(fk)} aria-label={`Remove ${FILTER_LABEL[fk] ?? fk} filter`} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 2 }}><Icon name="close" size={12} /></button>
          </span>
        ))}
        {Object.keys(filters).length > 1 && <button onClick={() => setFilters({})} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Clear all</button>}
        <div style={{ flex: 1 }} />
        {ignored !== null && (
          <button onClick={toggleIgnore} disabled={savingIgnore} title="Applies to this browser only"
            style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 7, color: ignored ? 'var(--text-2)' : 'var(--warn)', borderColor: ignored ? 'var(--line-1)' : 'var(--warn-soft)' }}>
            <Icon name={ignored ? 'eye' : 'warning'} size={13} />
            {ignored ? 'Your visits aren’t counted' : 'Your visits are counted — exclude this browser'}
          </button>
        )}
      </div>

      {error?.setup && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--warn-soft)' }}>
          <div style={{ padding: '18px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            <div style={{ fontSize: 14.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 6 }}>One step left: create the analytics tables</div>
            Run <span className="mono" style={{ color: 'var(--text-1)' }}>supabase/migrations/20261007_web_analytics.sql</span> in the Supabase SQL editor.
            Visits start being recorded the moment it exists — the tracker is already live on the website.
          </div>
        </Card>
      )}
      {error && !error.setup && (
        <Card style={{ marginBottom: 16, borderColor: 'var(--neg-soft)' }}>
          <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--neg)' }}>Couldn’t load analytics: {error.message}</div>
        </Card>
      )}
      {data && !data.has_data && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: '20px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="live" size={17} /></span>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              <div style={{ fontSize: 14.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 4 }}>Waiting for the first visit</div>
              Everything is set up. Visits to the public website appear here within seconds — open rovora.eu in a private window to see one arrive.
              Your own browser {ignored ? 'is excluded, so that visit won’t count from here.' : 'is counted until you exclude it above.'}
            </div>
          </div>
        </Card>
      )}

      {data && cur && prev && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.2s' }} aria-busy={loading}>
          {/* ── Headline numbers ── */}
          <div className="an-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="Visitors" value={fmtNum(cur.visitors)} delta={<Delta cur={cur.visitors} prev={prev.visitors} />} sub={`vs ${fmtNum(prev.visitors)}`} active={metric === 'visitors'} onClick={() => setMetric('visitors')}
              hint="Unique visitors. Without cookies a person counts once per day; visitors who allowed cookies count once." />
            <Kpi label="Visits" value={fmtNum(cur.visits)} delta={<Delta cur={cur.visits} prev={prev.visits} />} sub={`${ratio(cur.visits, cur.visitors).toFixed(1)} per visitor`} active={metric === 'visits'} onClick={() => setMetric('visits')}
              hint="Sessions — a run of activity with no gap over 30 minutes." />
            <Kpi label="Pageviews" value={fmtNum(cur.pageviews)} delta={<Delta cur={cur.pageviews} prev={prev.pageviews} />} sub={`${ratio(cur.pageviews, cur.visits).toFixed(1)} per visit`} active={metric === 'pageviews'} onClick={() => setMetric('pageviews')}
              hint="Pages viewed." />
            <Kpi label="Avg. visit time" value={fmtDur(ratio(cur.engaged_ms, cur.visits))} delta={<Delta cur={ratio(cur.engaged_ms, cur.visits)} prev={ratio(prev.engaged_ms, prev.visits)} />} sub="actually on screen"
              hint="Time the page was visible, averaged over all visits (background tabs don't count)." />
            <Kpi label="Bounce rate" value={fmtPct(ratio(cur.bounces, cur.visits))} delta={<Delta cur={ratio(cur.bounces, cur.visits)} prev={ratio(prev.bounces, prev.visits)} upIsGood={false} asPoints />} sub="one page, no action"
              hint="Visits that viewed a single page and clicked nothing tracked." />
            <Kpi label="Signups" value={fmtNum(cur.signups)} delta={<Delta cur={cur.signups} prev={prev.signups} />} sub="new fleets" active={metric === 'signups'} onClick={() => setMetric('signups')}
              hint="Fleets created through onboarding." />
            <Kpi label="Leads" value={fmtNum(cur.leads)} delta={<Delta cur={cur.leads} prev={prev.leads} />} sub="contact form + chat" active={metric === 'leads'} onClick={() => setMetric('leads')}
              hint="Contact-form messages and leads left in the website chat." />
            <Kpi label="Visitor → signup" value={fmtPct(ratio(cur.signups, cur.visitors))} delta={<Delta cur={ratio(cur.signups, cur.visitors)} prev={ratio(prev.signups, prev.visitors)} asPoints />} sub="conversion rate"
              hint="Signups divided by visitors." />
          </div>

          {/* ── Trend + live ── */}
          <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title={{ visitors: 'Visitors', visits: 'Visits', pageviews: 'Pageviews', signups: 'Signups', leads: 'Leads' }[metric]}
                subtitle={`${range.bucket === 'hour' ? 'Per hour' : range.bucket === 'week' ? 'Per week' : range.bucket === 'month' ? 'Per month' : 'Per day'} · pick a number above to chart it`}
                right={<Tabs tabs={[['chart', 'Chart'], ['table', 'Table']]} value={trendView} onChange={setTrendView} />} />
              <div style={{ padding: '4px 18px 14px' }}>
                {trendView === 'chart'
                  ? <TrendChart series={data.series} metric={metric} bucket={data.bucket} compareLabel={range.compare} />
                  : <SeriesTable series={data.series} bucket={data.bucket} />}
              </div>
            </Card>
            <LiveCard live={live} />
          </div>

          {/* ── Acquisition + path to signup ── */}
          <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="Where visitors come from" subtitle={srcTab === 'channels' ? 'Hover a channel for what it includes · click any row to filter' : 'Click any row to filter the whole page'}
                right={<Tabs tabs={[['channels', 'Channels'], ['sources', 'Sources'], ['referrers', 'Referrers'], ['campaigns', 'Campaigns']]} value={srcTab} onChange={setSrcTab} />} />
              {srcTab === 'channels' && (
                <BarList rows={data.channels} label="Channel" keyOf={(r) => r.name} value={(r) => r.visitors}
                  name={(r) => <span title={CHANNEL_HINT[r.name]}>{r.name}</span>}
                  columns={[visitorsCol, bounceCol, signupsCol, convCol]} onSelect={(r) => addFilter('channel', r.name)}
                  empty="No visits in this period." />
              )}
              {srcTab === 'sources' && (
                <BarList rows={data.sources} label="Source" keyOf={(r) => r.name} value={(r) => r.visitors}
                  name={(r) => <>{r.name}<span style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.extra}</span></>}
                  columns={[visitorsCol, bounceCol, signupsCol, convCol]} onSelect={(r) => addFilter('source', r.name)}
                  empty="No visits in this period." />
              )}
              {srcTab === 'referrers' && (
                <BarList rows={data.referrers} label="Referring page" keyOf={(r) => r.name} value={(r) => r.visitors}
                  name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
                  columns={[visitorsCol, signupsCol]} onSelect={(r) => addFilter('referrer', r.name)}
                  empty="No other website has sent visitors in this period. When one does, the exact page that linked to you shows here." />
              )}
              {srcTab === 'campaigns' && (
                <BarList rows={data.campaigns} label="Campaign · source / medium" keyOf={(r) => `${r.name}|${r.extra}`} value={(r) => r.visitors}
                  name={(r) => <>{r.name}<span style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.extra}</span></>}
                  columns={[visitorsCol, signupsCol, { label: 'Leads', width: 50, render: (r) => fmtNum(r.leads ?? 0) }]}
                  onSelect={(r) => (r.name === '(not set)' ? undefined : addFilter('campaign', r.name))}
                  empty={<>No tagged links yet. Add <span className="mono">?utm_source=…&amp;utm_medium=…&amp;utm_campaign=…</span> to links in ads, posts and emails to see each campaign here.</>} />
              )}
            </Card>
            <Card>
              <CardHeader title="Path to signup" subtitle="From first visit to a new fleet" />
              <Funnel steps={data.funnel} />
            </Card>
          </div>

          {/* ── Content + location ── */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="Pages" subtitle={pageTab === 'pages' ? 'Most visited · time = reading time on screen' : pageTab === 'entry' ? 'Where visits start' : 'Where visits end'}
                right={<Tabs tabs={[['pages', 'Top pages'], ['entry', 'Entry'], ['exit', 'Exit']]} value={pageTab} onChange={setPageTab} />} />
              {pageTab === 'pages' && (
                <BarList rows={pages} label="Page" keyOf={(r) => r.name} value={(r) => r.visitors}
                  name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
                  columns={[
                    { label: 'Visitors', width: 58, render: (r) => fmtNum(r.visitors) },
                    { label: 'Time', width: 56, title: 'Average time on screen', render: (r) => (r.avg_engaged_ms ? fmtDur(r.avg_engaged_ms) : '—') },
                    { label: 'Scroll', width: 46, title: 'Average deepest scroll', render: (r) => (r.avg_scroll ? `${r.avg_scroll}%` : '—') },
                  ]}
                  onSelect={(r) => addFilter('page', r.name)} empty="No page views in this period." />
              )}
              {pageTab === 'entry' && (
                <BarList rows={data.entry_pages} label="Landing page" keyOf={(r) => r.name} value={(r) => r.visits}
                  name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
                  columns={[{ label: 'Entries', width: 56, render: (r) => fmtNum(r.visits) }, bounceCol, signupsCol]}
                  onSelect={(r) => addFilter('entry', r.name)} empty="No visits in this period." />
              )}
              {pageTab === 'exit' && (
                <BarList rows={data.exit_pages} label="Last page" keyOf={(r) => r.name} value={(r) => r.visits}
                  name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
                  columns={[
                    { label: 'Exits', width: 52, render: (r) => fmtNum(r.visits) },
                    { label: 'Exit rate', width: 62, title: 'Exits ÷ views of that page', render: (r) => (pvByPath.get(r.name) ? fmtPct(Math.min(1, ratio(r.visits, pvByPath.get(r.name)!))) : '—') },
                  ]}
                  onSelect={(r) => addFilter('exit', r.name)} empty="No visits in this period." />
              )}
            </Card>
            <Card>
              <CardHeader title="Where visitors are" subtitle={geoTab === 'countries' ? 'From each device’s time zone, or your CDN when it supplies location' : 'Needs location headers from a CDN'}
                right={<Tabs tabs={[['countries', 'Countries'], ['cities', 'Cities'], ['regions', 'Regions']]} value={geoTab} onChange={setGeoTab} />} />
              {geoTab === 'countries' && (
                <BarList rows={data.countries} label="Country" keyOf={(r) => r.name || '-'} value={(r) => r.visitors}
                  name={(r) => <><span aria-hidden>{flag(r.name)}</span>{countryName(r.name)}</>}
                  columns={[visitorsCol, shareCol(cur.visitors), signupsCol]}
                  onSelect={(r) => addFilter('country', r.name)} empty="No visits in this period." />
              )}
              {(geoTab === 'cities' || geoTab === 'regions') && (
                <BarList rows={geoTab === 'cities' ? data.cities : data.regions} label={geoTab === 'cities' ? 'City' : 'Region'} keyOf={(r) => `${r.name}|${r.extra}`} value={(r) => r.visitors}
                  name={(r) => <><span aria-hidden>{flag(r.extra)}</span>{r.name}</>}
                  columns={[visitorsCol]} onSelect={(r) => addFilter(geoTab === 'cities' ? 'city' : 'region', r.name)}
                  empty={<>City and region come from your CDN. Put the site behind Cloudflare and turn on <em>Rules → Managed Transforms → Add visitor location headers</em>, and they fill in automatically. Countries already work without it.</>} />
              )}
            </Card>
          </div>

          {/* ── Technology + timing ── */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="Devices & browsers" subtitle="Design for what people actually use"
                right={<Tabs tabs={[['devices', 'Device'], ['browsers', 'Browser'], ['os', 'OS'], ['languages', 'Language']]} value={techTab} onChange={setTechTab} />} />
              <BarList rows={data[techTab]} label={{ devices: 'Device', browsers: 'Browser', os: 'Operating system', languages: 'Language' }[techTab]}
                keyOf={(r) => r.name} value={(r) => r.visitors}
                name={(r) => (techTab === 'languages' ? languageName(r.name) : r.name)}
                columns={techTab === 'devices' ? [visitorsCol, shareCol(cur.visitors), bounceCol] : [visitorsCol, shareCol(cur.visitors)]}
                onSelect={(r) => addFilter({ devices: 'device', browsers: 'browser', os: 'os', languages: 'language' }[techTab], r.name)}
                empty="No visits in this period." />
            </Card>
            <Card>
              <CardHeader title="When people visit" subtitle={`Visitors by weekday and hour · your time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`} />
              <Heatmap cells={data.heatmap} />
            </Card>
          </div>

          {/* ── Behaviour ── */}
          <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16, marginBottom: 16 }}>
            <Card>
              <CardHeader title="What visitors click" subtitle="Trial and contact buttons, outbound links, chat, video" />
              <BarList rows={interactions} label="Action · where" keyOf={(r) => `${r.name}|${r.label}`} value={(r) => r.count}
                name={(r) => <>{r.name}{r.label && <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>}</>}
                columns={[{ label: 'Clicks', width: 52, render: (r) => fmtNum(r.count) }, { label: 'Visitors', width: 58, render: (r) => fmtNum(r.visitors) }]}
                empty="Clicks on “Start free trial”, sign-in, contact, email and outbound links, chat opens and video plays show up here." />
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <Card>
                <CardHeader title="What signups told us" subtitle="“How did you hear about Rovora?” in onboarding" />
                <BarList rows={heard} label="Answer" keyOf={(r) => r.name} value={(r) => r.visitors}
                  name={(r) => HEARD_LABEL[r.name] ?? r.name}
                  columns={[{ label: 'Signups', width: 58, render: (r) => fmtNum(r.visitors) }]}
                  empty="No answers yet in this period. It’s optional, so it also catches word of mouth that no tracker can see." />
              </Card>
              <Card>
                <CardHeader title="Audience" subtitle="From visitors who allowed the analytics cookie" />
                <div style={{ padding: '0 18px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-1)' }}>{data.loyalty.consented_visitors ? fmtPct(ratio(data.loyalty.returning, data.loyalty.consented_visitors)) : '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>returning visitors{data.loyalty.consented_visitors ? ` (${data.loyalty.returning} of ${data.loyalty.consented_visitors})` : ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-1)' }}>{consentAnswers ? fmtPct(ratio(data.consent.granted, consentAnswers)) : '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>click Allow on the cookie banner{consentAnswers ? ` (${data.consent.granted} of ${consentAnswers})` : ''}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <ConversionsTable rows={data.conversions} orgs={data.orgs} />

          <details style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-2)' }}>How these numbers are measured</summary>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><strong style={{ color: 'var(--text-2)' }}>First-party and cookieless by default.</strong> A visitor is an anonymous hash of IP + browser + a random daily salt that is deleted the next day — so without the cookie, the same person on two different days counts twice, and nothing can be traced back to them.</li>
              <li><strong style={{ color: 'var(--text-2)' }}>Visitors who click Allow</strong> get one first-party cookie, which is what makes “returning visitors” and “first visit” (attribution across days) possible.</li>
              <li><strong style={{ color: 'var(--text-2)' }}>Sources:</strong> UTM tags win, then ad click ids (gclid, msclkid…), then the referring site. No referrer = Direct. Many apps (WhatsApp, Slack, email clients) hide the referrer, so tag links you share.</li>
              <li><strong style={{ color: 'var(--text-2)' }}>Countries</strong> come from the device’s time zone unless a CDN supplies location. Bots, crawlers, the signed-in app and the driver app are never counted.</li>
              <li><strong style={{ color: 'var(--text-2)' }}>Signups and leads</strong> are recorded by the server when they happen, so ad blockers can’t hide them — they just show as “Not tracked” for where they came from.</li>
              <li>Raw data is kept for 25 months, then deleted automatically.</li>
            </ul>
          </details>
        </div>
      )}

      {!data && !error && (
        <div style={{ padding: '60px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Loading analytics…</div>
      )}
    </div>
  );
}

const chip: CSSProperties = { padding: '5px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' };
const chipActive: CSSProperties = { background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)' };
const th: CSSProperties = { fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '10px 18px', textAlign: 'left', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '10px 18px', verticalAlign: 'top', fontSize: 12.5, color: 'var(--text-2)' };
