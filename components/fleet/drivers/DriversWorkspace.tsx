'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { fmtEUR, Sparkline } from '@/components/fleet/FleetCharts';

export type DocState = 'ok' | 'warn' | 'missing' | 'expired';

export interface DriverItem {
  id: string;
  name: string;
  initials: string;
  color: string;
  status: 'on' | 'off';
  clockIn: string;
  lastShift: string;
  phone: string;
  vehicles: string[];
  weekEarnings: number;
  weekHours: number;
  docs: { id: DocState; police: DocState; license: DocState };
}

interface Props {
  drivers: DriverItem[];
  canAdd: boolean;
}

const DOC_MAP: Record<DocState, { color: string; bg: string; glyph: string }> = {
  ok: { color: 'var(--pos)', bg: 'var(--pos-soft)', glyph: '✓' },
  warn: { color: 'var(--warn)', bg: 'var(--warn-soft)', glyph: '!' },
  missing: { color: 'var(--text-4)', bg: 'var(--bg-3)', glyph: '—' },
  expired: { color: 'var(--neg)', bg: 'var(--neg-soft)', glyph: '×' },
};

function Avatar({ initials, color, size }: { initials: string; color: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size > 36 ? 12 : 8, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}aa)`, color: '#0a0c11', fontWeight: 600, fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {initials}
    </div>
  );
}

const hasIssue = (d: DriverItem) => Object.values(d.docs).some((s) => s === 'missing' || s === 'expired');

export default function DriversWorkspace({ drivers, canAdd }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'on' | 'off' | 'issues'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'earnings' | 'status'>('name');

  const counts = useMemo(() => ({
    all: drivers.length,
    on: drivers.filter((d) => d.status === 'on').length,
    off: drivers.filter((d) => d.status === 'off').length,
    issues: drivers.filter(hasIssue).length,
  }), [drivers]);

  const list = useMemo(() => {
    let l = drivers;
    if (filter === 'on') l = l.filter((d) => d.status === 'on');
    if (filter === 'off') l = l.filter((d) => d.status === 'off');
    if (filter === 'issues') l = l.filter(hasIssue);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((d) => d.name.toLowerCase().includes(q) || d.vehicles.some((v) => v.toLowerCase().includes(q)));
    }
    return [...l].sort((a, b) => {
      if (sortBy === 'earnings') return b.weekEarnings - a.weekEarnings;
      if (sortBy === 'status') return (a.status === 'on' ? 0 : 1) - (b.status === 'on' ? 0 : 1);
      return a.name.localeCompare(b.name);
    });
  }, [drivers, filter, search, sortBy]);

  const go = (id: string) => router.push(`/fleet/drivers/${id}`);

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operations / Drivers</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Drivers</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{counts.all}</span>
          </div>
        </div>
        {canAdd && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={st.primaryBtn} className="fleetHover" onClick={() => router.push('/fleet/drivers/new')}>
              <FleetIcon name="plus" size={14} stroke={2.2} /> Add driver
            </button>
          </div>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <DriverStat label="Active fleet" value={counts.all} sub={`${counts.on} on shift now`} icon="driver" accent="var(--text-1)" />
        <DriverStat label="On shift" value={counts.on} sub="clocked in now" icon="live" accent="var(--pos)" live />
        <DriverStat label="Off duty" value={counts.off} sub="available to schedule" icon="shift" accent="var(--text-2)" />
        <DriverStat label="Doc issues" value={counts.issues} sub="missing or expired" icon="warning" accent="var(--warn)" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {([
            { k: 'all', label: 'All', n: counts.all, dot: undefined as string | undefined },
            { k: 'on', label: 'On shift', n: counts.on, dot: 'var(--pos)' },
            { k: 'off', label: 'Off duty', n: counts.off, dot: undefined },
            { k: 'issues', label: 'Issues', n: counts.issues, dot: 'var(--warn)' },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or plate…" style={st.searchInput} />
        </div>
      </div>

      {/* Desktop table */}
      <div style={st.tableWrap} className="hide-mobile">
        <div style={st.thead}>
          <div style={st.col} onClick={() => setSortBy('name')}>Driver {sortBy === 'name' && <span style={{ color: 'var(--text-3)' }}>↓</span>}</div>
          <div style={st.col} onClick={() => setSortBy('status')}>Status</div>
          <div style={st.col}>Contact</div>
          <div style={st.col}>Vehicles</div>
          <div style={{ ...st.col, textAlign: 'right' }} onClick={() => setSortBy('earnings')}>Week earnings {sortBy === 'earnings' && <span style={{ color: 'var(--text-3)' }}>↓</span>}</div>
          <div style={{ ...st.col, textAlign: 'right' }}>Hours</div>
          <div style={st.col}>Documents</div>
          <div style={{ ...st.col, display: 'flex', justifyContent: 'flex-end' }} />
        </div>
        {list.map((d, i) => (
          <div key={d.id} style={{ ...st.row, borderBottom: i < list.length - 1 ? '1px solid var(--line-1)' : 'none' }} className="fleetNavItem" onClick={() => go(d.id)}>
            <div style={st.col}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={d.initials} color={d.color} size={32} />
                <div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>{d.name}</div>
              </div>
            </div>
            <div style={st.col}>
              {d.status === 'on' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...st.pulse, color: 'var(--pos)' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-1)' }}>In</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{d.clockIn}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--text-4)', display: 'inline-block' }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Last in</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.lastShift}</span>
                </div>
              )}
            </div>
            <div style={st.col}>
              <div className="mono" style={{ fontSize: 12.5, color: d.phone === '—' ? 'var(--text-4)' : 'var(--text-2)' }}>{d.phone}</div>
            </div>
            <div style={st.col}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {d.vehicles.slice(0, 4).map((v, j) => (
                  <span key={j} className="mono" style={st.plateChip}>{v}</span>
                ))}
                {d.vehicles.length > 4 && <span style={{ fontSize: 11, padding: '2px 6px', color: 'var(--text-3)' }}>+{d.vehicles.length - 4}</span>}
                {d.vehicles.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-4)' }}>—</span>}
              </div>
            </div>
            <div style={{ ...st.col, textAlign: 'right' }}>
              <div className="mono tnum" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>
                {d.weekEarnings ? fmtEUR(d.weekEarnings, { decimals: 2 }) : <span style={{ color: 'var(--text-4)' }}>€0.00</span>}
              </div>
              {d.weekEarnings > 0 && (
                <div style={{ marginTop: 3, display: 'flex', justifyContent: 'flex-end' }}>
                  <Sparkline data={[{ v: 120 }, { v: 180 }, { v: 140 }, { v: 210 }, { v: 160 }, { v: 240 }, { v: 180 }]} w={70} h={18} color={d.color} fill={false} />
                </div>
              )}
            </div>
            <div style={{ ...st.col, textAlign: 'right' }}>
              <span className="mono tnum" style={{ fontSize: 13, color: d.weekHours ? 'var(--text-1)' : 'var(--text-4)' }}>{d.weekHours ? d.weekHours.toFixed(1) + 'h' : '0h'}</span>
            </div>
            <div style={st.col}>
              <div style={{ display: 'flex', gap: 5 }}>
                {([{ k: 'id', label: 'ID' }, { k: 'police', label: 'PC' }, { k: 'license', label: 'LIC' }] as const).map(({ k, label }) => {
                  const m = DOC_MAP[d.docs[k]];
                  return (
                    <div key={k} title={`${label} · ${d.docs[k]}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'Geist Mono, monospace', padding: '2px 6px', borderRadius: 4, background: m.bg, color: m.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {label}<span style={{ fontWeight: 600 }}>{m.glyph}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ ...st.col, display: 'flex', justifyContent: 'flex-end' }}>
              <span style={st.kebab}><FleetIcon name="chevron-right" size={14} /></span>
            </div>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)' }}>No drivers match your filters.</div>}
      </div>

      {/* Mobile cards */}
      <div className="show-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((d) => (
          <div key={d.id} style={st.mobileCard} onClick={() => go(d.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar initials={d.initials} color={d.color} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ fontSize: 15, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                  {d.status === 'on' && <span style={{ ...st.pulse, color: 'var(--pos)' }} />}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-3)' }}>
                  {d.status === 'on' ? <>In <span className="mono">@ {d.clockIn}</span></> : <>Last in <span style={{ color: 'var(--text-2)' }}>{d.lastShift}</span></>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono tnum" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{d.weekEarnings ? fmtEUR(d.weekEarnings, { decimals: 0 }) : '—'}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{d.weekHours ? d.weekHours.toFixed(1) + 'h' : '0h'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {d.vehicles.slice(0, 3).map((v, j) => <span key={j} className="mono" style={st.plateChip}>{v}</span>)}
                {d.vehicles.length > 3 && <span style={{ fontSize: 10.5, padding: '2px 4px', color: 'var(--text-3)' }}>+{d.vehicles.length - 3}</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {([{ k: 'id', label: 'ID' }, { k: 'police', label: 'PC' }, { k: 'license', label: 'LIC' }] as const).map(({ k, label }) => {
                  const m = DOC_MAP[d.docs[k]];
                  return <span key={k} style={{ fontSize: 9.5, fontFamily: 'Geist Mono, monospace', padding: '2px 5px', borderRadius: 3, background: m.bg, color: m.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>;
                })}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 }}>No drivers match your filters.</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 4px', fontSize: 12, color: 'var(--text-3)' }}>
        <span>Showing <span style={{ color: 'var(--text-1)' }}>{list.length}</span> of {counts.all} drivers</span>
      </div>
    </>
  );
}

function DriverStat({ label, value, sub, icon, accent, live }: { label: string; value: number; sub: string; icon: string; accent: string; live?: boolean }) {
  return (
    <div style={st.stat}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FleetIcon name={icon} size={15} />
        </div>
        {live && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--pos)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span style={{ ...st.pulse, color: 'var(--pos)' }} /> Live
          </span>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  pulse: { width: 6, height: 6, borderRadius: 99, background: 'currentColor', animation: 'fleetPulse 1.6s ease-in-out infinite', display: 'inline-block', flexShrink: 0 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, whiteSpace: 'nowrap' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 260 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  tableWrap: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12, overflow: 'hidden' },
  thead: { display: 'grid', gridTemplateColumns: '2fr 1.1fr 1.1fr 1.3fr 1.1fr 0.7fr 1.2fr 50px', padding: '11px 18px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, cursor: 'default' },
  row: { display: 'grid', gridTemplateColumns: '2fr 1.1fr 1.1fr 1.3fr 1.1fr 0.7fr 1.2fr 50px', padding: '12px 18px', cursor: 'pointer', alignItems: 'center' },
  col: { fontSize: 13, color: 'var(--text-2)', minWidth: 0 },
  plateChip: { fontSize: 11, padding: '2px 6px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 4, color: 'var(--text-2)' },
  kebab: { width: 28, height: 28, borderRadius: 6, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mobileCard: { padding: '14px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12, cursor: 'pointer' },
};
