'use client';

// =============================================================================
// OPERATOR PROFILE VIEW (platform-admin) — the full per-operator detail page.
// =============================================================================
// Renders everything about one fleet: subscription & billing state, the modules
// (apps) they've switched on, and their vehicles, drivers and members. Includes
// the same quick management actions as the console (plan / trial / status) plus a
// deep-link into Stripe for real invoices, and reuses OperatorDetailModal for the
// full name/slug/members editor.
// =============================================================================

import { useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  setFleetPlanAction,
  extendTrialAction,
  setFleetStatusAction,
} from '@/lib/actions/platform-billing';
import OperatorDetailModal from '../../console/OperatorDetailModal';
import type { OperatorProfile } from '@/lib/admin/operator-profile';
import type { PlanMeta } from '../../console/types';

const Icon = FleetIcon;

// ── formatters ──
const fmtEUR = (n: number, decimals = 0) =>
  '€' + n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const daysLeft = (iso: string | null): number => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f0a35e', '#7c9cff', '#f06464'];
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── status styling ──
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  suspended: { label: 'Suspended', color: 'var(--warn)', bg: 'var(--warn-soft)' },
  cancelled: { label: 'Cancelled', color: 'var(--text-3)', bg: 'var(--bg-3)' },
};
const rowStatusColor = (s: string): string =>
  s === 'active' ? 'var(--pos)' : s === 'inactive' || s === 'cancelled' ? 'var(--text-3)' : 'var(--warn)';

// ── primitives ──
const Card = ({ children, style = {} }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
    {children}
  </div>
);
const CardHeader = ({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12 }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line-1)' }}>
    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{label}</span>
    <span style={{ fontSize: 12.5, color: 'var(--text-1)', textAlign: 'right' }}>{children}</span>
  </div>
);

export default function OperatorProfileView({
  profile,
  planMeta,
  assignablePlans,
}: {
  profile: OperatorProfile;
  planMeta: Record<string, PlanMeta>;
  assignablePlans: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const color = colorFor(profile.id);
  const initials = initialsOf(profile.name);
  const st = STATUS_STYLE[profile.status] ?? STATUS_STYLE.active;
  const pm = planMeta[profile.plan] ?? { label: profile.planName, color: 'var(--text-2)', bg: 'var(--bg-3)' };
  const onTrial = profile.plan === 'trial';
  const trialDays = daysLeft(profile.trialEndsAt);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  };

  const enabledModules = profile.modules.filter((m) => m.enabled);
  const offModules = profile.modules.filter((m) => !m.enabled);

  return (
    <main style={s.main}>
      {/* Top bar */}
      <div style={s.topbar}>
        <Link href="/admin" style={s.back}>
          <Icon name="arrow-right" size={16} stroke={2} style={{ transform: 'scaleX(-1)' }} /> Operators
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={s.ghost} disabled={isPending} onClick={() => setEditOpen(true)}>
            <Icon name="adjust" size={13} /> Edit details &amp; members
          </button>
          {profile.stripeUrl && (
            <a style={s.ghost} href={profile.stripeUrl} target="_blank" rel="noreferrer">
              View in Stripe <Icon name="arrow-right" size={13} style={{ transform: 'rotate(-45deg)' }} />
            </a>
          )}
        </div>
      </div>

      <div style={s.scroll}>
        {/* Identity header */}
        <div style={s.hero}>
          <div style={{ ...s.avatar, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={s.h1}>{profile.name}</h1>
              <span style={{ ...s.pill, color: st.color, background: st.bg }}>{st.label}</span>
              <span style={{ ...s.pill, color: pm.color, background: pm.bg }}>{pm.label}</span>
            </div>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
              {profile.slug} · joined {fmtDate(profile.createdAt)}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={s.kpiRow} className="op-kpis">
          <Kpi label="Plan rate" value={onTrial ? '—' : fmtEUR(profile.planPrice)} suffix={onTrial ? 'trial' : '/mo'} />
          <Kpi label="MRR" value={profile.mrr > 0 ? fmtEUR(profile.mrr) : '—'} accent="var(--pos)" />
          <Kpi label="Vehicles" value={String(profile.counts.vehicles)} />
          <Kpi label="Drivers" value={String(profile.counts.drivers)} />
          <Kpi label="Members" value={String(profile.counts.members)} />
        </div>

        {/* Quick actions */}
        <Card style={{ marginBottom: 16 }}>
          <CardHeader title="Manage" subtitle="Plan, trial and account status" />
          <div style={{ borderTop: '1px solid var(--line-1)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</div>}
            <div style={s.actionRow}>
              <span style={s.actionLabel}>Plan</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {assignablePlans.map((p) => (
                  <button key={p} disabled={isPending || p === profile.plan} onClick={() => run(() => setFleetPlanAction(profile.id, p))}
                    style={{ ...s.mini, ...(p === profile.plan ? s.miniActive : {}) }}>
                    {(planMeta[p] ?? { label: p }).label}
                  </button>
                ))}
              </div>
            </div>
            <div style={s.actionRow}>
              <span style={s.actionLabel}>Trial</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button disabled={isPending} onClick={() => run(() => extendTrialAction(profile.id, 7))} style={s.mini}>+7 days</button>
                <button disabled={isPending} onClick={() => run(() => extendTrialAction(profile.id, 30))} style={s.mini}>+30 days</button>
              </div>
            </div>
            <div style={s.actionRow}>
              <span style={s.actionLabel}>Status</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {profile.status === 'active' ? (
                  <button disabled={isPending} onClick={() => run(() => setFleetStatusAction(profile.id, 'suspended'))} style={{ ...s.mini, color: 'var(--warn)', borderColor: 'var(--warn-soft)' }}>Suspend</button>
                ) : (
                  <button disabled={isPending} onClick={() => run(() => setFleetStatusAction(profile.id, 'active'))} style={s.mini}>Reactivate</button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div style={s.grid2} className="op-grid2">
          {/* Billing & subscription */}
          <Card>
            <CardHeader title="Billing & subscription"
              right={profile.stripeUrl
                ? <a style={s.link} href={profile.stripeUrl} target="_blank" rel="noreferrer">Invoices in Stripe <Icon name="arrow-right" size={11} style={{ transform: 'rotate(-45deg)' }} /></a>
                : undefined} />
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 18px 14px' }}>
              <Field label="Plan"><span style={{ color: pm.color, fontWeight: 500 }}>{profile.planName}</span></Field>
              <Field label="Monthly rate">{onTrial ? 'Free trial' : `${fmtEUR(profile.planPrice)} / mo`}</Field>
              <Field label="Subscription status">
                {profile.subscriptionStatus
                  ? <span className="mono" style={{ textTransform: 'capitalize' }}>{profile.subscriptionStatus.replace(/_/g, ' ')}</span>
                  : <span style={{ color: 'var(--text-3)' }}>{onTrial ? 'On trial' : 'No Stripe subscription'}</span>}
              </Field>
              {onTrial ? (
                <Field label="Trial ends">
                  {profile.trialEndsAt
                    ? <span style={{ color: trialDays <= 7 ? 'var(--warn)' : 'var(--text-1)' }}>{fmtDate(profile.trialEndsAt)} · {trialDays}d left</span>
                    : '—'}
                </Field>
              ) : (
                <Field label="Renews / expires">{fmtDate(profile.renewsAt)}</Field>
              )}
              <Field label="Plan activated">{fmtDate(profile.planActivatedAt)}</Field>
              <Field label="Customer">
                {profile.stripeCustomerId
                  ? <span className="mono" style={{ fontSize: 11.5 }}>{profile.stripeCustomerId}</span>
                  : <span style={{ color: 'var(--text-3)' }}>Not linked to Stripe</span>}
              </Field>
              {!profile.stripeCustomerId && (
                <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 10, lineHeight: 1.5 }}>
                  This operator has no Stripe customer — they were set up manually or haven&apos;t checked out. Real invoices appear here once they subscribe through Stripe.
                </div>
              )}
            </div>
          </Card>

          {/* Apps / modules */}
          <Card>
            <CardHeader title="Apps & modules" subtitle={`${enabledModules.length} of ${profile.modules.length} switched on`} />
            <div style={{ borderTop: '1px solid var(--line-1)', padding: 14 }}>
              <div style={s.modGrid}>
                {enabledModules.map((m) => (
                  <div key={m.key} style={s.modOn} title={m.tagline}>
                    <span style={{ color: 'var(--pos)', display: 'flex' }}><Icon name={m.icon} size={16} stroke={1.7} /></span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{m.name}</span>
                  </div>
                ))}
                {offModules.map((m) => (
                  <div key={m.key} style={s.modOff} title={m.status === 'coming-soon' ? 'Coming soon' : m.tagline}>
                    <span style={{ color: 'var(--text-4)', display: 'flex' }}><Icon name={m.icon} size={16} stroke={1.7} /></span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{m.name}</span>
                    {m.status === 'coming-soon' && <span style={s.soon}>soon</span>}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Vehicles */}
        <Card style={{ marginTop: 16 }}>
          <CardHeader title="Vehicles" subtitle={`${profile.counts.vehicles} in this fleet`} />
          {profile.vehicles.length === 0 ? (
            <div style={s.empty}>No vehicles yet.</div>
          ) : (
            <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
              <table style={s.table}>
                <thead><tr>{['Registration', 'Make & model', 'Year', 'Status', 'Assigned driver'].map((h, i) => (
                  <th key={h} style={{ ...s.th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {profile.vehicles.map((v, i) => (
                    <tr key={v.id} style={{ borderBottom: i < profile.vehicles.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                      <td style={s.td}><span className="mono" style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 500 }}>{v.registration}</span></td>
                      <td style={s.td}><span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</span></td>
                      <td style={{ ...s.td, textAlign: 'right' }}><span className="mono" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{v.year ?? '—'}</span></td>
                      <td style={s.td}><span style={{ fontSize: 11.5, color: rowStatusColor(v.status), textTransform: 'capitalize' }}>{v.status}</span></td>
                      <td style={s.td}><span style={{ fontSize: 12.5, color: v.assignedDriver ? 'var(--text-2)' : 'var(--text-4)' }}>{v.assignedDriver ?? 'Unassigned'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Drivers */}
        <Card style={{ marginTop: 16 }}>
          <CardHeader title="Drivers" subtitle={`${profile.counts.drivers} in this fleet`} />
          {profile.drivers.length === 0 ? (
            <div style={s.empty}>No drivers yet.</div>
          ) : (
            <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
              <table style={s.table}>
                <thead><tr>{['Driver', 'Status', 'Assigned vehicle'].map((h) => (
                  <th key={h} style={{ ...s.th, textAlign: 'left' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {profile.drivers.map((d, i) => (
                    <tr key={d.id} style={{ borderBottom: i < profile.drivers.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                      <td style={s.td}><span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{d.fullName}</span></td>
                      <td style={s.td}><span style={{ fontSize: 11.5, color: rowStatusColor(d.status), textTransform: 'capitalize' }}>{d.status}</span></td>
                      <td style={s.td}><span className="mono" style={{ fontSize: 12.5, color: d.assignedVehicle ? 'var(--text-2)' : 'var(--text-4)' }}>{d.assignedVehicle ?? 'Unassigned'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Members */}
        <Card style={{ marginTop: 16, marginBottom: 8 }}>
          <CardHeader title="Members" subtitle={`${profile.counts.members} admin / staff account${profile.counts.members === 1 ? '' : 's'}`}
            right={<button style={s.link} onClick={() => setEditOpen(true)}>Manage <Icon name="arrow-right" size={11} /></button>} />
          {profile.members.length === 0 ? (
            <div style={s.empty}>No members yet.</div>
          ) : (
            <div style={{ borderTop: '1px solid var(--line-1)', padding: '6px 18px 12px' }}>
              {profile.members.map((m, i) => (
                <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < profile.members.length - 1 ? '1px solid var(--line-1)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.fullName || m.email}</div>
                    {m.fullName && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.email}</div>}
                  </div>
                  <span style={{ ...s.pill, fontSize: 10.5, textTransform: 'uppercase', color: m.role === 'admin' ? 'var(--accent)' : 'var(--text-2)', background: m.role === 'admin' ? 'var(--accent-soft)' : 'var(--bg-3)' }}>{m.role}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editOpen && <OperatorDetailModal operatorId={profile.id} onClose={() => setEditOpen(false)} />}

      <style>{`
        @media (max-width: 860px) { .op-grid2 { grid-template-columns: 1fr !important; } }
        @media (max-width: 720px) { .op-kpis { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
    </main>
  );
}

const Kpi = ({ label, value, suffix, accent }: { label: string; value: string; suffix?: string; accent?: string }) => (
  <div style={s.kpi}>
    {accent && <div style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 2, background: accent, borderRadius: '0 0 2px 0' }} />}
    <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span className="mono tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{value}</span>
      {suffix && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{suffix}</span>}
    </div>
  </div>
);

const s: Record<string, CSSProperties> = {
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  topbar: { height: 'var(--topbar-h)', padding: '0 24px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--topbar-bg)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 },
  back: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', textDecoration: 'none', fontWeight: 500 },
  scroll: { padding: '24px', maxWidth: 1120, width: '100%', margin: '0 auto' },
  hero: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: { width: 52, height: 52, borderRadius: 12, flexShrink: 0, color: '#0a0c11', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.01em' },
  h1: { margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' },
  pill: { fontSize: 11, fontWeight: 500, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 },
  kpi: { position: 'relative', padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  actionRow: { display: 'flex', alignItems: 'center', gap: 14 },
  actionLabel: { fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', width: 60, flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 520 },
  th: { fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', padding: '11px 18px', borderBottom: '1px solid var(--line-1)', whiteSpace: 'nowrap' },
  td: { padding: '11px 18px', verticalAlign: 'middle' },
  empty: { padding: '28px 18px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)', borderTop: '1px solid var(--line-1)' },
  modGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 },
  modOn: { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-2)', border: '1px solid var(--line-2)' },
  modOff: { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, background: 'transparent', border: '1px dashed var(--line-1)', opacity: 0.72 },
  soon: { marginLeft: 'auto', fontSize: 9.5, fontFamily: 'Geist Mono, monospace', color: 'var(--text-4)', background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' },
  link: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, fontFamily: 'inherit', padding: '4px 6px', borderRadius: 5, cursor: 'pointer', textDecoration: 'none' },
  ghost: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none' },
  mini: { padding: '5px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniActive: { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' },
};
