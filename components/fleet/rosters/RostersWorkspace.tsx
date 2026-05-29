'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';

export interface RosterItem {
  id: string;
  title: string;
  range: string;
  created: string;
  published: string;
  status: string;
}

interface Props {
  rosters: RosterItem[];
  canManage: boolean;
}

function RosStat({ label, value, sub, accent, icon }: { label: string; value: string | number; sub: string; accent: string; icon: string }) {
  return (
    <div style={st.stat}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FleetIcon name={icon} size={15} />
      </div>
      <div className="mono" style={{ marginTop: 14, fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export default function RostersWorkspace({ rosters, canManage }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const current = rosters[0];
  const drafts = rosters.filter((r) => r.status === 'draft').length;
  const published = rosters.filter((r) => r.status === 'published').length;

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operations / Rosters</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Weekly schedules</h1>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Create and manage weekly rosters for your fleet</div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.size > 0 && (
              <button style={st.secondaryBtn}><FleetIcon name="dots" size={14} /> {selected.size} selected</button>
            )}
            <button style={st.primaryBtn} className="fleetHover" onClick={() => router.push('/fleet/rosters/new')}>
              <FleetIcon name="plus" size={14} stroke={2.2} /> New roster
            </button>
          </div>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <RosStat label="Current week" value={current ? current.title : '—'} sub={current && current.published !== '—' ? `Published ${current.published}` : 'no published roster'} accent="var(--pos)" icon="roster" />
        <RosStat label="Drafts" value={drafts} sub="awaiting publish" accent="var(--text-3)" icon="doc" />
        <RosStat label="Total rosters" value={rosters.length} sub="all time" accent="var(--text-1)" icon="audit" />
        <RosStat label="Published" value={published} sub="live schedules" accent="var(--accent)" icon="chart" />
      </div>

      <div style={st.cardsGrid} className="grid-4">
        {rosters.map((r) => {
          const isSel = selected.has(r.id);
          return (
            <div key={r.id} onClick={() => router.push(`/fleet/rosters/${r.id}`)} style={{ ...st.card, ...(isSel ? { borderColor: 'var(--accent-line)', background: 'var(--bg-2)' } : {}) }} className="fleetHover">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {canManage && (
                    <button onClick={(e) => toggle(e, r.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSel ? 'var(--accent)' : 'var(--line-2)'}`, background: isSel ? 'var(--accent)' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}>
                      {isSel && <FleetIcon name="check" size={11} stroke={3} />}
                    </button>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', textTransform: 'uppercase' }}>{r.title}</div>
                </div>
                <span style={r.status === 'published' ? st.statusPill : st.draftPill}>{r.status}</span>
              </div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>{r.range}</div>
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--line-1)', paddingTop: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Created</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{r.created}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>Published</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{r.published}</div>
                </div>
              </div>
            </div>
          );
        })}
        {rosters.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 }}>
            No rosters yet. Create your first weekly roster to schedule drivers.
          </div>
        )}
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  card: { padding: '16px 18px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12, cursor: 'pointer', transition: 'border-color 120ms ease, background 120ms ease' },
  statusPill: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--pos)', background: 'var(--pos-soft)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' },
  draftPill: { fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' },
};
