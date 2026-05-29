'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';

export type StaffStatus = 'active' | 'invited' | 'suspended';

export interface StaffItem {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: string;
  roleTone: string;
  status: StaffStatus;
  lastActive: string;
  email: string;
}

export interface RoleBreakdown {
  role: string;
  n: number;
  tone: string;
  perms: string;
}

interface Props {
  members: StaffItem[];
  roles: RoleBreakdown[];
  canManage: boolean;
}

const STAFF_STATUS: Record<StaffStatus, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: 'var(--pos)', bg: 'var(--pos-soft)', dot: 'var(--pos)' },
  invited: { label: 'Invited', color: 'var(--warn)', bg: 'var(--warn-soft)', dot: 'var(--warn)' },
  suspended: { label: 'Suspended', color: 'var(--text-3)', bg: 'var(--bg-3)', dot: 'var(--text-4)' },
};

function StaffStatusPill({ status }: { status: StaffStatus }) {
  const m = STAFF_STATUS[status] || STAFF_STATUS.active;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontFamily: 'Geist Mono, monospace', color: m.color, background: m.bg, padding: '3px 8px 3px 7px', borderRadius: 5, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: m.dot }} />{m.label}
    </span>
  );
}

function Avatar({ initials, color, size }: { initials: string; color: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 9, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}aa)`, color: '#0a0c11', fontWeight: 600, fontSize: size * 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {initials}
    </div>
  );
}

function StaffStat({ label, value, sub, icon, accent }: { label: string; value: number; sub: string; icon: string; accent: string }) {
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

export default function StaffWorkspace({ members, roles, canManage }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'active' | 'invited'>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: members.length,
    active: members.filter((s) => s.status === 'active').length,
    invited: members.filter((s) => s.status === 'invited').length,
  }), [members]);
  const roleCount = roles.length;

  const list = useMemo(() => {
    let l = members;
    if (filter === 'active') l = l.filter((s) => s.status === 'active');
    if (filter === 'invited') l = l.filter((s) => s.status === 'invited');
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((s) => s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    return l;
  }, [members, filter, search]);

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Operations / Staff</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Staff</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{counts.all}</span>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={st.primaryBtn} className="fleetHover" onClick={() => router.push('/fleet/staff/new')}>
              <FleetIcon name="plus" size={14} stroke={2.2} /> Invite member
            </button>
          </div>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <StaffStat label="Team members" value={counts.all} sub="back-office staff" icon="staff" accent="var(--text-1)" />
        <StaffStat label="Active" value={counts.active} sub="with dashboard access" icon="driver" accent="var(--pos)" />
        <StaffStat label="Roles" value={roleCount} sub="permission groups" icon="adjust" accent="var(--accent)" />
        <StaffStat label="Pending invites" value={counts.invited} sub="awaiting sign-up" icon="bell" accent="var(--warn)" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {([
            { k: 'all', label: 'All', n: counts.all, dot: undefined as string | undefined },
            { k: 'active', label: 'Active', n: counts.active, dot: 'var(--pos)' },
            { k: 'invited', label: 'Invited', n: counts.invited, dot: 'var(--warn)' },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, role, email…" style={st.searchInput} />
        </div>
      </div>

      <div className="split-detail" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <div style={st.card}>
          <div style={st.cardHeader}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Team members</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{list.length} of {counts.all}</div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--line-1)' }}>
            {list.map((s, i) => (
              <div key={s.id} style={{ ...st.row, borderBottom: i < list.length - 1 ? '1px solid var(--line-1)' : 'none', cursor: canManage ? 'pointer' : 'default' }} className={canManage ? 'fleetNavItem' : undefined} onClick={canManage ? () => router.push(`/fleet/staff/${s.id}`) : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <Avatar initials={s.initials} color={s.color} size={38} />
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: s.roleTone, flexShrink: 0 }} />{s.role}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>·</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{s.lastActive}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <StaffStatusPill status={s.status} />
                  {canManage && <span style={st.dotsBtn}><FleetIcon name="chevron-right" size={16} /></span>}
                </div>
              </div>
            ))}
            {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No staff match your filters.</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={st.card}>
            <div style={st.cardHeader}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Roles &amp; permissions</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Access by group</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 16px 12px' }}>
              {roles.map((r, i) => (
                <div key={i} style={{ ...st.roleRow, borderBottom: i < roles.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: r.tone, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{r.role}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, paddingLeft: 15 }}>{r.perms}</div>
                  </div>
                  <span className="mono tnum" style={{ fontSize: 12.5, color: 'var(--text-2)', flexShrink: 0 }}>{r.n}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={st.inviteCard}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <FleetIcon name="staff" size={17} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>Add someone to the team</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>Invite a manager, dispatcher, accountant or mechanic and choose exactly what they can see.</div>
            {canManage && (
              <button style={{ ...st.primaryBtn, marginTop: 14, width: '100%', justifyContent: 'center' }} className="fleetHover" onClick={() => router.push('/fleet/staff/new')}>
                <FleetIcon name="plus" size={14} stroke={2.2} /> Invite member
              </button>
            )}
          </div>
        </div>
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
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-3)', minWidth: 240 },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 18px' },
  dotsBtn: { width: 28, height: 28, color: 'var(--text-3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  roleRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 0', gap: 10 },
  inviteCard: { padding: '18px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 14 },
};
