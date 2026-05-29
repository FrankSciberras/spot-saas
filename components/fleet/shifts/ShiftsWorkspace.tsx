'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';

export interface ShiftItem {
  id: string;
  driver: string;
  driverInitials: string;
  driverColor: string;
  vehicle: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  hours: number;
  date: string;
  dayLabel: string;
  dayOffset: number;
  status: 'live' | 'completed';
  mileage: number;
  dashcam: boolean;
  internal: boolean;
}

interface Props {
  shifts: ShiftItem[];
  driverNames: string[];
}

function Avatar({ initials, color, size }: { initials: string; color: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}aa)`, color: '#0a0c11', fontWeight: 600, fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {initials}
    </div>
  );
}

function ShStat({ label, value, sub, accent, icon, live }: { label: string; value: string | number; sub: string; accent: string; icon: string; live?: boolean }) {
  return (
    <div style={st.stat}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FleetIcon name={icon} size={15} />
        </div>
        {live && Number(value) > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'Geist Mono, monospace', color: 'var(--pos)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span style={st.pulse} /> LIVE
          </span>
        )}
      </div>
      <div className="mono tnum" style={{ marginTop: 14, fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function DayBar({ startMin, endMin, isLive }: { startMin: number; endMin: number; isLive: boolean }) {
  const startPct = (startMin / 1440) * 100;
  const endPct = (endMin / 1440) * 100;
  return (
    <div style={{ width: 160, position: 'relative' }}>
      <div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ marginLeft: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%`, height: '100%', background: isLive ? 'var(--pos)' : 'var(--accent)', borderRadius: 2 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9.5, color: 'var(--text-4)', fontFamily: 'Geist Mono, monospace' }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
    </div>
  );
}

function ShiftRow({ s, onClick, isLast }: { s: ShiftItem; onClick: () => void; isLast: boolean }) {
  const isLive = s.status === 'live';
  return (
    <div onClick={onClick} style={{ ...st.row, borderBottom: isLast ? 'none' : '1px solid var(--line-1)' }} className="fleetNavItem">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar initials={s.driverInitials} color={s.driverColor} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.driver}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <FleetIcon name="vehicle" size={11} />
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.vehicle}</span>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>
          {s.start} <span style={{ color: 'var(--text-4)', margin: '0 4px' }}>→</span> <span style={{ color: isLive ? 'var(--pos)' : 'var(--text-1)' }}>{s.end}</span>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
          {isLive ? `in for ${s.hours.toFixed(1)}h` : `${Math.floor(s.hours)}h ${String(Math.round((s.hours % 1) * 60)).padStart(2, '0')}m`}
        </div>
      </div>
      <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center' }}>
        <DayBar startMin={s.startMin} endMin={s.endMin} isLive={isLive} />
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'right' }}>
          <div className="mono tnum" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{s.mileage ? `${s.mileage.toLocaleString()} km` : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>start mileage</div>
        </div>
        {isLive ? <span style={st.livePill}><span style={st.pulse} /> LIVE</span> : <span style={st.donePill}>DONE</span>}
      </div>
    </div>
  );
}

function DetailItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div className="mono tnum" style={{ fontSize: 16, fontWeight: 500, color: accent || 'var(--text-1)' }}>{value}</div>
    </div>
  );
}

function ShiftDetailModal({ s, onClose }: { s: ShiftItem; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40, backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, width: 'min(460px, calc(100vw - 32px))', maxHeight: '80vh', overflowY: 'auto', zIndex: 41, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: 18, borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initials={s.driverInitials} color={s.driverColor} size={36} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{s.driver}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.vehicle} · {s.dayLabel}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, background: 'var(--bg-2)', border: 'none', color: 'var(--text-2)', borderRadius: 7, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <DetailItem label="Clock in" value={s.start} />
            <DetailItem label="Clock out" value={s.end} />
            <DetailItem label="Duration" value={s.status === 'live' ? `${s.hours.toFixed(1)}h` : `${Math.floor(s.hours)}h ${String(Math.round((s.hours % 1) * 60)).padStart(2, '0')}m`} />
            <DetailItem label="Start mileage" value={s.mileage ? `${s.mileage.toLocaleString()} km` : '—'} />
            <DetailItem label="Dashcam" value={s.dashcam ? 'Checked' : 'Not checked'} accent={s.dashcam ? 'var(--pos)' : 'var(--neg)'} />
            <DetailItem label="Interior" value={s.internal ? 'Checked' : 'Not checked'} accent={s.internal ? 'var(--pos)' : 'var(--neg)'} />
          </div>
          <a href={`/fleet/shifts/${s.id}`} style={{ display: 'block', textAlign: 'center', padding: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>View shift details</a>
        </div>
      </div>
    </>
  );
}

export default function ShiftsWorkspace({ shifts, driverNames }: Props) {
  const [filterDriver, setFilterDriver] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDay, setFilterDay] = useState('14d');
  const [selectedShift, setSelectedShift] = useState<ShiftItem | null>(null);

  const list = useMemo(() => {
    let l = shifts;
    if (filterDriver !== 'all') l = l.filter((s) => s.driver === filterDriver);
    if (filterStatus !== 'all') l = l.filter((s) => s.status === filterStatus);
    if (filterDay === 'today') l = l.filter((s) => s.dayOffset === 0);
    if (filterDay === '7d') l = l.filter((s) => s.dayOffset < 7);
    return l;
  }, [shifts, filterDriver, filterStatus, filterDay]);

  const grouped = useMemo(() => {
    const acc: Record<string, { label: string; dayOffset: number; shifts: ShiftItem[] }> = {};
    for (const s of list) {
      if (!acc[s.date]) acc[s.date] = { label: s.dayLabel, dayOffset: s.dayOffset, shifts: [] };
      acc[s.date].shifts.push(s);
    }
    return acc;
  }, [list]);

  const stats = useMemo(() => ({
    today: shifts.filter((s) => s.dayOffset === 0).length,
    live: shifts.filter((s) => s.status === 'live').length,
    week: shifts.filter((s) => s.dayOffset < 7).length,
    avgHours: shifts.length ? (shifts.reduce((a, x) => a + x.hours, 0) / shifts.length).toFixed(1) : '0.0',
  }), [shifts]);

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operations / Shifts</div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Driver shifts</h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>All clock-in / clock-out activity across the fleet</div>
        </div>
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <ShStat label="Live now" value={stats.live} sub="drivers on shift" accent="var(--pos)" icon="live" live />
        <ShStat label="Shifts today" value={stats.today} sub="clock-ins logged" accent="var(--text-1)" icon="shift" />
        <ShStat label="This week" value={stats.week} sub="across all drivers" accent="var(--accent)" icon="roster" />
        <ShStat label="Avg duration" value={`${stats.avgHours}h`} sub="last 14 days" accent="var(--text-1)" icon="audit" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={st.tabs}>
            {[{ k: 'today', label: 'Today' }, { k: '7d', label: 'This week' }, { k: '14d', label: 'Last 14d' }].map((o) => (
              <button key={o.k} onClick={() => setFilterDay(o.k)} style={{ ...st.tab, ...(filterDay === o.k ? st.tabActive : {}) }}>{o.label}</button>
            ))}
          </div>
          <div style={st.selectWrap}>
            <FleetIcon name="driver" size={13} />
            <select value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)} style={st.select}>
              <option value="all">All drivers</option>
              {driverNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={st.selectWrap}>
            <FleetIcon name="filter" size={13} />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={st.select}>
              <option value="all">All statuses</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--text-1)' }} className="mono tnum">{list.length}</span> shifts
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, group]) => {
          const dayHours = group.shifts.reduce((a, x) => a + x.hours, 0);
          return (
            <div key={date}>
              <div style={st.dayHead}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{group.label}</span>
                  {group.dayOffset === 0 && <span style={st.todayPill}>Today</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span><span className="mono tnum" style={{ color: 'var(--text-1)' }}>{group.shifts.length}</span> shifts</span>
                  <span className="mono tnum" style={{ color: 'var(--text-1)' }}>{dayHours.toFixed(1)}h</span>
                </div>
              </div>
              <div style={st.card}>
                {group.shifts.slice().sort((a, b) => a.startMin - b.startMin).map((s, i) => (
                  <ShiftRow key={s.id} s={s} onClick={() => setSelectedShift(s)} isLast={i === group.shifts.length - 1} />
                ))}
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 }}>
            No shifts match your filters.
          </div>
        )}
      </div>

      {selectedShift && <ShiftDetailModal s={selectedShift} onClose={() => setSelectedShift(null)} />}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  pulse: { width: 6, height: 6, borderRadius: 99, background: 'currentColor', animation: 'fleetPulse 1.6s ease-in-out infinite', display: 'inline-block' },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5 },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  selectWrap: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)' },
  select: { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' },
  dayHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px' },
  todayPill: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  row: { display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1.3fr 1fr', gap: 14, padding: '12px 18px', alignItems: 'center', cursor: 'pointer' },
  livePill: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--pos)', background: 'var(--pos-soft)', padding: '3px 9px', borderRadius: 5, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  donePill: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '3px 9px', borderRadius: 5, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
};
