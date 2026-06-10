'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import AddVehicleModal from '@/components/fleet/AddVehicleModal';

export interface DamageVehicle {
  id: string;
  plate: string;
  model: string;
  year: number | null;
  color: string;
  damages: { severe: number; open: number; total: number };
}

interface Props {
  vehicles: DamageVehicle[];
  canManage: boolean;
}

function CarTopMini({ color, damages }: { color: string; damages: number }) {
  return (
    <svg viewBox="0 0 40 60" style={{ width: 28, height: 42, display: 'block' }}>
      <rect x="8" y="4" width="24" height="52" rx="8" fill={color} stroke="var(--line-3)" strokeWidth="0.8" />
      <path d="M 11 12 Q 20 10, 29 12 L 28 22 Q 20 20, 12 22 Z" fill="var(--bg-2)" opacity="0.7" />
      <path d="M 11 48 Q 20 50, 29 48 L 28 38 Q 20 40, 12 38 Z" fill="var(--bg-2)" opacity="0.7" />
      {damages > 0 && <circle cx="30" cy="10" r="4" fill="var(--neg)" stroke="var(--bg-1)" strokeWidth="1" />}
    </svg>
  );
}

function DmgStat({ label, value, accent, icon }: { label: string; value: string | number; accent: string; icon: string }) {
  return (
    <div style={st.stat}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FleetIcon name={icon} size={15} />
        </div>
      </div>
      <div className="mono tnum" style={{ marginTop: 14, fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function DamagesWorkspace({ vehicles, canManage }: Props) {
  const router = useRouter();
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  const stats = {
    total: vehicles.reduce((s, v) => s + v.damages.total, 0),
    open: vehicles.reduce((s, v) => s + v.damages.open, 0),
    severe: vehicles.reduce((s, v) => s + v.damages.severe, 0),
    affected: vehicles.filter((v) => v.damages.total > 0).length,
  };

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Maintenance / Damages</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Fleet damages</h1>
          </div>
        </div>
        {canManage && (
          <button style={st.primaryBtn} className="fleetHover" onClick={() => setShowAddVehicle(true)}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> Add vehicle
          </button>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <DmgStat label="Total records" value={stats.total} accent="var(--text-1)" icon="audit" />
        <DmgStat label="Open damages" value={stats.open} accent="var(--warn)" icon="warning" />
        <DmgStat label="Severe · active" value={stats.severe} accent="var(--neg)" icon="damage" />
        <DmgStat label="Vehicles affected" value={`${stats.affected}/${vehicles.length}`} accent="var(--accent)" icon="vehicle" />
      </div>

      <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>By vehicle</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vehicles.map((v) => (
          <button key={v.id} onClick={() => router.push(`/fleet/vehicles/${v.id}/damages`)} style={st.vehicleRow} className="fleetNavItem">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              <div style={{ flexShrink: 0 }}>
                <CarTopMini color={v.color} damages={v.damages.severe} />
              </div>
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.03em' }}>{v.plate}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{v.model}{v.year ? ` (${v.year})` : ''}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {v.damages.total === 0 ? (
                <span style={{ fontSize: 11.5, color: 'var(--pos)', fontFamily: 'Geist Mono, monospace', letterSpacing: '0.04em' }}>NO DAMAGES</span>
              ) : (
                <>
                  {v.damages.severe > 0 && <span style={st.pillSevere}>{v.damages.severe} severe</span>}
                  <span style={st.pillOpen}>{v.damages.open} open</span>
                  <span style={st.pillTotal}>{v.damages.total} total</span>
                </>
              )}
              <FleetIcon name="chevron-right" size={14} />
            </div>
          </button>
        ))}
        {vehicles.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 12 }}>
            <p style={{ margin: 0 }}>No vehicles found.</p>
            {canManage && (
              <button
                style={{ ...st.primaryBtn, margin: '14px auto 0' }}
                className="fleetHover"
                onClick={() => setShowAddVehicle(true)}
              >
                <FleetIcon name="plus" size={14} stroke={2.2} /> Add your first vehicle
              </button>
            )}
          </div>
        )}
      </div>

      <AddVehicleModal
        open={showAddVehicle}
        onClose={() => setShowAddVehicle(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  vehicleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', gap: 14, color: 'var(--text-3)' },
  pillSevere: { fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--neg)', background: 'var(--neg-soft)', padding: '3px 9px', borderRadius: 5, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  pillOpen: { fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--warn)', background: 'var(--warn-soft)', padding: '3px 9px', borderRadius: 5, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  pillTotal: { fontSize: 11, fontFamily: 'Geist Mono, monospace', color: 'var(--text-3)', background: 'transparent', padding: '3px 4px', whiteSpace: 'nowrap' },
};
