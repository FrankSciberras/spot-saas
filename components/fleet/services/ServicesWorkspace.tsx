'use client';

import { type CSSProperties, type ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { fmtEUR } from '@/components/fleet/FleetCharts';

export type SvcStatus = 'scheduled' | 'in_progress' | 'overdue' | 'completed';

export interface SvcRecord {
  id: string;
  vehicleId: string;
  plate: string;
  type: string;
  garage: string;
  mechanic: string;
  cost: number | null;
  date: string;
  status: SvcStatus;
  category: 'scheduled' | 'repair' | 'inspection';
}

export interface SpendMonth {
  label: string;
  v: number;
}

export interface DueSoonVehicle {
  vehicleId: string;
  plate: string;
  model: string;
  kmRemaining: number;
}

interface Props {
  records: SvcRecord[];
  spend6mo: SpendMonth[];
  dueSoon: DueSoonVehicle[];
  overdueCount: number;
  spendMonth: number;
}

const SVC_STATUS: Record<SvcStatus, { label: string; color: string; bg: string; dot: string }> = {
  scheduled: { label: 'Scheduled', color: 'var(--accent)', bg: 'var(--accent-soft)', dot: 'var(--accent)' },
  in_progress: { label: 'In service', color: 'var(--warn)', bg: 'var(--warn-soft)', dot: 'var(--warn)' },
  overdue: { label: 'Overdue', color: 'var(--neg)', bg: 'var(--neg-soft)', dot: 'var(--neg)' },
  completed: { label: 'Completed', color: 'var(--pos)', bg: 'var(--pos-soft)', dot: 'var(--pos)' },
};

const CAT_ICON: Record<string, string> = { scheduled: 'wrench', repair: 'damage', inspection: 'doc' };

function SvcStatusPill({ status }: { status: SvcStatus }) {
  const m = SVC_STATUS[status] || SVC_STATUS.scheduled;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: m.color, background: m.bg, padding: '3px 8px 3px 7px', borderRadius: 5, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: m.dot }} />
      {m.label}
    </span>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div style={st.card}>{children}</div>;
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={st.cardHeader}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function SvcStat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub: string; icon: string; accent: string }) {
  return (
    <div style={st.stat}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FleetIcon name={icon} size={15} />
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export default function ServicesWorkspace({ records, spend6mo, dueSoon, overdueCount, spendMonth }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | SvcStatus>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: records.length,
    scheduled: records.filter((s) => s.status === 'scheduled').length,
    in_progress: records.filter((s) => s.status === 'in_progress').length,
    overdue: overdueCount,
    completed: records.filter((s) => s.status === 'completed').length,
  }), [records, overdueCount]);

  const list = useMemo(() => {
    let l = records;
    if (filter !== 'all') l = l.filter((s) => s.status === filter);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((s) => s.plate.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.garage.toLowerCase().includes(q));
    }
    const rank: Record<SvcStatus, number> = { overdue: 0, in_progress: 1, scheduled: 2, completed: 3 };
    return [...l].sort((a, b) => (rank[a.status] - rank[b.status]) || (+new Date(a.date) - +new Date(b.date)));
  }, [records, filter, search]);

  const spend6moTotal = spend6mo.reduce((a, b) => a + b.v, 0);
  const spend6moMax = Math.max(1, ...spend6mo.map((x) => x.v));

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Maintenance / Services</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Services</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{counts.all}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={st.secondaryBtn} className="fleetHover" onClick={() => router.refresh()}>
            <FleetIcon name="filter" size={14} /> Refresh
          </button>
          <button style={st.primaryBtn} className="fleetHover" onClick={() => router.push('/fleet/services/new')}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> Schedule service
          </button>
        </div>
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <SvcStat label="In service now" value={counts.in_progress} sub="vehicles off the road" icon="wrench" accent="var(--warn)" />
        <SvcStat label="Scheduled" value={counts.scheduled} sub="upcoming bookings" icon="roster" accent="var(--accent)" />
        <SvcStat label="Overdue" value={counts.overdue} sub="need attention" icon="warning" accent="var(--neg)" />
        <SvcStat label="Spend this mo." value={fmtEUR(spendMonth, { decimals: 0 })} sub="parts & labour" icon="settle" accent="var(--pos)" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {([
            { k: 'all', label: 'All', n: counts.all, dot: undefined as string | undefined },
            { k: 'overdue', label: 'Overdue', n: counts.overdue, dot: 'var(--neg)' },
            { k: 'in_progress', label: 'In service', n: counts.in_progress, dot: 'var(--warn)' },
            { k: 'scheduled', label: 'Scheduled', n: counts.scheduled, dot: 'var(--accent)' },
            { k: 'completed', label: 'Completed', n: counts.completed, dot: 'var(--pos)' },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plate, work, garage…" style={st.searchInput} />
        </div>
      </div>

      <div className="split-detail" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card>
          <CardHeader title="Service records" subtitle={`${list.length} of ${counts.all} jobs`} />
          <div style={{ borderTop: '1px solid var(--line-1)' }}>
            {list.map((s, i) => {
              const d = new Date(s.date);
              const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
              return (
                <div
                  key={s.id}
                  style={{ ...st.svcRow, borderBottom: i < list.length - 1 ? '1px solid var(--line-1)' : 'none', cursor: 'pointer' }}
                  className="fleetNavItem"
                  onClick={() => router.push(`/fleet/vehicles/${s.vehicleId}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={st.svcIcon}><FleetIcon name={CAT_ICON[s.category] || 'wrench'} size={15} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>{s.type}</span>
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 4 }}>{s.plate}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                        {s.garage}{s.mechanic !== '—' && <> · {s.mechanic}</>}
                      </div>
                    </div>
                  </div>
                  <div style={st.svcRight}>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono tnum" style={{ fontSize: 13, fontWeight: 500, color: s.cost ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {s.cost ? fmtEUR(s.cost, { decimals: 0 }) : '—'}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: s.status === 'overdue' ? 'var(--neg)' : 'var(--text-3)', marginTop: 2 }}>{dateStr}</div>
                    </div>
                    <SvcStatusPill status={s.status} />
                  </div>
                </div>
              );
            })}
            {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No services match your filters.</div>}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardHeader title="Service spend" subtitle="Last 6 months · parts & labour" />
            <div style={{ padding: '16px 18px', borderTop: '1px solid var(--line-1)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{fmtEUR(spend6moTotal, { decimals: 0 })}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>last 6 mo.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
                {spend6mo.map((m, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: '100%', height: 70, display: 'flex', alignItems: 'flex-end' }}>
                      <div title={fmtEUR(m.v, { decimals: 0 })} style={{ width: '100%', height: `${(m.v / spend6moMax) * 100}%`, background: i === spend6mo.length - 1 ? 'var(--accent)' : 'var(--bg-3)', borderRadius: 4, minHeight: 4 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Due soon" subtitle="By distance to next service" />
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 14px 12px' }}>
              {dueSoon.map((v, i) => {
                const near = v.kmRemaining < 2000;
                const overdue = v.kmRemaining <= 0;
                return (
                  <div key={v.vehicleId} style={{ ...st.dueRow, borderBottom: i < dueSoon.length - 1 ? '1px solid var(--line-1)' : 'none', cursor: 'pointer' }} onClick={() => router.push(`/fleet/vehicles/${v.vehicleId}`)}>
                    <div style={{ minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{v.plate}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{v.model}</div>
                    </div>
                    <span className="mono tnum" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: near ? 'var(--warn-soft)' : 'var(--bg-2)', color: overdue ? 'var(--neg)' : near ? 'var(--warn)' : 'var(--text-2)' }}>
                      {overdue ? `${(Math.abs(v.kmRemaining) / 1000).toFixed(1)}k over` : `${(v.kmRemaining / 1000).toFixed(1)}k km`}
                    </span>
                  </div>
                );
              })}
              {dueSoon.length === 0 && <div style={{ padding: '14px 4px', color: 'var(--text-3)', fontSize: 12.5 }}>All vehicles up to date.</div>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, whiteSpace: 'nowrap' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 240 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' },
  svcRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 18px' },
  svcIcon: { width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'var(--bg-2)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  svcRight: { display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 },
  dueRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', gap: 10 },
};
