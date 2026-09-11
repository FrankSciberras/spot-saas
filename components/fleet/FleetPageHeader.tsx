import type { CSSProperties, ReactNode } from 'react';

/**
 * The standard page header used by the fleet workspaces (Vehicles, Shifts…):
 * breadcrumb line, title with a muted count, and an optional action on the
 * right. Both the fleet dashboard and the driver portal use this so the two
 * always line up pixel for pixel.
 */
const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 16px' },
  crumb: { fontSize: 13, color: 'var(--text-3)', marginBottom: 4 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 14, rowGap: 10, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' },
  count: { fontSize: 14, color: 'var(--text-3)' },
};

export default function FleetPageHeader({
  breadcrumb,
  title,
  count,
  action,
}: {
  breadcrumb: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div style={st.header} className="header-mobile-row">
      <div>
        <div style={st.crumb}>{breadcrumb}</div>
        <div style={st.titleRow}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={st.title}>{title}</h1>
            {count !== undefined && <span className="mono tnum" style={st.count}>{count}</span>}
          </div>
          {action && <div style={{ display: 'flex', gap: 8 }}>{action}</div>}
        </div>
      </div>
    </div>
  );
}

/** The compact green button style the workspaces use for their primary action. */
export const fleetPrimaryBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
  background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7,
  fontSize: 13, fontWeight: 500, fontFamily: 'inherit', textDecoration: 'none', cursor: 'pointer',
};
