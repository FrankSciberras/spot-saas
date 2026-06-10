import type { CSSProperties } from 'react';

/**
 * Generic loading placeholder for the data-heavy /fleet workspace pages.
 * Rendered as a Suspense fallback inside FleetShell, so the sidebar + topbar
 * stay put while only the page body shimmers.
 *
 * Pick the `variant` that best matches the real page so the layout doesn't
 * jump when data arrives:
 *   list  – toolbar + stat tiles + a table of rows   (drivers, staff, shifts…)
 *   grid  – toolbar + stat tiles + a card grid        (vehicles, damages…)
 *   board – toolbar + a few tall panels               (settlements, financials…)
 *   form  – heading + stacked form fields             (settings, profile)
 *
 * The `.fleet-skel` shimmer is defined globally in app/fleet/fleet-theme.css.
 */
export type FleetSkeletonVariant = 'list' | 'grid' | 'board' | 'form';

export default function FleetPageSkeleton({
  variant = 'list',
  stats = 4,
  rows = 8,
}: {
  variant?: FleetSkeletonVariant;
  stats?: number;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {variant === 'form' ? (
        <FormSkel />
      ) : (
        <>
          <Toolbar />
          {stats > 0 && <StatRow n={stats} />}
          {variant === 'list' && <TableSkel rows={rows} />}
          {variant === 'grid' && <CardGrid n={rows} />}
          {variant === 'board' && <Board />}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */
function Toolbar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bar w={180} h={20} />
        <Bar w={260} h={12} />
      </div>
      <Bar w={130} h={36} style={{ borderRadius: 8 }} />
    </div>
  );
}

function StatRow({ n }: { n: number }) {
  return (
    <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 12 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={st.tile}>
          <Bar w={80} h={10} />
          <Bar w={110} h={26} style={{ marginTop: 14 }} />
          <Bar w={130} h={11} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

function TableSkel({ rows }: { rows: number }) {
  return (
    <div style={st.card}>
      <div style={st.tableHead}>
        <Bar w={140} h={12} />
        <Bar w={90} h={12} style={{ marginLeft: 'auto' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={st.tableRow}>
          <Bar w={28} h={28} style={{ borderRadius: 8, flexShrink: 0 }} />
          <Bar w={`${44 - (i % 4) * 5}%`} h={13} />
          <Bar w={70} h={13} style={{ marginLeft: 'auto' }} />
          <Bar w={56} h={22} style={{ borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

function CardGrid({ n }: { n: number }) {
  return (
    <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ ...st.card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bar w={40} h={40} style={{ borderRadius: 10, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
              <Bar w="70%" h={13} />
              <Bar w="45%" h={11} />
            </div>
          </div>
          <Bar w="100%" h={8} style={{ borderRadius: 999 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Bar w={60} h={11} />
            <Bar w={48} h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Board() {
  return (
    <div className="split-main-side" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
      <div style={{ ...st.card, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Bar w={160} h={14} />
        <Bar w="100%" h={200} style={{ borderRadius: 10 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} w={`${80 - i * 8}%`} h={12} />
        ))}
      </div>
      <div style={{ ...st.card, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Bar w={120} h={14} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bar w={24} h={24} style={{ borderRadius: 7, flexShrink: 0 }} />
            <Bar w={`${70 - i * 5}%`} h={12} />
            <Bar w={40} h={12} style={{ marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkel() {
  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Bar w={200} h={22} />
        <Bar w={320} h={12} />
      </div>
      <div style={{ ...st.card, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bar w={120} h={11} />
            <Bar w="100%" h={40} style={{ borderRadius: 8 }} />
          </div>
        ))}
        <Bar w={140} h={38} style={{ borderRadius: 8 }} />
      </div>
    </div>
  );
}

function Bar({ w, h, style }: { w: number | string; h: number; style?: CSSProperties }) {
  return <div className="fleet-skel" style={{ width: w, height: h, ...style }} />;
}

const st: Record<string, CSSProperties> = {
  tile: { padding: '16px 16px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  tableHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line-1)' },
  tableRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: '1px solid var(--line-1)' },
};
