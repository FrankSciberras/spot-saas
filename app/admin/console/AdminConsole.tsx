'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import FleetIcon from '@/components/fleet/FleetIcon';
import { createClient } from '@/lib/supabase/client';
import {
  setFleetPlanAction,
  extendTrialAction,
  setFleetStatusAction,
} from '@/lib/actions/platform-billing';
import {
  createVehicleModelAction,
  uploadModelImageAction,
  setVehicleModelPublishedAction,
  deleteVehicleModelAction,
} from '@/lib/actions/vehicle-models';
import PackagesManager from './PackagesManager';
import AddOperatorModal from './AddOperatorModal';
import OperatorDetailModal from './OperatorDetailModal';
import BroadcastCenter from './BroadcastCenter';
import {
  type AdminData,
  type BillingRow,
  type Operator,
  type OpStatus,
  type PlanMeta,
  type PlanMixEntry,
  type RealPlan,
  type TrendPoint,
} from './types';

const Icon = FleetIcon;

// Plan label/colour lookup + assignable keys, derived from the catalogue and
// provided once at the console root so leaf components (PlanBadge, the operator
// manage popover) stay prop-light.
const PlanMetaContext = createContext<{ meta: Record<string, PlanMeta>; assignable: string[] }>({
  meta: {},
  assignable: [],
});
const usePlanMeta = () => useContext(PlanMetaContext);
const FALLBACK_META: PlanMeta = { label: '—', color: 'var(--text-2)', bg: 'var(--bg-3)' };

// ── helpers ──
const fmtEUR = (n: number, opts: { decimals?: number; compact?: boolean } = {}) => {
  const { decimals = 2, compact = false } = opts;
  if (compact && Math.abs(n) >= 1000) return '€' + (n / 1000).toFixed(n >= 10000 ? 1 : 2) + 'k';
  return '€' + n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

// ── small primitives ──
const ACard = ({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
    {children}
  </div>
);

const ACardHeader = ({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12 }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

const OpAvatar = ({ initials, color, size = 30 }: { initials: string; color: string; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: 8, flexShrink: 0,
    background: `linear-gradient(135deg, ${color}, ${color}99)`,
    color: '#0a0c11', fontSize: size * 0.36, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.01em',
  }}>{initials}</div>
);

// Operator identity as a link into the full detail page. Wraps the avatar + name
// block; the `.op-name` span turns accent on hover (see the style tag at root).
const OpLink = ({ id, children }: { id: string; children: ReactNode }) => (
  <Link href={`/admin/operators/${id}`} className="op-link" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
    {children}
  </Link>
);

const PlanBadge = ({ plan }: { plan: RealPlan }) => {
  const { meta } = usePlanMeta();
  const m = meta[plan] ?? { ...FALLBACK_META, label: plan };
  return <span style={{ fontSize: 11, fontWeight: 500, color: m.color, background: m.bg, padding: '2px 9px', borderRadius: 5, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{m.label}</span>;
};

const STATUS_STYLE: Record<OpStatus, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: 'var(--pos)', bg: 'var(--pos-soft)', dot: 'var(--pos)' },
  trial: { label: 'Trial', color: 'var(--accent)', bg: 'var(--accent-soft)', dot: 'var(--accent)' },
  past_due: { label: 'Past due', color: 'var(--warn)', bg: 'var(--warn-soft)', dot: 'var(--warn)' },
  churned: { label: 'Churned', color: 'var(--text-3)', bg: 'var(--bg-3)', dot: 'var(--text-4)' },
};
const StatusPill = ({ status }: { status: OpStatus }) => {
  const m = STATUS_STYLE[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'Geist Mono, monospace', color: m.color, background: m.bg, padding: '2px 8px 2px 7px', borderRadius: 5, letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: m.dot }} />{m.label}
    </span>
  );
};

// ── charts ──
function smoothPath(points: { x: number; y: number }[], tension = 0.4) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * tension / 3, c1y = p1.y + (p2.y - p0.y) * tension / 3;
    const c2x = p2.x - (p3.x - p1.x) * tension / 3, c2y = p2.y - (p3.y - p1.y) * tension / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const Sparkline = ({ data, w = 130, h = 36, color = '#3ecf8e' }: { data: { v: number }[]; w?: number; h?: number; color?: string }) => {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.v));
  const min = Math.min(...data.map((d) => d.v));
  const range = max - min || 1;
  const pts = data.map((d, i) => ({ x: (i / (data.length - 1)) * (w - 2) + 1, y: h - 2 - ((d.v - min) / range) * (h - 4) }));
  const path = smoothPath(pts, 0.4);
  const area = path + ` L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={area} fill={color} opacity="0.14" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
};

const MrrAreaChart = ({ data, w = 760, h = 230 }: { data: TrendPoint[]; w?: number; h?: number }) => {
  const padL = 42, padR = 10, padT = 16, padB = 26;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const maxV = Math.max(...data.map((d) => d.v), 1) * 1.12;
  const xFor = (i: number) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const yFor = (v: number) => padT + innerH - (v / maxV) * innerH;
  const pts = data.map((d, i) => ({ x: xFor(i), y: yFor(d.v) }));
  const line = smoothPath(pts);
  const area = line + ` L ${xFor(data.length - 1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: padT + innerH - t * innerH, label: Math.round((t * maxV) / 100) * 100 }));
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const i = Math.round(((px - padL) / innerW) * (data.length - 1));
    if (i >= 0 && i < data.length) setHover(i);
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="mrrArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="var(--chart-grid)" strokeDasharray={i === 0 ? '0' : '2 4'} />
          <text x={padL - 8} y={t.y + 4} textAnchor="end" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">€{t.label >= 1000 ? t.label / 1000 + 'k' : t.label}</text>
        </g>
      ))}
      {data.map((d, i) => (i % 2 === 0 || i === data.length - 1) ? (
        <text key={i} x={xFor(i)} y={h - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">{d.label}</text>
      ) : null)}
      <path d={area} fill="url(#mrrArea)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {hover !== null && (
        <g>
          <line x1={xFor(hover)} x2={xFor(hover)} y1={padT} y2={padT + innerH} stroke="var(--chart-cursor)" strokeDasharray="2 3" />
          <circle cx={xFor(hover)} cy={yFor(data[hover].v)} r="4" fill="var(--accent)" stroke="var(--bg-0)" strokeWidth="2" />
          <g transform={`translate(${Math.min(xFor(hover) + 12, w - 116)}, ${padT + 4})`}>
            <rect width="106" height="40" rx="6" fill="var(--bg-1)" stroke="var(--line-2)" />
            <text x="11" y="17" fontSize="10.5" fill="var(--text-3)" fontFamily="Geist Mono, monospace">{data[hover].label} · MRR</text>
            <text x="11" y="32" fontSize="13" fill="var(--text-1)" fontWeight="600" fontFamily="Geist Mono, monospace">€{data[hover].v.toLocaleString()}</text>
          </g>
        </g>
      )}
    </svg>
  );
};

const PlanMixBar = ({ mix }: { mix: PlanMixEntry[] }) => {
  const total = mix.reduce((s, m) => s + m.mrr, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, background: 'var(--bg-2)' }}>
        {mix.map((m) => (
          <div key={m.id} title={`${m.name} · ${fmtEUR(m.mrr, { decimals: 0 })}`} style={{ width: `${(m.mrr / total) * 100}%`, background: m.color, opacity: 0.9 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
        {mix.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-1)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-1)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: m.color }} />{m.name}
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>· {m.accounts} {m.accounts === 1 ? 'account' : 'accounts'}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{fmtEUR(m.mrr, { decimals: 0 })}</span>
              <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-3)', width: 38, textAlign: 'right' }}>{Math.round((m.mrr / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ACT_ICON: Record<string, { name: string; color: string; bg: string }> = {
  trial: { name: 'play', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  upgrade: { name: 'arrow-up', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  expand: { name: 'arrow-up', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  payment: { name: 'check', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  failed: { name: 'warning', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  churn: { name: 'arrow-down', color: 'var(--neg)', bg: 'var(--neg-soft)' },
};

// ── KPI tile ──
const KpiTile = ({ label, value, suffix, delta, deltaDir, deltaLabel, accent, spark, foot }: {
  label: string; value: string; suffix?: string; delta?: string;
  deltaDir?: 'up' | 'down'; deltaLabel?: string; accent: string; spark?: ReactNode; foot?: ReactNode;
}) => (
  <div style={ap.kpiTile}>
    <div style={{ position: 'absolute', top: 0, left: 0, width: 28, height: 2, background: accent, borderRadius: '0 0 2px 0' }} />
    <div style={{ fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span className="mono tnum" style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{value}</span>
      {suffix && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{suffix}</span>}
    </div>
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {delta && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, padding: '2px 6px', borderRadius: 4,
            background: deltaDir === 'up' ? 'var(--pos-soft)' : deltaDir === 'down' ? 'var(--neg-soft)' : 'var(--bg-3)',
            color: deltaDir === 'up' ? 'var(--pos)' : deltaDir === 'down' ? 'var(--neg)' : 'var(--text-2)', fontFamily: 'Geist Mono, monospace',
          }}>
            {deltaDir === 'up' && <Icon name="arrow-up" size={10} stroke={2.4} />}
            {deltaDir === 'down' && <Icon name="arrow-down" size={10} stroke={2.4} />}
            {delta}
          </span>
        )}
        {deltaLabel && <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deltaLabel}</span>}
      </div>
      {spark}
      {foot}
    </div>
  </div>
);

const MiniMetric = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <ACard style={{ padding: '18px' }}>
    <div style={{ fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    <div className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', marginTop: 10, color: 'var(--text-1)' }}>{value}</div>
    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>
  </ACard>
);

// ── nav ──
type PageId = 'overview' | 'operators' | 'packages' | 'subscriptions' | 'billing' | 'trials' | 'churn' | 'broadcasts' | 'support' | 'settings' | 'vehicle-models';

function buildNav(data: AdminData) {
  const pastDue = data.billing.filter((b) => b.status === 'past_due').length;
  return [
    { label: null as string | null, items: [{ id: 'overview' as PageId, name: 'Overview', icon: 'dashboard', badge: undefined as string | undefined, dot: false }] },
    { label: 'Revenue', items: [
      { id: 'operators' as PageId, name: 'Operators', icon: 'staff', badge: String(data.operators.filter((o) => o.status !== 'churned').length), dot: false },
      { id: 'packages' as PageId, name: 'Packages', icon: 'settle', badge: undefined, dot: false },
      { id: 'subscriptions' as PageId, name: 'Subscriptions', icon: 'book', badge: undefined, dot: false },
      { id: 'billing' as PageId, name: 'Billing', icon: 'doc', badge: pastDue ? String(pastDue) : undefined, dot: pastDue > 0 },
    ]},
    { label: 'Growth', items: [
      { id: 'trials' as PageId, name: 'Trials', icon: 'shift', badge: String(data.metrics.trials), dot: false },
      { id: 'churn' as PageId, name: 'Churn', icon: 'chart', badge: undefined, dot: false },
    ]},
    { label: 'Catalog', items: [
      { id: 'vehicle-models' as PageId, name: 'Vehicle Models', icon: 'vehicle', badge: undefined, dot: false },
    ]},
    { label: 'Admin', items: [
      { id: 'broadcasts' as PageId, name: 'Broadcasts', icon: 'bell', badge: undefined, dot: false },
      { id: 'support' as PageId, name: 'Support', icon: 'staff', badge: undefined, dot: false },
      { id: 'settings' as PageId, name: 'Settings', icon: 'adjust', badge: undefined, dot: false },
    ]},
  ];
}

const AdminSidebar = ({ data, active, onSelect, isMobile, open, onClose }: {
  data: AdminData; active: PageId; onSelect: (id: PageId) => void; isMobile: boolean; open: boolean; onClose: () => void;
}) => {
  const nav = buildNav(data);
  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign('/login');
  };
  const Body = (
    <>
      <div style={asb.logoWrap}>
        <img src="/logo-full-white.png" alt="Rovora" style={{ height: 22, width: 'auto' }} />
        <div style={asb.adminTag}>Admin Console</div>
      </div>
      <nav style={asb.nav}>
        {nav.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 14 }}>
            {g.label && <div style={asb.navLabel}>{g.label}</div>}
            {g.items.map((item) => {
              const on = item.id === active;
              return (
                <button key={item.id} className="fleetNavItem" onClick={() => { onSelect(item.id); if (isMobile) onClose(); }}
                  style={{ ...asb.navItem, ...(on ? asb.navItemActive : {}) }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11, color: on ? 'var(--accent)' : 'var(--text-2)' }}>
                    <Icon name={item.icon} size={17} stroke={1.6} />
                    <span style={{ color: on ? 'var(--text-1)' : 'var(--text-2)', fontWeight: on ? 500 : 400 }}>{item.name}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.dot && <span style={asb.dot} />}
                    {item.badge && <span style={{ ...asb.badge, ...(on ? asb.badgeActive : {}) }}>{item.badge}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={asb.userCard}>
        <div style={asb.userAvatar}>S</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>Rovora HQ</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.adminEmail}</div>
        </div>
        <button style={asb.iconBtn} title="Sign out" onClick={signOut}><Icon name="logout" size={15} /></button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        {open && <div style={asb.scrim} onClick={onClose} />}
        <aside style={{ ...asb.sidebar, ...asb.sidebarMobile, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>{Body}</aside>
      </>
    );
  }
  return <aside style={asb.sidebar}>{Body}</aside>;
};

const AdminTopbar = ({ title, subtitle, onMenuClick, right, query, onQuery, onSearchFocus }: {
  title: string; subtitle?: string; onMenuClick: () => void; right?: ReactNode;
  query: string; onQuery: (v: string) => void; onSearchFocus: () => void;
}) => (
  <div style={ap.topbar} className="topbar-mobile">
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <button onClick={onMenuClick} className="show-mobile-only" style={ap.menuBtn} aria-label="Open menu"><Icon name="menu" size={20} stroke={2} /></button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        <h1 style={ap.pageTitle}>{title}</h1>
        {subtitle && <><span className="hide-mobile" style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span>
          <span className="hide-mobile" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{subtitle}</span></>}
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={ap.searchBox} className="hide-mobile">
        <Icon name="search" size={15} />
        <input placeholder="Search operators…" style={ap.searchInput} value={query}
          onChange={(e) => onQuery(e.target.value)} onFocus={onSearchFocus}
          onKeyDown={(e) => { if (e.key === 'Escape') onQuery(''); }} />
        {query
          ? <button onClick={() => onQuery('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 0 }} aria-label="Clear search"><Icon name="close" size={13} /></button>
          : <kbd style={ap.kbd}>↵</kbd>}
      </div>
      {right}
    </div>
  </div>
);

// ── Operators table ──
const OperatorsTable = ({ rows, compact }: { rows: Operator[]; compact?: boolean }) => (
  <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: compact ? 0 : 720 }}>
      {!compact && (
        <thead>
          <tr>
            {['Operator', 'Plan', 'Vehicles', 'MRR', 'Status', 'Renews'].map((h, i) => (
              <th key={h} style={{ ...ap.th, textAlign: i >= 2 && i !== 4 ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((o, i) => (
          <tr key={o.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-1)' : 'none' }} className="op-row">
            <td style={ap.td}>
              <OpLink id={o.id}>
                <OpAvatar initials={o.initials} color={o.color} />
                <div style={{ minWidth: 0 }}>
                  <div className="op-name" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap' }}>{o.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{o.slug}</div>
                </div>
              </OpLink>
            </td>
            <td style={ap.td}><PlanBadge plan={o.plan} /></td>
            <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>{o.vehicles}</span></td>
            <td style={{ ...ap.td, textAlign: 'right' }}>
              <span className="mono tnum" style={{ fontSize: 13, color: o.status === 'trial' ? 'var(--text-3)' : 'var(--text-1)', fontWeight: 500 }}>
                {o.status === 'trial' ? '—' : fmtEUR(o.mrr, { decimals: 0 })}
              </span>
            </td>
            <td style={ap.td}><StatusPill status={o.status} /></td>
            {!compact && <td style={{ ...ap.td, textAlign: 'right' }}>
              {o.status === 'trial'
                ? <span className="mono" style={{ fontSize: 11.5, color: 'var(--warn)' }}>{o.trialDaysLeft}d trial left</span>
                : <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDate(o.renews)}</span>}
            </td>}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Pages ──
const OverviewPage = ({ data, onNavigate }: { data: AdminData; onNavigate: (id: PageId) => void }) => {
  const m = data.metrics;
  // MRR-growth chart window (months). The hero segmented control drives it.
  const [range, setRange] = useState<3 | 6 | 12>(12);
  const shownTrend = range >= data.trend.length ? data.trend : data.trend.slice(-range);
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '24px 0 16px' }}>
        <div className="header-mobile-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Recurring revenue</div>
            <div className="hero-h1-mobile" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em' }}>
              <span className="mono">{fmtEUR(m.mrr, { decimals: 0 })}</span> MRR · <span style={{ color: m.mrr >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{data.momGrowth >= 0 ? '+' : ''}{data.momGrowth.toFixed(1)}%</span> this month
            </div>
          </div>
          <div className="chips-scroll" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} title="MRR growth window">
            {([3, 6, 12] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{ ...ap.chip, ...(range === r ? ap.chipActive : {}) }}>{r}M</button>
            ))}
          </div>
        </div>
        <div style={ap.kpiGrid} className="grid-4">
          <KpiTile label="MRR" value={fmtEUR(m.mrr, { decimals: 0 })} delta={`${data.momGrowth >= 0 ? '+' : ''}${data.momGrowth.toFixed(1)}%`} deltaDir={data.momGrowth >= 0 ? 'up' : 'down'} deltaLabel="vs. last month" accent="var(--pos)"
            spark={<Sparkline data={data.trend.map((d) => ({ v: d.v }))} color="#3ecf8e" />} />
          <KpiTile label="Paying operators" value={String(m.payingCount)} suffix={`/ ${data.totals.operators}`} delta={`${m.active}`} deltaDir="up" deltaLabel="active accounts" accent="var(--accent)"
            foot={<div style={{ display: 'flex', gap: 4 }}>{data.operators.slice(0, 11).map((o, i) => (<span key={i} title={o.name} style={{ width: 8, height: 8, borderRadius: 99, background: (o.status === 'active' || o.status === 'past_due') ? o.color : 'var(--bg-3)' }} />))}</div>} />
          <KpiTile label="Active trials" value={String(m.trials)} suffix="converting" delta={`${data.totals.operators ? Math.round((m.payingCount / data.totals.operators) * 100) : 0}%`} deltaDir="up" deltaLabel="paid share" accent="var(--warn)" />
          <KpiTile label="ARR" value={fmtEUR(m.arr, { compact: true, decimals: 0 })} delta={`${m.pastDue}`} deltaDir={m.pastDue > 0 ? 'down' : 'up'} deltaLabel="past-due accounts" accent="var(--accent)" />
        </div>
      </div>

      <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 16 }}>
        <ACard>
          <ACardHeader title="MRR growth" subtitle={`Last ${shownTrend.length} months · cumulative`}
            right={<div style={ap.legendRow}><span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>ARR</span><span className="mono" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{fmtEUR(m.arr, { compact: true, decimals: 0 })}</span></div>} />
          <div style={{ padding: '14px 18px 6px', borderTop: '1px solid var(--line-1)' }}>
            <MrrAreaChart data={shownTrend} />
          </div>
        </ACard>
        <ACard>
          <ACardHeader title="Revenue by package" subtitle={`${fmtEUR(m.mrr, { decimals: 0 })} MRR across ${m.payingCount} accounts`}
            right={<button style={ap.linkBtn} onClick={() => onNavigate('packages')}>Packages <Icon name="arrow-right" size={11} /></button>} />
          <div style={{ padding: '16px 18px', borderTop: '1px solid var(--line-1)' }}>
            <PlanMixBar mix={data.planMix} />
          </div>
        </ACard>
      </div>

      <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 16 }}>
        <ACard>
          <ACardHeader title="Operators" subtitle="Highest MRR accounts"
            right={<button style={ap.linkBtn} onClick={() => onNavigate('operators')}>All operators <Icon name="arrow-right" size={11} /></button>} />
          <OperatorsTable rows={[...data.operators].filter((o) => o.status !== 'churned').sort((a, b) => b.mrr - a.mrr).slice(0, 6)} compact />
        </ACard>
        <ACard>
          <ACardHeader title="Activity" subtitle="Latest account events" />
          <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 18px 12px' }}>
            {data.activity.length === 0 && <div style={{ padding: '20px 0', fontSize: 12.5, color: 'var(--text-3)' }}>No recent activity.</div>}
            {data.activity.map((a, i) => {
              const ic = ACT_ICON[a.kind] || ACT_ICON.payment;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 0', borderBottom: i < data.activity.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: ic.bg, color: ic.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ic.name} size={13} stroke={2} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)' }}><span style={{ fontWeight: 500 }}>{a.who}</span> <span style={{ color: 'var(--text-2)' }}>{a.what}</span></div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{a.meta}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{a.t}</div>
                </div>
              );
            })}
          </div>
        </ACard>
      </div>
    </div>
  );
};

const OperatorRowManage = ({ op }: { op: Operator }) => {
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [isPending, startTransition] = useTransition();
  const suspended = op.rawStatus === 'suspended' || op.rawStatus === 'cancelled';
  const POP_W = 230;
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        const left = Math.max(8, r.right - POP_W);
        const below = window.innerHeight - r.bottom;
        if (below < 260) setPos({ left, top: 0, bottom: window.innerHeight - r.top + 4 });
        else setPos({ left, top: r.bottom + 4 });
      }
      return next;
    });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };
  const { meta, assignable } = usePlanMeta();
  return (
    <>
      <button ref={btnRef} style={ap.ghostBtn2} onClick={toggle}>Manage <Icon name="chevron-down" size={13} /></button>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
        <div style={{
          ...ap.managePop,
          left: pos.left,
          ...(pos.bottom !== undefined ? { bottom: pos.bottom } : { top: pos.top }),
        }}>
          {error && <div style={{ fontSize: 11.5, color: 'var(--neg)', marginBottom: 8 }}>{error}</div>}
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Plan</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {assignable.map((p) => (
              <button key={p} disabled={isPending || p === op.plan} onClick={() => run(() => setFleetPlanAction(op.id, p))}
                style={{ ...ap.miniBtn, ...(p === op.plan ? ap.miniBtnActive : {}) }}>{(meta[p] ?? FALLBACK_META).label}</button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Trial</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <button disabled={isPending} onClick={() => run(() => extendTrialAction(op.id, 7))} style={ap.miniBtn}>+7 days</button>
            <button disabled={isPending} onClick={() => run(() => extendTrialAction(op.id, 30))} style={ap.miniBtn}>+30 days</button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Status</div>
          {suspended ? (
            <button disabled={isPending} onClick={() => run(() => setFleetStatusAction(op.id, 'active'))} style={ap.miniBtn}>Reactivate</button>
          ) : (
            <button disabled={isPending} onClick={() => run(() => setFleetStatusAction(op.id, 'suspended'))} style={{ ...ap.miniBtn, color: 'var(--neg)', borderColor: 'var(--neg-soft)' }}>Suspend</button>
          )}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-1)' }}>
            <button disabled={isPending} onClick={() => { setOpen(false); setDetailOpen(true); }} style={{ ...ap.miniBtn, width: '100%', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="adjust" size={12} />Edit details & members
            </button>
          </div>
        </div>
        </>
      )}
      {detailOpen && <OperatorDetailModal operatorId={op.id} onClose={() => setDetailOpen(false)} />}
    </>
  );
};

const OperatorsPage = ({ data, query }: { data: AdminData; query: string }) => {
  const [filter, setFilter] = useState<'all' | OpStatus>('all');
  const counts = {
    all: data.operators.length,
    active: data.operators.filter((o) => o.status === 'active').length,
    trial: data.operators.filter((o) => o.status === 'trial').length,
    past_due: data.operators.filter((o) => o.status === 'past_due').length,
    churned: data.operators.filter((o) => o.status === 'churned').length,
  };
  const q = query.trim().toLowerCase();
  const rows = [...data.operators]
    .filter((o) => (filter === 'all' ? true : o.status === filter))
    .filter((o) => !q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || (o.ownerEmail ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.mrr - a.mrr);
  const tabs: [keyof typeof counts, string][] = [['all', 'All'], ['active', 'Active'], ['trial', 'Trials'], ['past_due', 'Past due'], ['churned', 'Churned']];
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="chips-scroll" style={{ display: 'flex', gap: 6 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id as 'all' | OpStatus)} style={{ ...ap.filterTab, ...(filter === id ? ap.filterTabActive : {}) }}>
              {label} <span className="mono" style={{ fontSize: 11, opacity: 0.7, marginLeft: 3 }}>{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>
      <ACard>
        <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                {['Operator', 'Plan', 'Vehicles', 'Drivers', 'MRR', 'Status', 'Renews', ''].map((h, i) => (
                  <th key={i} style={{ ...ap.th, textAlign: (i >= 2 && i <= 4) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-1)' : 'none' }} className="op-row">
                  <td style={ap.td}>
                    <OpLink id={o.id}>
                      <OpAvatar initials={o.initials} color={o.color} />
                      <div style={{ minWidth: 0 }}>
                        <div className="op-name" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap' }}>{o.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{o.ownerEmail ?? o.slug}</div>
                      </div>
                    </OpLink>
                  </td>
                  <td style={ap.td}><PlanBadge plan={o.plan} /></td>
                  <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>{o.vehicles}</span></td>
                  <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-2)' }}>{o.drivers}</span></td>
                  <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: o.status === 'trial' ? 'var(--text-3)' : 'var(--text-1)', fontWeight: 500 }}>{o.status === 'trial' ? '—' : fmtEUR(o.mrr, { decimals: 0 })}</span></td>
                  <td style={ap.td}><StatusPill status={o.status} /></td>
                  <td style={ap.td}>{o.status === 'trial' ? <span className="mono" style={{ fontSize: 11.5, color: 'var(--warn)' }}>{o.trialDaysLeft}d left</span> : <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDate(o.renews)}</span>}</td>
                  <td style={{ ...ap.td, textAlign: 'right', position: 'relative' }}><OperatorRowManage op={o} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ACard>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }} className="mono">
        {rows.length} operators · {fmtEUR(rows.reduce((s, o) => s + o.mrr, 0), { decimals: 0 })} combined MRR
      </div>
    </div>
  );
};

const PackagesPage = ({ data }: { data: AdminData }) => {
  const m = data.metrics;
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '24px 0 8px', maxWidth: 560 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Editable pricing catalogue</div>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Create and edit the packages operators sign up for.</div>
      </div>

      {/* Live editor — changes here drive the website, onboarding & billing. */}
      <PackagesManager />

      <div style={{ padding: '28px 0 8px', maxWidth: 560 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Performance</div>
        <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em' }}>How each package is performing right now.</div>
      </div>
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16, marginBottom: 16 }}>
        {data.packages.map((p) => {
          const mix = data.planMix.find((x) => x.id === p.id) || { accounts: 0, vehicles: 0, mrr: 0 };
          return (
            <div key={p.id} style={{ ...ap.planCard, ...(p.popular ? ap.planCardPop : {}) }}>
              {p.popular && <div style={ap.popTag}>Most subscribed</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</span>
                <PlanBadge plan={p.id} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6, minHeight: 34 }}>{p.blurb}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 14 }}>
                <span className="mono tnum" style={{ fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', color: 'var(--text-1)' }}>€{p.rate}</span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>/ month</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }} className="mono">{p.cap}</div>
              <ul style={ap.featList}>
                {p.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', gap: 9, fontSize: 13, color: 'var(--text-2)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--pos)', marginTop: 1, flexShrink: 0 }}><Icon name="check" size={14} stroke={2.4} /></span>{f}
                  </li>
                ))}
              </ul>
              <div style={ap.planStats}>
                <div style={{ flex: 1 }}>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>{mix.accounts}</div>
                  <div style={ap.planStatLabel}>Accounts</div>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid var(--line-1)', paddingLeft: 14 }}>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: p.color }}>{fmtEUR(mix.mrr, { decimals: 0 })}</div>
                  <div style={ap.planStatLabel}>MRR</div>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid var(--line-1)', paddingLeft: 14 }}>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>{mix.vehicles}</div>
                  <div style={ap.planStatLabel}>Vehicles</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ACard style={{ marginBottom: 16 }}>
        <ACardHeader title="Plan distribution" subtitle="Share of MRR across active packages" />
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--line-1)' }}>
          <PlanMixBar mix={data.planMix} />
        </div>
      </ACard>

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <MiniMetric label="Avg revenue / account" value={fmtEUR(m.arpa, { decimals: 0 })} sub="ARPA across paying operators" />
        <MiniMetric label="Vehicles under management" value={m.vehicles.toLocaleString()} sub="billable fleet across the base" />
        <MiniMetric label="Active subscriptions" value={String(m.payingCount)} sub="paying operators right now" />
      </div>
    </div>
  );
};

const SubscriptionsPage = ({ data }: { data: AdminData }) => {
  const subs = data.operators.filter((o) => o.mrr > 0).sort((a, b) => b.mrr - a.mrr);
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px' }}>
        <div style={ap.kpiGrid} className="grid-4">
          <MiniMetric label="Active subscriptions" value={String(data.metrics.payingCount)} sub="paying operators" />
          <MiniMetric label="MRR" value={fmtEUR(data.metrics.mrr, { decimals: 0 })} sub="committed monthly revenue" />
          <MiniMetric label="ARR" value={fmtEUR(data.metrics.arr, { compact: true, decimals: 0 })} sub="annualised run-rate" />
          <MiniMetric label="Past due" value={String(data.metrics.pastDue)} sub={`${fmtEUR(data.metrics.pastDueMrr, { decimals: 0 })} at risk`} />
        </div>
      </div>
      <ACard>
        <ACardHeader title="Subscriptions" subtitle="Every paying operator and their plan" />
        <OperatorsTable rows={subs} />
      </ACard>
    </div>
  );
};

const BILL_STATUS: Record<BillingRow['status'], { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  past_due: { label: 'Past due', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  trialing: { label: 'Trialing', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  canceled: { label: 'Canceled', color: 'var(--text-3)', bg: 'var(--bg-3)' },
};

const BillingPage = ({ data, query }: { data: AdminData; query: string }) => {
  const q = query.trim().toLowerCase();
  const rows = q ? data.billing.filter((b) => b.operator.toLowerCase().includes(q)) : data.billing;
  const committed = rows.reduce((s, b) => s + b.amount, 0);
  const pastDue = rows.filter((b) => b.status === 'past_due');
  const noStripe = rows.filter((b) => !b.stripeUrl).length;
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px' }}>
        <div style={ap.kpiGrid} className="grid-4">
          <MiniMetric label="Committed MRR" value={fmtEUR(committed, { decimals: 0 })} sub={`${rows.length} subscription${rows.length === 1 ? '' : 's'}`} />
          <MiniMetric label="Active" value={String(rows.filter((b) => b.status === 'active').length)} sub="billing normally" />
          <MiniMetric label="Past due" value={String(pastDue.length)} sub={`${fmtEUR(pastDue.reduce((s, b) => s + b.amount, 0), { decimals: 0 })} at risk`} />
          <MiniMetric label="Not on Stripe" value={String(noStripe)} sub="manual / no checkout" />
        </div>
      </div>
      <ACard>
        <ACardHeader title="Billing" subtitle="Live subscription status per operator — invoices open in Stripe" />
        <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>{['Operator', 'Plan', 'Amount', 'Status', 'Renews', ''].map((h, i) => (
              <th key={i} style={{ ...ap.th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td style={{ ...ap.td, color: 'var(--text-3)' }} colSpan={6}>No paying subscriptions{q ? ' match your search' : ' yet'}.</td></tr>}
              {rows.map((b, i) => {
                const sc = BILL_STATUS[b.status];
                return (
                  <tr key={b.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line-1)' : 'none' }} className="op-row">
                    <td style={ap.td}>
                      <OpLink id={b.id}>
                        <OpAvatar initials={b.initials} color={b.color} size={24} />
                        <span className="op-name" style={{ fontSize: 13, color: 'var(--text-1)' }}>{b.operator}</span>
                      </OpLink>
                    </td>
                    <td style={ap.td}><PlanBadge plan={b.plan} /></td>
                    <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{fmtEUR(b.amount, { decimals: 0 })}<span style={{ fontSize: 11, color: 'var(--text-3)' }}> /mo</span></span></td>
                    <td style={ap.td}><span style={{ fontSize: 11, fontFamily: 'Geist Mono, monospace', color: sc.color, background: sc.bg, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>{sc.label}</span></td>
                    <td style={ap.td}><span className="mono tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDate(b.renewsAt)}</span></td>
                    <td style={{ ...ap.td, textAlign: 'right' }}>
                      {b.stripeUrl
                        ? <a style={ap.linkBtn} href={b.stripeUrl} target="_blank" rel="noreferrer">Stripe <Icon name="arrow-right" size={11} style={{ transform: 'rotate(-45deg)' }} /></a>
                        : <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ACard>
    </div>
  );
};

const TrialsPage = ({ data }: { data: AdminData }) => {
  const trials = data.operators.filter((o) => o.status === 'trial').sort((a, b) => a.trialDaysLeft - b.trialDaysLeft);
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px' }}>
        <div style={ap.kpiGrid} className="grid-4">
          <MiniMetric label="Active trials" value={String(trials.length)} sub="evaluating now" />
          <MiniMetric label="Expiring ≤7d" value={String(trials.filter((o) => o.trialDaysLeft <= 7).length)} sub="needs a nudge" />
          <MiniMetric label="Paid share" value={`${data.totals.operators ? Math.round((data.metrics.payingCount / data.totals.operators) * 100) : 0}%`} sub="of all operators" />
          <MiniMetric label="Trial vehicles" value={String(trials.reduce((s, o) => s + o.vehicles, 0))} sub="potential billable" />
        </div>
      </div>
      <ACard>
        <ACardHeader title="Trials" subtitle="Operators evaluating Rovora" />
        <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr>{['Operator', 'Vehicles', 'Drivers', 'Started', 'Trial ends', ''].map((h, i) => (
              <th key={i} style={{ ...ap.th, textAlign: (i === 1 || i === 2) ? 'right' : 'left' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {trials.length === 0 && <tr><td style={{ ...ap.td, color: 'var(--text-3)' }} colSpan={6}>No active trials.</td></tr>}
              {trials.map((o, i) => (
                <tr key={o.id} style={{ borderBottom: i < trials.length - 1 ? '1px solid var(--line-1)' : 'none' }} className="op-row">
                  <td style={ap.td}>
                    <OpLink id={o.id}>
                      <OpAvatar initials={o.initials} color={o.color} />
                      <div><div className="op-name" style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{o.name}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{o.ownerEmail ?? o.slug}</div></div>
                    </OpLink>
                  </td>
                  <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>{o.vehicles}</span></td>
                  <td style={{ ...ap.td, textAlign: 'right' }}><span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-2)' }}>{o.drivers}</span></td>
                  <td style={ap.td}><span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmtDate(o.since)}</span></td>
                  <td style={ap.td}><span className="mono" style={{ fontSize: 12, color: o.trialDaysLeft <= 7 ? 'var(--warn)' : 'var(--text-2)' }}>{fmtDate(o.renews)} · {o.trialDaysLeft}d</span></td>
                  <td style={{ ...ap.td, textAlign: 'right', position: 'relative' }}><OperatorRowManage op={o} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ACard>
    </div>
  );
};

const ChurnPage = ({ data }: { data: AdminData }) => {
  const churned = data.operators.filter((o) => o.status === 'churned');
  const pastDue = data.operators.filter((o) => o.status === 'past_due');
  const lostMrr = data.metrics.lostMrr;
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px' }}>
        <div style={ap.kpiGrid} className="grid-4">
          <MiniMetric label="Churned operators" value={String(churned.length)} sub="cancelled accounts" />
          <MiniMetric label="Past due" value={String(pastDue.length)} sub={`${fmtEUR(data.metrics.pastDueMrr, { decimals: 0 })} at risk`} />
          <MiniMetric label="Retention" value={`${data.totals.operators ? Math.round(((data.totals.operators - churned.length) / data.totals.operators) * 100) : 100}%`} sub="of all operators retained" />
          <MiniMetric label="Lost MRR" value={fmtEUR(lostMrr, { decimals: 0 })} sub="from cancellations" />
        </div>
      </div>
      <ACard style={{ marginBottom: 16 }}>
        <ACardHeader title="At risk" subtitle="Past-due operators to recover" />
        <OperatorsTable rows={pastDue} />
      </ACard>
      <ACard>
        <ACardHeader title="Churned" subtitle="Cancelled accounts" />
        {churned.length === 0
          ? <div style={{ padding: '24px 18px', fontSize: 12.5, color: 'var(--text-3)', borderTop: '1px solid var(--line-1)' }}>No churned operators. </div>
          : <OperatorsTable rows={churned} />}
      </ACard>
    </div>
  );
};

const SupportPage = ({ data }: { data: AdminData }) => {
  const ops = [...data.operators].filter((o) => o.status !== 'churned').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px', maxWidth: 560 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operator directory</div>
        <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Reach any operator&apos;s admin contact.</div>
      </div>
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        {ops.map((o) => (
          <ACard key={o.id} style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <OpAvatar initials={o.initials} color={o.color} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</div>
                <div style={{ marginTop: 2 }}><StatusPill status={o.status} /></div>
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
              <Icon name="staff" size={14} />{o.ownerEmail ?? <span style={{ color: 'var(--text-4)' }}>no admin contact</span>}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-3)' }}>
              <Icon name="vehicle" size={14} />{o.vehicles} vehicles · {o.drivers} drivers
            </div>
          </ACard>
        ))}
      </div>
    </div>
  );
};

// ── Package update check (platform maintenance toggle, stored in app_settings) ──
const PackageUpdateCard = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { key: string; value: boolean }[]) => {
        const row = Array.isArray(rows) ? rows.find((s) => s.key === 'package_update_check_enabled') : undefined;
        setEnabled(row ? Boolean(row.value) : false);
      })
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    if (enabled === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'package_update_check_enabled', value: !enabled }),
      });
      if (res.ok) {
        const row = await res.json();
        setEnabled(Boolean(row.value));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ACard style={{ marginTop: 16 }}>
      <ACardHeader
        title="Package update check"
        subtitle="Weekly npm dependency report for the platform codebase"
        right={
          <button onClick={toggle} disabled={enabled === null || busy} style={ap.linkBtn}>
            {enabled === null || busy ? '…' : enabled ? 'Disable' : 'Enable'}
          </button>
        }
      />
      <div style={{ borderTop: '1px solid var(--line-1)', padding: '14px 18px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
        <div style={{ marginBottom: 6 }}>
          Status:{' '}
          <span style={{ color: enabled ? 'var(--pos)' : 'var(--text-3)', fontWeight: 600 }}>
            {enabled === null ? 'Loading…' : enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        When enabled, an automated check runs every Monday at 08:00 UTC comparing installed npm packages
        against the npm registry, and emails a report to{' '}
        <span className="mono" style={{ color: 'var(--text-1)' }}>franksciberras@gmail.com</span>{' '}
        when updates are available.
      </div>
    </ACard>
  );
};

const SettingsPage = ({ data }: { data: AdminData }) => (
  <div style={ap.scroll} className="pad-mobile">
    <div style={{ padding: '20px 0 14px', maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Platform settings</div>
      <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Pricing and account configuration.</div>
    </div>
    <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
      <ACard>
        <ACardHeader title="Plan pricing" subtitle="Flat monthly rates billed to operators" />
        <div style={{ borderTop: '1px solid var(--line-1)' }}>
          {data.packages.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: i < data.packages.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PlanBadge plan={p.id} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.cap}</span>
              </div>
              <span className="mono tnum" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>€{p.rate}<span style={{ fontSize: 11.5, color: 'var(--text-3)' }}> / mo</span></span>
            </div>
          ))}
        </div>
      </ACard>
      <ACard>
        <ACardHeader title="Console" subtitle="Signed-in platform admin" />
        <div style={{ borderTop: '1px solid var(--line-1)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--text-3)' }}>Admin</span><span className="mono" style={{ color: 'var(--text-1)' }}>{data.adminEmail}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--text-3)' }}>Operators</span><span className="mono" style={{ color: 'var(--text-1)' }}>{data.totals.operators}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--text-3)' }}>Users</span><span className="mono" style={{ color: 'var(--text-1)' }}>{data.totals.users}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--text-3)' }}>Vehicles</span><span className="mono" style={{ color: 'var(--text-1)' }}>{data.totals.vehicles}</span></div>
        </div>
      </ACard>
    </div>
    <PackageUpdateCard />
  </div>
);

// ── Vehicle Models (car diagram presets) ──
interface VModelRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  model_key: string;
  side_image_url: string | null;
  top_image_url: string | null;
  is_published: boolean;
  sideZoneCount: number;
  topZoneCount: number;
}

const vmInput: CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};

const ModelImageSlot = ({ model, view, onChanged }: { model: VModelRow; view: 'side' | 'top'; onChanged: () => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const imageUrl = view === 'side' ? model.side_image_url : model.top_image_url;
  const zoneCount = view === 'side' ? model.sideZoneCount : model.topZoneCount;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    // Guard before uploading so an oversized file gives instant feedback instead
    // of being rejected mid-flight by the Server Action body limit (which throws
    // and would otherwise leave the button stuck on "Uploading…").
    if (file.size > 5 * 1024 * 1024) {
      setErr('Image must be 5 MB or smaller.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('modelId', model.id); fd.set('view', view); fd.set('image', file);
      const res = await uploadModelImageAction(fd);
      if (res.error) { setErr(res.error); return; }
      onChanged();
    } catch (uploadErr) {
      console.error('model image upload failed:', uploadErr);
      setErr('Upload failed — the file may be too large. Try an image under 5 MB.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div style={{ background: 'var(--bg-1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-4)' }}>
        {view === 'side' ? 'Side view' : 'Top view'}
      </span>
      <div style={{ aspectRatio: '16 / 10', borderRadius: 8, background: 'var(--bg-2)', border: '1px dashed var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt={`${model.name} ${view}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>No image</span>}
      </div>
      <span style={{ alignSelf: 'flex-start', fontSize: 10.5, fontFamily: 'Geist Mono, monospace', padding: '1px 7px', borderRadius: 5, color: zoneCount > 0 ? 'var(--pos)' : 'var(--text-4)', background: zoneCount > 0 ? 'var(--pos-soft)' : 'var(--bg-2)' }}>
        {zoneCount > 0 ? `${zoneCount} zones` : 'Not traced'}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={onPick}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={ap.miniBtn} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
        </button>
        <a style={{ ...ap.miniBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          href={`/vehicle-diagrams/zone-editor.html?model=${encodeURIComponent(model.model_key)}&view=${view}`}
          target="_blank" rel="noreferrer">Edit zones</a>
      </div>
      {err && <span style={{ fontSize: 11, color: 'var(--neg)' }}>{err}</span>}
    </div>
  );
};

const ModelCard = ({ model, onChanged }: { model: VModelRow; onChanged: () => void }) => {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  const togglePublished = () => {
    setErr('');
    startTransition(async () => {
      const r = await setVehicleModelPublishedAction(model.id, !model.is_published);
      if (r.error) setErr(r.error); else onChanged();
    });
  };
  const remove = () => {
    if (!window.confirm(`Delete "${model.name}" and its traced zones? Vehicles using it will be detached.`)) return;
    setErr('');
    startTransition(async () => {
      const r = await deleteVehicleModelAction(model.id);
      if (r.error) setErr(r.error); else onChanged();
    });
  };

  return (
    <ACard>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '14px 16px 12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-1)' }}>{model.name}</div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
            {[model.make, model.model].filter(Boolean).join(' ') || '—'} · {model.model_key}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 500, padding: '2px 9px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap', color: model.is_published ? 'var(--pos)' : 'var(--text-3)', background: model.is_published ? 'var(--pos-soft)' : 'var(--bg-3)' }}>
          {model.is_published ? 'Published' : 'Draft'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line-1)', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)' }}>
        <ModelImageSlot model={model} view="side" onChanged={onChanged} />
        <ModelImageSlot model={model} view="top" onChanged={onChanged} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', gap: 8 }}>
        <button style={ap.ghostBtn2} disabled={isPending} onClick={togglePublished}>
          {model.is_published ? 'Unpublish' : 'Publish'}
        </button>
        {err && <span style={{ fontSize: 11.5, color: 'var(--neg)' }}>{err}</span>}
        <button style={{ ...ap.ghostBtn2, color: 'var(--neg)', borderColor: 'var(--neg-soft)' }} disabled={isPending} onClick={remove}>
          Delete
        </button>
      </div>
    </ACard>
  );
};

const VehicleModelsPage = () => {
  const [models, setModels] = useState<VModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/vehicle-models', { cache: 'no-store' });
      const json = await res.json();
      setModels(json.data || []);
    } catch { /* leave empty */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(''); setCreating(true);
    const res = await createVehicleModelAction(name, make, model);
    setCreating(false);
    if (res.error) { setErr(res.error); return; }
    setName(''); setMake(''); setModel(''); setShowCreate(false); load();
  };

  return (
    <div style={ap.scroll} className="pad-mobile">
      <div style={{ padding: '20px 0 14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Shared across every fleet</div>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Car diagram presets operators pick from.</div>
        </div>
        <button style={ap.primaryBtn} onClick={() => setShowCreate((v) => !v)}>
          <Icon name="plus" size={14} stroke={2} />New model
        </button>
      </div>

      {showCreate && (
        <ACard style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Name *</label>
              <input style={vmInput} value={name} placeholder="e.g. Toyota Yaris Cross" onChange={(e) => setName(e.target.value)} disabled={creating} />
            </div>
            <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Make</label>
              <input style={vmInput} value={make} placeholder="e.g. Toyota" onChange={(e) => setMake(e.target.value)} disabled={creating} />
            </div>
            <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Model</label>
              <input style={vmInput} value={model} placeholder="e.g. Yaris Cross" onChange={(e) => setModel(e.target.value)} disabled={creating} />
            </div>
            <button style={{ ...ap.primaryBtn, opacity: creating || !name.trim() ? 0.5 : 1 }} disabled={creating || !name.trim()} onClick={create}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {err && <div style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 10 }}>{err}</div>}
        </ACard>
      )}

      {loading ? (
        <ACard><div style={{ padding: '40px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Loading…</div></ACard>
      ) : models.length === 0 ? (
        <ACard><div style={{ padding: '48px 18px', textAlign: 'center', fontSize: 13.5, color: 'var(--text-3)' }}>No vehicle models yet. Create one to get started.</div></ACard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {models.map((m) => <ModelCard key={m.id} model={m} onChanged={load} />)}
        </div>
      )}
    </div>
  );
};

const PAGE_META: Record<PageId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Billing & subscriptions' },
  operators: { title: 'Operators', subtitle: 'Every fleet on Rovora' },
  packages: { title: 'Packages', subtitle: 'Subscription plans' },
  subscriptions: { title: 'Subscriptions', subtitle: 'Active paying accounts' },
  billing: { title: 'Billing', subtitle: 'Subscription status & invoices' },
  trials: { title: 'Trials', subtitle: 'Operators evaluating Rovora' },
  churn: { title: 'Churn', subtitle: 'Retention & recovery' },
  broadcasts: { title: 'Broadcasts', subtitle: 'Message operators & drivers' },
  support: { title: 'Support', subtitle: 'Operator directory' },
  settings: { title: 'Settings', subtitle: 'Platform configuration' },
  'vehicle-models': { title: 'Vehicle Models', subtitle: 'Car diagram presets' },
};

export default function AdminConsole({ data }: { data: AdminData }) {
  const [active, setActive] = useState<PageId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [vw, setVw] = useState(1280);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => { setMenuOpen(false); }, [active]);
  const isMobile = vw < 720;
  const meta = PAGE_META[active];

  const subtitle = useMemo(() => {
    if (active === 'operators') {
      const paying = data.metrics.active + data.metrics.pastDue;
      return `${paying} paying · ${data.metrics.trials} trialing`;
    }
    return meta.subtitle;
  }, [active, data, meta.subtitle]);

  return (
    <PlanMetaContext.Provider value={{ meta: data.planMeta, assignable: data.assignablePlans }}>
    <div className="fleetTheme fleetCanvas" data-fleet-theme="dark">
      <style>{`.op-link:hover .op-name { color: var(--accent); } .op-link:hover { opacity: 0.95; }`}</style>
      <AdminSidebar data={data} active={active} onSelect={setActive} isMobile={isMobile} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <AdminTopbar title={meta.title} subtitle={subtitle} onMenuClick={() => setMenuOpen((o) => !o)}
          query={query} onQuery={setQuery} onSearchFocus={() => { if (active !== 'operators' && active !== 'billing') setActive('operators'); }}
          right={<button style={ap.primaryBtn} className="hide-mobile" onClick={() => setAddOpen(true)}><Icon name="plus" size={14} stroke={2} />Add operator</button>} />
        {active === 'overview' && <OverviewPage data={data} onNavigate={setActive} />}
        {active === 'operators' && <OperatorsPage data={data} query={query} />}
        {active === 'packages' && <PackagesPage data={data} />}
        {active === 'subscriptions' && <SubscriptionsPage data={data} />}
        {active === 'billing' && <BillingPage data={data} query={query} />}
        {active === 'trials' && <TrialsPage data={data} />}
        {active === 'churn' && <ChurnPage data={data} />}
        {active === 'broadcasts' && (
          <div style={ap.scroll} className="pad-mobile">
            <div style={{ padding: '24px 0 16px', maxWidth: 560 }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Notifications</div>
              <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em' }}>Message your operators &amp; their drivers.</div>
            </div>
            <BroadcastCenter />
          </div>
        )}
        {active === 'support' && <SupportPage data={data} />}
        {active === 'settings' && <SettingsPage data={data} />}
        {active === 'vehicle-models' && <VehicleModelsPage />}
      </main>
      {addOpen && (
        <AddOperatorModal meta={data.planMeta} assignable={data.assignablePlans} onClose={() => setAddOpen(false)} />
      )}
    </div>
    </PlanMetaContext.Provider>
  );
}

// ── styles ──
const asb: Record<string, CSSProperties> = {
  sidebar: { width: 'var(--sidebar-w)', minHeight: '100vh', background: 'var(--bg-0)', borderRight: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, flexShrink: 0 },
  sidebarMobile: { position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, height: '100vh', zIndex: 50, transition: 'transform 220ms cubic-bezier(.4,0,.2,1)', boxShadow: '8px 0 32px rgba(0,0,0,0.3)', background: 'var(--bg-1)' },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49, backdropFilter: 'blur(2px)' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '18px 18px', borderBottom: '1px solid var(--line-1)' },
  adminTag: { fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  nav: { flex: 1, overflowY: 'auto', padding: '14px 10px' },
  navLabel: { fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '8px 10px 4px' },
  navItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 10px', background: 'transparent', border: 'none', borderRadius: 7, color: 'var(--text-2)', fontSize: 13.5, textAlign: 'left', transition: 'background 120ms ease', marginBottom: 1, fontFamily: 'inherit', cursor: 'pointer' },
  navItemActive: { background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  badge: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4, minWidth: 18, textAlign: 'center' },
  badgeActive: { color: 'var(--accent)', background: 'var(--accent-soft)' },
  dot: { width: 6, height: 6, borderRadius: 99, background: 'var(--warn)', boxShadow: '0 0 0 3px rgba(245,181,74,0.18)' },
  userCard: { margin: '8px 10px 12px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10 },
  userAvatar: { width: 32, height: 32, borderRadius: 7, background: 'linear-gradient(135deg, #2bbd7e, #3b6ad9)', color: '#fff', fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconBtn: { width: 28, height: 28, background: 'transparent', border: 'none', color: 'var(--text-3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
};

const ap: Record<string, CSSProperties> = {
  scroll: { padding: '0 24px 32px' },
  topbar: { height: 'var(--topbar-h)', padding: '0 24px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--topbar-bg)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 },
  pageTitle: { margin: 0, fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-1)' },
  menuBtn: { width: 36, height: 36, background: 'transparent', border: 'none', color: 'var(--text-1)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 280 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  kbd: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--line-1)' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  chip: { padding: '5px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  chipActive: { background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  kpiTile: { position: 'relative', padding: '16px 16px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  legendRow: { display: 'inline-flex', alignItems: 'baseline', gap: 8 },
  linkBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', padding: '4px 6px', borderRadius: 5, cursor: 'pointer' },
  th: { fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '11px 18px', borderBottom: '1px solid var(--line-1)', whiteSpace: 'nowrap' },
  td: { padding: '12px 18px', verticalAlign: 'middle' },
  filterTab: { padding: '6px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  filterTabActive: { background: 'var(--bg-2)', border: '1px solid var(--line-2)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  ghostBtn2: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  managePop: { position: 'fixed', zIndex: 20, width: 230, padding: 14, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', textAlign: 'left' },
  miniBtn: { padding: '5px 9px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtnActive: { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' },
  planCard: { position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', padding: '22px' },
  planCardPop: { borderColor: 'var(--accent-line)', boxShadow: '0 0 0 1px var(--accent-line)', paddingTop: '26px' },
  popTag: { position: 'absolute', top: -10, left: 22, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' },
  featList: { listStyle: 'none', padding: 0, margin: '18px 0', display: 'flex', flexDirection: 'column', gap: 9 },
  planStats: { display: 'flex', gap: 14, padding: '16px 0', borderTop: '1px solid var(--line-1)', borderBottom: '1px solid var(--line-1)', marginBottom: 16 },
  planStatLabel: { fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  planBtn: { width: '100%', padding: '9px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-1)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  planBtnPop: { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' },
};
