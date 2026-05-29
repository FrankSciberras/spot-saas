'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { fmtEUR } from '@/components/fleet/FleetCharts';

export type VehStatus = 'active' | 'idle' | 'service';

export interface VehicleItem {
  id: string;
  plate: string;
  model: string;
  year: number | null;
  status: VehStatus;
  color: string;
  util: number;
  monthlyRevenue: number;
  km: number;
  driver: string;
  damages: { severe: number; open: number; total: number };
}

interface Props {
  vehicles: VehicleItem[];
  canAdd: boolean;
}

const STATUS_MAP: Record<VehStatus, { color: string; bg: string; label: string }> = {
  active: { color: 'var(--pos)', bg: 'var(--pos-soft)', label: 'Active' },
  idle: { color: 'var(--text-3)', bg: 'var(--bg-3)', label: 'Idle' },
  service: { color: 'var(--warn)', bg: 'var(--warn-soft)', label: 'In service' },
};

function CarTopMini({ color, damages }: { color: string; damages: number }) {
  return (
    <svg width="48" height="76" viewBox="0 0 48 76">
      <rect x="6" y="6" width="36" height="64" rx="13" fill={color} stroke="var(--line-3)" strokeWidth="1.2" />
      <path d="M 11 15 Q 24 13, 37 15 L 35 28 Q 24 26, 13 28 Z" fill="var(--bg-2)" opacity="0.6" />
      <path d="M 11 60 Q 24 62, 37 60 L 35 48 Q 24 50, 13 48 Z" fill="var(--bg-2)" opacity="0.6" />
      {damages > 0 && (
        <g>
          <circle cx="40" cy="10" r="7" fill="var(--neg)" stroke="var(--bg-1)" strokeWidth="2" />
          <text x="40" y="13.5" textAnchor="middle" fontSize="8.5" fill="#fff" fontWeight="700" fontFamily="Geist Mono, monospace">{damages}</text>
        </g>
      )}
    </svg>
  );
}

function VehStat({ label, value, sub, icon, accent }: { label: string; value: string | number; sub: string; icon: string; accent: string }) {
  return (
    <div style={st.stat}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FleetIcon name={icon} size={15} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function VehicleCard({ v, onClick }: { v: VehicleItem; onClick: () => void }) {
  const sm = STATUS_MAP[v.status];
  return (
    <div onClick={onClick} style={st.vehCard} className="fleetNavItem">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.04em' }}>{v.plate}</span>
            {v.year && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{v.year}</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{v.model}</div>
        </div>
        <span style={{ fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: sm.color, background: sm.bg, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{sm.label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 14px' }}>
        <div style={{ flexShrink: 0 }}><CarTopMini color={v.color} damages={v.damages.severe} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Utilisation</span>
            <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>{Math.round(v.util * 100)}%</span>
          </div>
          <div style={{ height: 5, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${v.util * 100}%`, height: '100%', background: v.status === 'service' ? 'var(--warn)' : 'var(--accent)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
            <div>
              <div style={{ color: 'var(--text-3)' }}>This month</div>
              <div className="mono tnum" style={{ color: 'var(--text-1)', fontWeight: 500, marginTop: 1 }}>{v.monthlyRevenue ? fmtEUR(v.monthlyRevenue, { decimals: 0 }) : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-3)' }}>Odometer</div>
              <div className="mono tnum" style={{ color: 'var(--text-1)', fontWeight: 500, marginTop: 1 }}>{(v.km / 1000).toFixed(0)}k km</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <FleetIcon name="driver" size={13} />
          <span style={{ fontSize: 12.5, color: v.driver === '—' ? 'var(--text-4)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.driver}</span>
        </div>
        {v.damages.total > 0 ? (
          <div style={{ display: 'flex', gap: 4 }}>
            {v.damages.severe > 0 && <span style={st.dmgSevere}>{v.damages.severe} severe</span>}
            <span style={st.dmgOpen}>{v.damages.open} open</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No damages</span>
        )}
      </div>
    </div>
  );
}

export default function VehiclesWorkspace({ vehicles, canAdd }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | VehStatus>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: vehicles.length,
    active: vehicles.filter((v) => v.status === 'active').length,
    idle: vehicles.filter((v) => v.status === 'idle').length,
    service: vehicles.filter((v) => v.status === 'service').length,
  }), [vehicles]);

  const list = useMemo(() => {
    let l = vehicles;
    if (filter !== 'all') l = l.filter((v) => v.status === filter);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((v) => v.plate.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.driver.toLowerCase().includes(q));
    }
    return l;
  }, [vehicles, filter, search]);

  const utilAvg = vehicles.length ? vehicles.reduce((s, v) => s + v.util, 0) / vehicles.length : 0;
  const damagesTotal = vehicles.reduce((s, v) => s + v.damages.severe, 0);
  const revenueMonth = vehicles.reduce((s, v) => s + v.monthlyRevenue, 0);

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operations / Vehicles</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Vehicles</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{counts.all}</span>
          </div>
        </div>
        {canAdd && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={st.primaryBtn} className="fleetHover" onClick={() => router.push('/fleet/vehicles/new')}>
              <FleetIcon name="plus" size={14} stroke={2.2} /> Add vehicle
            </button>
          </div>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <VehStat label="Active fleet" value={counts.active} sub={`of ${counts.all} vehicles`} icon="vehicle" accent="var(--text-1)" />
        <VehStat label="Utilisation" value={`${Math.round(utilAvg * 100)}%`} sub="7-day average" icon="chart" accent="var(--accent)" />
        <VehStat label="Severe damages" value={damagesTotal} sub="across active fleet" icon="damage" accent="var(--neg)" />
        <VehStat label="Revenue this mo." value={fmtEUR(revenueMonth, { decimals: 0, compact: true })} sub="all vehicles combined" icon="settle" accent="var(--pos)" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {([
            { k: 'all', label: 'All', n: counts.all, dot: undefined as string | undefined },
            { k: 'active', label: 'Active', n: counts.active, dot: 'var(--pos)' },
            { k: 'idle', label: 'Idle', n: counts.idle, dot: 'var(--text-3)' },
            { k: 'service', label: 'In service', n: counts.service, dot: 'var(--warn)' },
          ] as const).map((t) => (
            <button key={t.k} onClick={() => setFilter(t.k)} style={{ ...st.tab, ...(filter === t.k ? st.tabActive : {}) }}>
              {t.dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: t.dot }} />}
              {t.label}
              <span className="mono tnum" style={{ fontSize: 11, color: filter === t.k ? 'var(--text-2)' : 'var(--text-4)' }}>{t.n}</span>
            </button>
          ))}
        </div>
        <div style={st.searchBox} className="full-mobile">
          <FleetIcon name="search" size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate, model, driver…" style={st.searchInput} />
        </div>
      </div>

      <div style={st.cardsGrid} className="grid-3">
        {list.map((v) => <VehicleCard key={v.id} v={v} onClick={() => router.push(`/fleet/vehicles/${v.id}`)} />)}
        {list.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 }}>
            No vehicles match your filters.
          </div>
        )}
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, whiteSpace: 'nowrap' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 260 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  vehCard: { padding: '16px 18px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12, cursor: 'pointer', transition: 'border-color 120ms ease, transform 120ms ease' },
  dmgSevere: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--neg)', background: 'var(--neg-soft)', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.04em', textTransform: 'uppercase' },
  dmgOpen: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--warn)', background: 'var(--warn-soft)', padding: '2px 7px', borderRadius: 4, letterSpacing: '0.04em', textTransform: 'uppercase' },
};
