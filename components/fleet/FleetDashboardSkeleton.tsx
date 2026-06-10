import type { CSSProperties } from 'react';

/**
 * Loading placeholder for the Fleet dashboard. Mirrors the real
 * FleetDashboard layout (hero tiles → split panel → 3-up cards) so the
 * page doesn't reflow when data arrives. Shown as the Suspense fallback
 * while the dashboard queries run on the server.
 *
 * The `.fleet-skel` shimmer is defined globally in app/fleet/fleet-theme.css.
 */
export default function FleetDashboardSkeleton({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      {/* Hero strip */}
      <div style={{ padding: '24px 0 16px' }}>
        <div style={{ marginBottom: 18 }}>
          <Bar w={120} h={12} style={{ marginBottom: 8 }} />
          <Bar w={280} h={22} />
        </div>
        <div style={st.heroGrid} className="grid-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={st.tile}>
              <Bar w={90} h={10} />
              <Bar w={120} h={28} style={{ marginTop: 14 }} />
              <Bar w={140} h={12} style={{ marginTop: 14 }} />
            </div>
          ))}
        </div>
      </div>

      {/* Admin split: wide earnings panel + side card */}
      {isAdmin && (
        <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, marginBottom: 16 }}>
          <CardSkel lines={5} tall />
          <CardSkel lines={5} />
        </div>
      )}

      {/* 3-up cards */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <CardSkel lines={3} />
        <CardSkel lines={4} />
        <CardSkel lines={4} />
      </div>
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */
function CardSkel({ lines, tall }: { lines: number; tall?: boolean }) {
  return (
    <div style={st.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
        <div>
          <Bar w={100} h={13} />
          <Bar w={150} h={10} style={{ marginTop: 7 }} />
        </div>
        <Bar w={70} h={20} />
      </div>
      <div style={{ borderTop: '1px solid var(--line-1)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tall && <Bar w="100%" h={120} style={{ marginBottom: 4 }} />}
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bar w={28} h={28} style={{ borderRadius: 7, flexShrink: 0 }} />
            <Bar w={`${70 - i * 6}%`} h={12} />
            <Bar w={48} h={12} style={{ marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ w, h, style }: { w: number | string; h: number; style?: CSSProperties }) {
  return <div className="fleet-skel" style={{ width: w, height: h, borderRadius: 5, ...style }} />;
}

const st: Record<string, CSSProperties> = {
  heroGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  tile: { padding: '16px 16px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
};
