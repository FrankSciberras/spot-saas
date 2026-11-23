'use client';

// =============================================================================
// Admin Console → Analytics: the customer-insight sections — the conversion
// funnel, traffic by platform, enquiries, trials, revenue and retention, site
// friction, engagement details — plus the CSV export. The website sections are
// fed by /api/admin/analytics (+ /extras); the business ones by
// /api/admin/analytics/business. Every section says plainly when its data
// isn't being collected yet, rather than showing a misleading zero.
// =============================================================================

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { BusinessData, ExtrasData, SpeedRow, TrialRow } from '@/lib/analytics/business-types';
import { BarList, Card, CardHeader, Delta, Empty, Kpi, Stat, Tabs, chip, chipActive, fmtDur, fmtNum, fmtPct, ratio, td, th, whenShort, type Column } from './analytics-ui';
import type { Conversion, Dashboard, Metric, Row } from './analytics-types';

const Icon = FleetIcon;

export const fmtMoney = (n: number, decimals = 0) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

// ── Notices ───────────────────────────────────────────────────────────────────
export function Notice({ title, children, tone = 'warn' }: { title: string; children: ReactNode; tone?: 'warn' | 'info' }) {
  return (
    <Card style={{ marginBottom: 16, borderColor: tone === 'warn' ? 'var(--warn-soft)' : 'var(--line-1)' }}>
      <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'warn' ? 'var(--warn-soft)' : 'var(--bg-3)', color: tone === 'warn' ? 'var(--warn)' : 'var(--text-2)' }}>
          <Icon name={tone === 'warn' ? 'warning' : 'info'} size={13} stroke={2.2} />
        </span>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, marginBottom: 2 }}>{title}</div>
          {children}
        </div>
      </div>
    </Card>
  );
}

/** Shown on a tab whose data needs migration 20261123 before it can be collected. */
export const MigrationNotice = ({ what }: { what: string }) => (
  <Notice title={`One step left: ${what}`}>
    Run <span className="mono" style={{ color: 'var(--text-1)' }}>supabase/migrations/20261123_analytics_insights.sql</span> in the Supabase SQL editor.
    Collection starts the moment it exists — the website and the Stripe webhook already send the data.
  </Notice>
);

const grid = (cols: string, extra: CSSProperties = {}): CSSProperties => ({ display: 'grid', gridTemplateColumns: cols, gap: 16, marginBottom: 16, ...extra });
const kpiGrid = (n: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 10, marginBottom: 16 });

function Table({ head, rows, minWidth = 560, align }: { head: string[]; rows: ReactNode[][]; minWidth?: number; align?: ('left' | 'right')[] }) {
  return (
    <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        <thead>
          <tr>{head.map((h, i) => <th key={h} style={{ ...th, textAlign: align?.[i] ?? (i === 0 ? 'left' : 'right') }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--line-1)' }}>
              {r.map((c, j) => <td key={j} className={j > 0 && (align?.[j] ?? 'right') === 'right' ? 'mono tnum' : undefined} style={{ ...td, textAlign: align?.[j] ?? (j === 0 ? 'left' : 'right') }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShowMore({ total, shown, onMore }: { total: number; shown: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <div style={{ padding: '10px 18px 14px', borderTop: '1px solid var(--line-1)' }}>
      <button onClick={onMore} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
        Show more ({total - shown} left)
      </button>
    </div>
  );
}

const Pill = ({ children, tone }: { children: ReactNode; tone: 'pos' | 'warn' | 'neg' | 'muted' | 'accent' }) => {
  const c = { pos: ['var(--pos-soft)', 'var(--pos)'], warn: ['var(--warn-soft)', 'var(--warn)'], neg: ['var(--neg-soft)', 'var(--neg)'], muted: ['var(--bg-3)', 'var(--text-2)'], accent: ['var(--accent-soft)', 'var(--accent)'] }[tone];
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: c[0], color: c[1], whiteSpace: 'nowrap' }}>{children}</span>;
};

const Muted = ({ children }: { children: ReactNode }) => <span style={{ color: 'var(--text-4)' }}>{children}</span>;

// ── Overview: the five headline numbers ──────────────────────────────────────
export function OverviewKpis({ data, business, metric, onMetric }: { data: Dashboard; business: BusinessData | null; metric: Metric; onMetric: (m: Metric) => void }) {
  const cur = data.kpis.current;
  const prev = data.kpis.previous;
  const b = business?.current;
  const bp = business?.previous;
  const val = (n: number | undefined) => (n == null ? '—' : fmtNum(n));
  const delta = (c: number | undefined, p: number | undefined) => (c == null || p == null ? <span /> : <Delta cur={c} prev={p} />);
  return (
    <div className="an-kpis an-kpis-5" style={kpiGrid(5)}>
      <Kpi label="Website visitors" value={fmtNum(cur.visitors)} delta={<Delta cur={cur.visitors} prev={prev.visitors} />} sub={`vs ${fmtNum(prev.visitors)}`}
        active={metric === 'visitors'} onClick={() => onMetric('visitors')}
        hint="Unique visitors to the public website. Without cookies a person counts once per day; visitors who allowed cookies count once." />
      <Kpi label="Enquiries" value={fmtNum(cur.leads)} delta={<Delta cur={cur.leads} prev={prev.leads} />} sub="contact form + chat"
        active={metric === 'leads'} onClick={() => onMetric('leads')}
        hint="Contact-form messages (including demo requests) and leads left in the website chat." />
      <Kpi label="Registrations" value={val(b?.registrations)} delta={delta(b?.registrations, bp?.registrations)} sub={b ? `${fmtNum(b.accounts)} started` : 'loading…'}
        hint="Self-serve accounts created in this period that verified their email. “Started” includes those that never verified." />
      <Kpi label="Trials started" value={val(b?.trials ?? cur.signups)} delta={delta(b?.trials ?? cur.signups, bp?.trials ?? prev.signups)} sub="new fleets"
        active={metric === 'signups'} onClick={() => onMetric('signups')}
        hint="Fleets created — every new fleet starts on the free trial. The chart shows the ones the website analytics saw." />
      <Kpi label="New paid fleets" value={val(b?.paid)} delta={delta(b?.paid, bp?.paid)} sub={b ? `+${fmtMoney(b.newMrr)} MRR` : 'loading…'}
        hint="Fleets that started a paid subscription in this period." />
    </div>
  );
}

// ── The conversion funnel, visit → paid ──────────────────────────────────────
export function ConversionFunnel({ visitors, business }: { visitors: number; business: BusinessData | null }) {
  if (!business) return <Card style={{ marginBottom: 16 }}><CardHeader title="Conversion funnel" /><Empty>Loading accounts…</Empty></Card>;
  const f = business.funnel;
  const steps = [
    { key: 'visit', title: 'Visited the website', hint: 'Unique visitors in this period', value: visitors },
    { key: 'reg', title: 'Registered', hint: 'Created an account and verified their email', value: f.registrations },
    { key: 'trial', title: 'Started a trial', hint: 'Created their fleet — the free trial starts then', value: f.trials },
    { key: 'active', title: 'Activated their account', hint: 'Added at least one vehicle and one driver', value: f.activated },
    { key: 'paid', title: 'Paid subscription', hint: 'On a paid plan today (or paid before cancelling)', value: f.paid },
  ];
  const base = steps[0].value || 1;
  let worst = -1;
  let worstRate = 1;
  // Visit → registration is always the steepest step (most visitors are just
  // looking), so the warning goes to the weakest step after registering.
  steps.forEach((s, i) => {
    if (i < 2) return;
    const r = ratio(s.value, steps[i - 1].value);
    if (steps[i - 1].value > 0 && r < worstRate) { worstRate = r; worst = i; }
  });
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title="Conversion funnel" subtitle="People who visited in this period, and the fleets created in it followed to today" />
      <div className="an-funnel" style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, borderTop: '1px solid var(--line-1)' }}>
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : 0;
          const kept = i > 0 ? ratio(s.value, prev) : 1;
          return (
            <div key={s.key} title={s.hint} style={{ padding: '14px 16px', borderLeft: i ? '1px solid var(--line-1)' : 'none', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {s.title}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--text-1)', marginTop: 8 }}>{fmtNum(s.value)}</div>
              <div style={{ height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, Math.max((s.value / base) * 100, s.value ? 2 : 0))}%`, height: '100%', background: i === worst ? 'var(--warn)' : 'var(--accent)' }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 7, lineHeight: 1.45 }}>
                {i === 0 ? '100%' : prev > 0 ? <>{fmtPct(kept)} continued · <span style={{ color: i === worst ? 'var(--warn)' : 'var(--text-3)' }}>{fmtPct(1 - kept)} dropped off</span></> : '—'}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '10px 18px 12px', fontSize: 11, color: 'var(--text-4)', borderTop: '1px solid var(--line-1)', lineHeight: 1.5 }}>
        Visitors come from the website analytics; every later step is counted from the accounts themselves, so ad blockers can’t hide them. Orange marks the weakest step once someone has registered.
      </div>
    </Card>
  );
}

// ── Traffic: Google / Meta / LinkedIn / email / other ────────────────────────
const META = new Set(['Facebook', 'Instagram', 'Messenger', 'Threads', 'WhatsApp', 'Meta AI']);
export const PLATFORMS = ['Google', 'Meta', 'LinkedIn', 'Email', 'AI assistants', 'Other referrals', 'Direct', 'Not tracked'] as const;
export type Platform = (typeof PLATFORMS)[number];
export function platformOf(channel: string | null | undefined, source: string | null | undefined): Platform {
  if (channel === 'Not tracked' || source === 'Not tracked') return 'Not tracked';
  if (source === 'Google') return 'Google';
  if (source && META.has(source)) return 'Meta';
  if (source === 'LinkedIn') return 'LinkedIn';
  if (channel === 'Email') return 'Email';
  if (channel === 'AI Assistants') return 'AI assistants';
  if (!channel || channel === 'Direct') return 'Direct';
  return 'Other referrals';
}
const PLATFORM_HINT: Record<Platform, string> = {
  Google: 'Google search (unpaid and ads)',
  Meta: 'Facebook, Instagram, Messenger, WhatsApp and Threads — posts and ads',
  LinkedIn: 'LinkedIn posts, messages and ads',
  Email: 'Newsletters, email signatures and webmail links',
  'AI assistants': 'ChatGPT, Perplexity, Gemini, Copilot…',
  'Other referrals': 'Other websites, other social networks, video sites',
  Direct: 'Typed the address, bookmarks, or apps that hide where the link was',
  'Not tracked': 'Signed up without the website analytics seeing their visit (ad blocker, another device)',
};

export function platformRows(data: Dashboard, business: BusinessData | null) {
  const m = new Map<Platform, { platform: Platform; visitors: number; visits: number; signups: number; leads: number; paying: number }>();
  const row = (p: Platform) => m.get(p) ?? m.set(p, { platform: p, visitors: 0, visits: 0, signups: 0, leads: 0, paying: 0 }).get(p)!;
  for (const s of data.sources) {
    const r = row(platformOf(s.extra ?? null, s.name));
    r.visitors += s.visitors;
    r.visits += s.visits;
    r.signups += s.signups ?? 0;
    r.leads += s.leads ?? 0;
  }
  for (const a of business?.attribution ?? []) row(platformOf(a.channel, a.source)).paying += a.paying;
  return PLATFORMS.map((p) => m.get(p)).filter((r): r is NonNullable<typeof r> => !!r && (r.visitors > 0 || r.paying > 0 || r.signups > 0));
}

export function TrafficPlatforms({ data, business }: { data: Dashboard; business: BusinessData | null }) {
  const rows = platformRows(data, business);
  const maxV = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title="Traffic sources" subtitle="Visitors, sign-ups and paying customers per platform · hover a platform for what it includes" />
      {rows.length === 0 ? <Empty>No visits in this period.</Empty> : (
        <Table minWidth={640}
          head={['Platform', 'Visitors', 'Sign-ups', 'Enquiries', 'Paying customers', 'Visitor → sign-up']}
          rows={rows.map((r) => [
            <span key="n" title={PLATFORM_HINT[r.platform]} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
              <span style={{ width: 70, height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                <span style={{ display: 'block', width: `${(r.visitors / maxV) * 100}%`, height: '100%', background: 'var(--accent)' }} />
              </span>
              <span style={{ color: 'var(--text-1)', fontSize: 13 }}>{r.platform}</span>
            </span>,
            fmtNum(r.visitors),
            r.signups ? fmtNum(r.signups) : <Muted>0</Muted>,
            r.leads ? fmtNum(r.leads) : <Muted>0</Muted>,
            r.paying ? <strong key="p" style={{ color: 'var(--text-1)', fontWeight: 600 }}>{fmtNum(r.paying)}</strong> : <Muted>0</Muted>,
            r.signups ? fmtPct(ratio(r.signups, r.visitors)) : <Muted>—</Muted>,
          ])} />
      )}
      <div style={{ padding: '10px 18px 12px', fontSize: 11, color: 'var(--text-4)', borderTop: '1px solid var(--line-1)', lineHeight: 1.5 }}>
        Sign-ups are new fleets credited to the visit they came from. Paying customers are fleets that started paying in this period, credited to the visit they <em>signed up</em> from.
      </div>
    </Card>
  );
}

export function CampaignPerformance({ data, business, onFilter }: { data: Dashboard; business: BusinessData | null; onFilter: (k: string, v: string) => void }) {
  const payingBy = new Map<string, number>();
  for (const a of business?.attribution ?? []) if (a.campaign) payingBy.set(a.campaign, (payingBy.get(a.campaign) ?? 0) + a.paying);
  const rows = data.campaigns.filter((c) => c.name !== '(not set)');
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title="Campaigns" subtitle="Every tagged link (utm_campaign) — click one to filter the page by it" />
      {rows.length === 0 ? (
        <Empty>No campaign-tagged visits in this period. Build tagged links with the campaign link builder at the bottom of this tab for every ad, post, email and QR code.</Empty>
      ) : (
        <Table minWidth={680}
          head={['Campaign', 'Source / medium', 'Visitors', 'Sign-ups', 'Enquiries', 'Paying']}
          align={['left', 'left', 'right', 'right', 'right', 'right']}
          rows={rows.map((c) => [
            <button key="c" className="an-link" onClick={() => onFilter('campaign', c.name)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-1)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>{c.name}</button>,
            <span key="s" className="mono" style={{ fontSize: 12 }}>{c.extra ?? '—'}</span>,
            fmtNum(c.visitors),
            c.signups ? fmtNum(c.signups) : <Muted>0</Muted>,
            c.leads ? fmtNum(c.leads) : <Muted>0</Muted>,
            payingBy.get(c.name) ? fmtNum(payingBy.get(c.name)!) : <Muted>0</Muted>,
          ])} />
      )}
    </Card>
  );
}

// ── Audience ──────────────────────────────────────────────────────────────────
export function NewVsReturning({ data }: { data: Dashboard }) {
  const total = data.loyalty.consented_visitors;
  const ret = data.loyalty.returning;
  const fresh = Math.max(0, total - ret);
  return (
    <Card>
      <CardHeader title="New vs returning visitors" subtitle="Measured on visitors who allowed the analytics cookie — the only ones we can recognise again" />
      {total === 0 ? <Empty>No visitors allowed the cookie in this period, so there’s nobody to recognise yet.</Empty> : (
        <div style={{ padding: '0 18px 16px' }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-2)' }}>
            <div style={{ width: `${ratio(fresh, total) * 100}%`, background: 'var(--accent)' }} />
            <div style={{ width: `${ratio(ret, total) * 100}%`, background: '#3987e5' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <Stat value={`${fmtPct(ratio(fresh, total))}`} label={<><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', marginRight: 6 }} />new — first visit ever ({fmtNum(fresh)})</>} />
            <Stat value={`${fmtPct(ratio(ret, total))}`} label={<><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#3987e5', marginRight: 6 }} />returning — visited before ({fmtNum(ret)})</>} />
          </div>
        </div>
      )}
    </Card>
  );
}

export function DeviceEngagement({ extras }: { extras: ExtrasData | null }) {
  const rows = extras?.engagement.by_device ?? [];
  return (
    <Card>
      <CardHeader title="Engagement by device" subtitle="How visits on each kind of device behave" />
      {!extras ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No visits in this period.</Empty> : (
        <Table head={['Device', 'Visits', 'Engaged', 'Bounce', 'Avg. time']}
          rows={rows.map((r) => [
            <span key="d" style={{ color: 'var(--text-1)', fontSize: 13 }}>{r.device}</span>,
            fmtNum(r.visits),
            fmtPct(ratio(r.engaged, r.visits)),
            fmtPct(ratio(r.bounces, r.visits)),
            fmtDur(ratio(r.engaged_ms, r.visits)),
          ])} />
      )}
      <div style={{ padding: '10px 18px 12px', fontSize: 11, color: 'var(--text-4)', borderTop: '1px solid var(--line-1)' }}>Engaged = 10 s+ on screen, a second page, or a click.</div>
    </Card>
  );
}

// ── Pages & engagement ───────────────────────────────────────────────────────
export function PagesBeforeSignup({ extras, onFilter }: { extras: ExtrasData | null; onFilter: (k: string, v: string) => void }) {
  const b = extras?.before_signup;
  const rows = (b?.pages ?? []).map((p) => ({ name: p.path, visitors: p.signups, visits: p.signups }));
  return (
    <Card>
      <CardHeader title="Pages viewed before signing up" subtitle={b && b.tracked ? `Across ${fmtNum(b.tracked)} new fleet${b.tracked === 1 ? '' : 's'} · ${b.avg_pages} pages each on average` : 'What new fleets read in the 30 days before they signed up'} />
      {!extras ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>No tracked sign-ups in this period yet. Each new fleet whose visits we saw adds the pages it read here.</Empty>
      ) : (
        <BarList rows={rows} label="Page" keyOf={(r) => r.name} value={(r) => r.visitors}
          name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
          columns={[
            { label: 'Sign-ups', width: 60, render: (r) => fmtNum(r.visitors) },
            { label: 'Share', width: 50, title: 'Share of tracked sign-ups that read this page', render: (r) => fmtPct(ratio(r.visitors, b?.tracked ?? 0)) },
          ]}
          onSelect={(r) => onFilter('page', r.name)} empty="" />
      )}
    </Card>
  );
}

export function ScrollDepth({ data, extras }: { data: Dashboard; extras: ExtrasData | null }) {
  const s = extras?.scroll;
  const e = extras?.engagement;
  const bars = s ? [['25%', s.r25], ['50%', s.r50], ['75%', s.r75], ['Bottom', s.r100]] as const : [];
  return (
    <Card>
      <CardHeader title="Engagement" subtitle="Reading time and how far down pages people scroll" />
      {!extras || !s || !e ? <Empty>Loading…</Empty> : (
        <div style={{ padding: '0 18px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat value={fmtDur(ratio(data.kpis.current.engaged_ms, data.kpis.current.visits))} label="avg. time per visit, on screen" />
            <Stat value={s.measured ? fmtDur(s.avg_engaged_ms) : '—'} label="avg. time per page" />
            <Stat value={fmtPct(ratio(e.engaged, e.visits))} label={`engaged visits (${fmtNum(e.engaged)} of ${fmtNum(e.visits)})`} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>Scroll depth · share of page views that reached…</div>
          {s.measured === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No page views measured yet.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bars.map(([label, n]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 52, fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${ratio(n, s.measured) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <span className="mono tnum" style={{ width: 44, textAlign: 'right', fontSize: 12, color: 'var(--text-1)' }}>{fmtPct(ratio(n, s.measured))}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Average deepest scroll {s.avg_scroll}% · {fmtNum(s.measured)} page views measured</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type ContentTab = 'videos' | 'screenshots' | 'sections' | 'features';
export function ContentInteractions({ data, extras }: { data: Dashboard; extras: ExtrasData | null }) {
  const [tab, setTab] = useState<ContentTab>('sections');
  const events = data.events;
  const ev = (name: string) => events.filter((e) => e.name === name).map((e) => ({ name: e.label ?? '—', visitors: e.visitors, visits: e.count }));
  const seen = (name: 'Section viewed' | 'Screenshot viewed') =>
    (extras?.seen ?? []).filter((s) => s.name === name).map((s) => ({ name: s.label, visitors: s.visits, visits: s.page_visits }));
  const shotClicks = new Map(ev('Screenshot click').map((r) => [r.name, r.visits]));
  const rows = tab === 'videos' ? ev('Video played') : tab === 'features' ? ev('Feature opened') : seen(tab === 'sections' ? 'Section viewed' : 'Screenshot viewed');
  const shareCol: Column<Row> = { label: 'Of page visits', width: 84, title: 'Visits that saw it ÷ visits to that page', render: (r) => (r.visits ? fmtPct(Math.min(1, ratio(r.visitors, r.visits))) : '—') };
  const columns: Column<Row>[] =
    tab === 'videos' || tab === 'features'
      ? [{ label: tab === 'videos' ? 'Plays' : 'Opens', width: 52, render: (r) => fmtNum(r.visits) }, { label: 'Visitors', width: 58, render: (r) => fmtNum(r.visitors) }]
      : tab === 'screenshots'
        ? [{ label: 'Seen', width: 50, render: (r) => fmtNum(r.visitors) }, shareCol, { label: 'Clicks', width: 50, render: (r) => fmtNum(shotClicks.get(r.name) ?? 0) }]
        : [{ label: 'Seen', width: 50, title: 'Visits that scrolled to it', render: (r) => fmtNum(r.visitors) }, shareCol];
  const needsNotes = tab === 'sections' || tab === 'screenshots';
  return (
    <Card>
      <CardHeader title="Interactions with the content" subtitle="Which videos, screenshots and feature sections people actually engage with"
        right={<Tabs tabs={[['sections', 'Sections'], ['screenshots', 'Screenshots'], ['videos', 'Videos'], ['features', 'Feature list']]} value={tab} onChange={setTab} />} />
      {needsNotes && !extras ? <Empty>Loading…</Empty> : (
        <BarList rows={rows as Row[]} label={tab === 'sections' ? 'Section (page#section)' : tab === 'screenshots' ? 'Screenshot (page · screen)' : tab === 'videos' ? 'Video' : 'Feature opened on the homepage'}
          keyOf={(r) => r.name} value={(r) => r.visitors}
          name={(r) => <span className={tab === 'sections' || tab === 'screenshots' ? 'mono' : undefined} style={{ fontSize: tab === 'sections' || tab === 'screenshots' ? 12 : 13 }}>{r.name}</span>}
          columns={columns}
          empty={needsNotes
            ? (extras?.notes_since ? 'Nothing seen in this period yet.' : 'Starts counting once the 20261123 analytics migration is applied — every section and product screenshot that scrolls into view is then recorded.')
            : tab === 'videos' ? 'No video plays in this period.' : 'Nobody opened an item in the homepage feature list in this period.'} />
      )}
    </Card>
  );
}

export function HeatmapsCard() {
  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHeader title="Heatmaps & session recordings (optional)" subtitle="See where visitors click, scroll and get stuck" />
      <div style={{ padding: '0 18px 16px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
        These come from a dedicated tool rather than Rovora’s own analytics. The simplest is <strong style={{ color: 'var(--text-1)', fontWeight: 500 }}>Microsoft Clarity</strong> (free).
        It plugs into the Google Tag Manager container the site already has, so it loads only for visitors who click <em>Allow</em> on the cookie banner — no code change needed:
        <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <li>Create a free project at <a className="an-link" href="https://clarity.microsoft.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>clarity.microsoft.com</a> for rovora.eu.</li>
          <li>In Clarity → <em>Settings → Masking</em>, choose <strong style={{ color: 'var(--text-1)', fontWeight: 500 }}>Strict</strong> so every bit of text and every form field is hidden in recordings.</li>
          <li>In Google Tag Manager (GTM-MP2LKF59), add the <em>Microsoft Clarity</em> tag from the template gallery with your project ID, firing on all pages, then Publish.</li>
          <li>Add a line about Microsoft Clarity to the privacy policy’s list of providers.</li>
        </ol>
      </div>
    </Card>
  );
}

// ── Enquiries ─────────────────────────────────────────────────────────────────
const CLICK_HINT: Record<string, string> = {
  'WhatsApp click': 'Tapped a WhatsApp link',
  'Email click': 'Clicked an email address',
  'Phone click': 'Tapped a phone number',
  'Book demo click': 'Clicked a “Book a demo” link',
  'Contact click': 'Clicked a link to the contact page',
};
export function EnquiriesSection({ data, extras, onFilter }: { data: Dashboard; extras: ExtrasData | null; onFilter: (k: string, v: string) => void }) {
  const [clickTab, setClickTab] = useState<string>('WhatsApp click');
  const leads = data.conversions.filter((c) => c.type === 'Lead');
  const contact = leads.filter((c) => c.props.form !== 'chat');
  const demos = leads.filter((c) => c.props.demo);
  const chat = leads.filter((c) => c.props.form === 'chat');
  const clicks = (name: string) => data.events.filter((e) => e.name === name);
  const total = (name: string) => clicks(name).reduce((s, e) => s + e.count, 0);
  const people = (name: string) => clicks(name).reduce((s, e) => s + e.visitors, 0);

  const bySource = (() => {
    const m = new Map<string, { name: string; extra: string; visitors: number; visits: number }>();
    for (const c of leads) {
      const k = c.tracked ? c.source ?? 'Direct' : 'Not tracked';
      const r = m.get(k) ?? { name: k, extra: c.tracked ? c.channel ?? '' : '', visitors: 0, visits: 0 };
      r.visitors += 1;
      r.visits += 1;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.visitors - a.visitors);
  })();

  const deviceSplit = (name: string) => {
    const m = new Map<string, number>();
    for (const r of extras?.interactions ?? []) if (r.name === name) m.set(r.device, (m.get(r.device) ?? 0) + r.count);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const clickRows = clicks(clickTab).map((e) => ({ name: e.label ?? '—', visitors: e.visitors, visits: e.count }));
  const devices = deviceSplit(clickTab);
  return (
    <>
      <div className="an-kpis an-kpis-6" style={kpiGrid(6)}>
        <Kpi label="Contact form" value={fmtNum(contact.length)} delta={<span />} sub="sent successfully" hint="Messages sent through the /contact form (spam caught by the hidden field is not counted)." />
        <Kpi label="Demo requests" value={fmtNum(demos.length)} delta={<span />} sub="form or chat" hint="Enquiries from a “Book a demo / walkthrough” link, sales messages asking for a demo, and sales leads from the chat." />
        <Kpi label="Chat leads" value={fmtNum(chat.length)} delta={<span />} sub="website chat" hint="Contact details left in the website chat." />
        <Kpi label="WhatsApp clicks" value={fmtNum(total('WhatsApp click'))} delta={<span />} sub={`${fmtNum(people('WhatsApp click'))} people`} hint="Taps on WhatsApp links — reported separately because the conversation then happens in WhatsApp." />
        <Kpi label="Email clicks" value={fmtNum(total('Email click'))} delta={<span />} sub={`${fmtNum(people('Email click'))} people`} hint="Clicks on email addresses (mailto links)." />
        <Kpi label="Phone clicks" value={fmtNum(total('Phone click'))} delta={<span />} sub={`${fmtNum(people('Phone click'))} people`} hint="Taps on phone numbers." />
      </div>
      <div className="split-main-side" style={grid('minmax(0, 1fr) minmax(0, 1fr)')}>
        <Card>
          <CardHeader title="Where enquiries come from" subtitle="Form and chat enquiries, by the source of the visit that sent them" />
          <BarList rows={bySource} label="Source" keyOf={(r) => r.name} value={(r) => r.visitors}
            name={(r) => <>{r.name}<span style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.extra}</span></>}
            columns={[{ label: 'Enquiries', width: 70, render: (r) => fmtNum(r.visitors) }]}
            onSelect={(r) => (r.name === 'Not tracked' ? undefined : onFilter('source', r.name))}
            empty="No form or chat enquiries in this period." />
        </Card>
        <Card>
          <CardHeader title="Contact clicks, by where they happened" subtitle={CLICK_HINT[clickTab]}
            right={<Tabs tabs={[['WhatsApp click', 'WhatsApp'], ['Email click', 'Email'], ['Phone click', 'Phone'], ['Book demo click', 'Book demo'], ['Contact click', 'Contact page']]} value={clickTab} onChange={setClickTab} />} />
          <BarList rows={clickRows} label={clickTab === 'Email click' ? 'Address' : 'Where on the site'} keyOf={(r) => r.name} value={(r) => r.visits}
            name={(r) => <span className="mono" style={{ fontSize: 12 }}>{r.name}</span>}
            columns={[{ label: 'Clicks', width: 52, render: (r) => fmtNum(r.visits) }, { label: 'People', width: 54, render: (r) => fmtNum(r.visitors) }]}
            empty="No clicks of this kind in this period." />
          {devices.length > 0 && (
            <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--line-1)', fontSize: 12, color: 'var(--text-3)' }}>
              By device: {devices.map(([d, n]) => `${d} ${fmtNum(n)}`).join(' · ')}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ── Trials ────────────────────────────────────────────────────────────────────
const TRIAL_STATUS: Record<TrialRow['status'], { label: string; tone: 'pos' | 'warn' | 'neg' | 'muted' | 'accent' }> = {
  running: { label: 'Still running', tone: 'accent' },
  paid: { label: 'Paid', tone: 'pos' },
  expired: { label: 'Expired unpaid', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};
const cohortLabel = (start: string, unit: BusinessData['trials']['cohortUnit']) => {
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (unit === 'month') return dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (unit === 'week') return `Week of ${dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export function TrialsSection({ business }: { business: BusinessData | null }) {
  const [limit, setLimit] = useState(15);
  const [only, setOnly] = useState<'all' | TrialRow['status'] | 'unused'>('all');
  if (!business) return <Card><Empty>Loading trials…</Empty></Card>;
  const t = business.trials;
  const cohorts = t.cohorts;
  const tot = cohorts.reduce((s, c) => ({ started: s.started + c.started, paid: s.paid + c.paid, expired: s.expired + c.expired, running: s.running + c.running, unused: s.unused + c.unused, activated: s.activated + c.activated }), { started: 0, paid: 0, expired: 0, running: 0, unused: 0, activated: 0 });
  const finished = tot.paid + tot.expired;
  const list = t.list.filter((r) => only === 'all' || (only === 'unused' ? r.vehicles === 0 && r.drivers === 0 : r.status === only));
  // "Now" is when the server built the answer — render stays pure.
  const now = Date.parse(business.generatedAt);
  const daysLeft = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - now) / 86_400_000) : null);
  return (
    <>
      <div className="an-kpis an-kpis-5" style={kpiGrid(5)}>
        <Kpi label="Active trials" value={fmtNum(t.active)} delta={<span />} sub="right now" hint="Fleets on the free trial whose trial hasn’t ended." />
        <Kpi label="Ending in 7 days" value={fmtNum(t.expiringSoon)} delta={<span />} sub="follow these up" hint="Active trials that end within the next 7 days." />
        <Kpi label="Unused trials" value={fmtNum(t.unused)} delta={<span />} sub={`${fmtPct(ratio(t.unused, t.active))} of active`} hint="Active trials with no vehicles and no drivers added — they signed up but never set anything up." />
        <Kpi label="Expired unpaid" value={fmtNum(t.expired)} delta={<span />} sub="all time" hint="Trials that ended (or were cancelled) without ever paying." />
        <Kpi label="Trial → paid" value={finished ? fmtPct(ratio(tot.paid, finished)) : '—'} delta={<span />} sub={finished ? `${fmtNum(tot.paid)} of ${fmtNum(finished)} finished` : 'no finished trials yet'}
          hint="Of the trials started in this period that have finished, the share that became paying. Trials still running are left out so they don’t drag the rate down." />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <CardHeader title="Trial-to-paid, by when the trial started" subtitle="Each row is the trials that started in that period, followed to today · “still running” trials haven’t finished, so their outcome is open" />
        {cohorts.length === 0 ? <Empty>No trials started in this period.</Empty> : (
          <Table minWidth={760}
            head={['Trial started', 'Trials', 'Activated', 'Unused', 'Paid', 'Expired unpaid', 'Still running', 'Trial → paid']}
            rows={[
              ...[...cohorts].reverse().map((c) => [
                <span key="l" style={{ color: 'var(--text-1)', fontSize: 13, whiteSpace: 'nowrap' }}>{cohortLabel(c.start, t.cohortUnit)}</span>,
                fmtNum(c.started), fmtNum(c.activated), c.unused ? fmtNum(c.unused) : <Muted>0</Muted>,
                c.paid ? <span key="p" style={{ color: 'var(--pos)' }}>{fmtNum(c.paid)}</span> : <Muted>0</Muted>,
                c.expired ? fmtNum(c.expired) : <Muted>0</Muted>,
                c.running ? <Pill key="r" tone="accent">{fmtNum(c.running)} unfinished</Pill> : <Muted>0</Muted>,
                c.paid + c.expired ? fmtPct(ratio(c.paid, c.paid + c.expired)) : <Muted>—</Muted>,
              ]),
              [<strong key="t" style={{ color: 'var(--text-1)', fontWeight: 600 }}>All</strong>, fmtNum(tot.started), fmtNum(tot.activated), fmtNum(tot.unused), fmtNum(tot.paid), fmtNum(tot.expired), fmtNum(tot.running), finished ? fmtPct(ratio(tot.paid, finished)) : '—'],
            ]} />
        )}
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <CardHeader title="Trials started in this period" subtitle="Soonest-ending first — the owners to follow up"
          right={<Tabs tabs={[['all', 'All'], ['running', 'Running'], ['unused', 'Unused'], ['expired', 'Expired'], ['paid', 'Paid']]} value={only} onChange={(v) => { setOnly(v); setLimit(15); }} />} />
        {list.length === 0 ? <Empty>No trials match.</Empty> : (
          <>
            <Table minWidth={760}
              head={['Fleet', 'Owner', 'Started', 'Ends', 'Status', 'Vehicles', 'Drivers']}
              align={['left', 'left', 'left', 'left', 'left', 'right', 'right']}
              rows={list.slice(0, limit).map((r) => {
                const left = daysLeft(r.endsAt);
                return [
                  <Link key="n" href={`/admin/operators/${r.id}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link>,
                  r.ownerEmail ? <a key="e" href={`mailto:${r.ownerEmail}`} className="an-link" style={{ color: 'var(--text-2)', textDecoration: 'none' }}>{r.ownerEmail}</a> : <Muted>—</Muted>,
                  <span key="s" style={{ whiteSpace: 'nowrap' }}>{whenShort(r.startedAt)}</span>,
                  <span key="x" style={{ whiteSpace: 'nowrap' }}>{r.endsAt ? <>{whenShort(r.endsAt)}{r.status === 'running' && left != null ? <span style={{ color: left <= 7 ? 'var(--warn)' : 'var(--text-4)' }}> · {left <= 0 ? 'today' : `${left}d left`}</span> : null}</> : '—'}</span>,
                  <span key="st" style={{ display: 'inline-flex', gap: 6 }}><Pill tone={TRIAL_STATUS[r.status].tone}>{TRIAL_STATUS[r.status].label}</Pill>{r.vehicles === 0 && r.drivers === 0 && r.status !== 'paid' ? <Pill tone="muted">unused</Pill> : null}</span>,
                  fmtNum(r.vehicles),
                  fmtNum(r.drivers),
                ];
              })} />
            <ShowMore total={list.length} shown={limit} onMore={() => setLimit((l) => l + 25)} />
          </>
        )}
      </Card>
    </>
  );
}

// ── Revenue & retention ──────────────────────────────────────────────────────
const CANCEL_REASON: Record<string, string> = {
  too_expensive: 'Too expensive',
  missing_features: 'Missing features',
  switched_service: 'Switched to another tool',
  unused: 'Not using it enough',
  customer_service: 'Unhappy with support',
  too_complex: 'Too complicated',
  low_quality: 'Quality issues',
  other: 'Other',
  cancellation_requested: 'Cancelled — no reason given',
  payment_failed: 'Payment failed',
  payment_disputed: 'Payment disputed',
  none: 'No reason given',
};
const DECLINE: Record<string, string> = {
  insufficient_funds: 'Insufficient funds',
  card_declined: 'Card declined',
  generic_decline: 'Declined by the bank',
  expired_card: 'Card expired',
  incorrect_cvc: 'Wrong security code',
  authentication_required: 'Needed 3-D Secure',
  do_not_honor: 'Declined by the bank',
  lost_card: 'Card reported lost',
  stolen_card: 'Card reported stolen',
  processing_error: 'Processing error',
  unknown: 'Reason not given',
};
export const cancelReason = (r: string | null) => CANCEL_REASON[r ?? 'none'] ?? r ?? 'No reason given';
export const declineReason = (r: string | null) => DECLINE[r ?? 'unknown'] ?? (r ?? 'Reason not given').replace(/_/g, ' ');

export function RevenueSection({ business, compare, importing, importMsg, onImport }: {
  business: BusinessData | null;
  compare: string;
  importing: boolean;
  importMsg: string | null;
  onImport: () => void;
}) {
  const [listTab, setListTab] = useState<'new' | 'changes'>('new');
  const [leaveTab, setLeaveTab] = useState<'cancellations' | 'failed'>('cancellations');
  if (!business) return <Card><Empty>Loading revenue…</Empty></Card>;
  const c = business.current;
  const p = business.previous;
  const r = business.revenue;
  const ret = business.retention;
  const plan = (k: string | null) => (k ? business.planNames[k] ?? k : '—');
  const maxMrr = Math.max(1, ...r.plans.map((x) => x.mrr));
  const needsHistory = !business.billingReady;

  return (
    <>
      {needsHistory && <MigrationNotice what="turn on billing history" />}
      {business.billingReady && business.stripeEnabled && (
        <Notice tone="info" title={business.billingSince ? `Billing history recorded since ${whenShort(business.billingSince)}` : 'No billing history yet'}>
          Renewals, plan changes, cancellations (with the reason given) and failed payments are recorded by the Stripe webhook as they happen.
          {' '}To fill in the past, import it from Stripe — safe to run any time, nothing is counted twice.
          {' '}In Stripe → Developers → Webhooks, the Rovora endpoint must listen to <span className="mono">invoice.paid</span>, <span className="mono">invoice.payment_failed</span> and <span className="mono">checkout.session.expired</span> as well as the subscription events.
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={onImport} disabled={importing} style={{ ...chip, ...chipActive, opacity: importing ? 0.6 : 1 }}>{importing ? 'Importing from Stripe…' : 'Import history from Stripe'}</button>
            {importMsg && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{importMsg}</span>}
          </div>
        </Notice>
      )}

      <div className="an-kpis" style={kpiGrid(4)}>
        <Kpi label="MRR" value={fmtMoney(r.mrr)} delta={<span />} sub={`${fmtMoney(r.arr)} a year`} hint="Monthly recurring revenue right now: each paying fleet’s plan price (same as the Overview tab)." />
        <Kpi label="Active paid fleets" value={fmtNum(r.activePaid)} delta={<span />} sub={r.pastDue ? `${r.pastDue} behind on payment` : `ARPA ${fmtMoney(r.arpa)}`} hint="Fleets on a paid plan today. ARPA = average revenue per account." />
        <Kpi label="New subscriptions" value={fmtNum(c.paid)} delta={<Delta cur={c.paid} prev={p.paid} />} sub={`+${fmtMoney(c.newMrr)} MRR`} hint={`Fleets that started paying in this period, vs ${compare}.`} />
        <Kpi label="Upgrades / downgrades" value={`${fmtNum(c.upgrades)} / ${fmtNum(c.downgrades)}`} delta={<span />} sub={`${fmtMoney(c.expansionMrr - c.contractionMrr)} net MRR`} hint="Plan changes in this period — a pricier plan is an upgrade, a cheaper one a downgrade." />
      </div>

      <div className="split-main-side" style={grid('minmax(0, 1fr) minmax(0, 1fr)')}>
        <Card>
          <CardHeader title="Plans" subtitle={`${fmtMoney(r.mrr)} MRR across ${fmtNum(r.activePaid)} paying fleets`} />
          {r.plans.length === 0 ? <Empty>No plans set up.</Empty> : (
            <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {r.plans.map((x) => (
                <div key={x.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-1)' }}>{x.name} <span style={{ color: 'var(--text-3)' }}>· {fmtNum(x.accounts)} fleet{x.accounts === 1 ? '' : 's'}{x.newInPeriod ? ` · ${x.newInPeriod} new` : ''}</span></span>
                    <span className="mono tnum" style={{ color: 'var(--text-1)' }}>{fmtMoney(x.mrr)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(x.mrr / maxMrr) * 100}%`, height: '100%', background: x.color && x.color.startsWith('#') ? x.color : 'var(--accent)', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={listTab === 'new' ? 'New subscriptions' : 'Upgrades & downgrades'}
            right={<Tabs tabs={[['new', `New ${c.paid}`], ['changes', `Plan changes ${c.upgrades + c.downgrades}`]]} value={listTab} onChange={setListTab} />} />
          {listTab === 'new' ? (
            r.newSubs.length === 0 ? <Empty>No new subscriptions in this period.</Empty> : (
              <Table head={['When', 'Fleet', 'Plan', 'MRR']} align={['left', 'left', 'left', 'right']}
                rows={r.newSubs.slice(0, 12).map((s) => [
                  <span key="w" style={{ whiteSpace: 'nowrap' }}>{whenShort(s.at)}</span>,
                  s.orgId ? <Link key="o" href={`/admin/operators/${s.orgId}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>{s.org}</Link> : s.org,
                  plan(s.plan),
                  s.amount != null ? fmtMoney(s.amount) : '—',
                ])} />
            )
          ) : r.changes.length === 0 ? (
            <Empty>{needsHistory ? 'Plan changes are recorded once billing history is on.' : 'No upgrades or downgrades in this period.'}</Empty>
          ) : (
            <Table head={['When', 'Fleet', 'Change', 'MRR']} align={['left', 'left', 'left', 'right']}
              rows={r.changes.slice(0, 12).map((x) => [
                <span key="w" style={{ whiteSpace: 'nowrap' }}>{whenShort(x.at)}</span>,
                x.orgId ? <Link key="o" href={`/admin/operators/${x.orgId}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>{x.org}</Link> : x.org,
                <span key="c"><Pill tone={x.kind === 'upgraded' ? 'pos' : 'warn'}>{x.kind === 'upgraded' ? 'Upgrade' : 'Downgrade'}</Pill> {plan(x.planFrom)} → {plan(x.planTo)}</span>,
                x.amount != null ? `${x.amount > 0 ? '+' : ''}${fmtMoney(x.amount)}` : '—',
              ])} />
          )}
        </Card>
      </div>

      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', margin: '22px 0 10px' }}>Retention & cancellations</div>
      <div className="an-kpis" style={kpiGrid(4)}>
        <Kpi label="Renewals" value={fmtNum(c.renewals)} delta={<Delta cur={c.renewals} prev={p.renewals} />} sub={`${fmtMoney(c.renewalRevenue)} collected`} hint="Monthly renewals paid in this period." />
        <Kpi label="Churn rate" value={c.churnRate == null ? '—' : fmtPct(c.churnRate)} delta={c.churnRate == null || p.churnRate == null ? <span /> : <Delta cur={c.churnRate} prev={p.churnRate} upIsGood={false} asPoints />}
          sub={`${fmtNum(c.cancellations)} of ${fmtNum(c.payingAtStart)} paying`} hint="Paying fleets that cancelled in this period ÷ paying fleets at its start." />
        <Kpi label="Cancellations" value={fmtNum(c.cancellations)} delta={<Delta cur={c.cancellations} prev={p.cancellations} upIsGood={false} />} sub={c.lostMrr ? `−${fmtMoney(c.lostMrr)} MRR` : c.cancelRequests ? `${c.cancelRequests} scheduled` : 'subscriptions ended'}
          hint="Subscriptions that ended in this period. “Scheduled” = asked to cancel at the end of the paid month." />
        <Kpi label="Failed payments" value={fmtNum(c.failedPayments)} delta={<Delta cur={c.failedPayments} prev={p.failedPayments} upIsGood={false} />} sub={c.failedPayments ? `${fmtNum(c.recovered)} recovered · ${fmtMoney(c.failedAmount)}` : 'none'}
          hint="Invoices whose card charge was declined at least once in this period, and how many were paid in the end." />
      </div>

      <div className="split-main-side" style={grid('minmax(0, 1fr) 360px')}>
        <Card>
          <CardHeader title={leaveTab === 'cancellations' ? 'Cancellations' : 'Failed payments'}
            right={<Tabs tabs={[['cancellations', `Cancellations ${ret.cancellations.length}`], ['failed', `Failed payments ${ret.failed.length}`]]} value={leaveTab} onChange={setLeaveTab} />} />
          {leaveTab === 'cancellations' ? (
            ret.cancellations.length === 0 ? <Empty>{needsHistory ? 'Cancellations are recorded once billing history is on.' : 'Nobody cancelled in this period.'}</Empty> : (
              <Table minWidth={620} head={['When', 'Fleet', 'What', 'Reason', 'Their words']} align={['left', 'left', 'left', 'left', 'left']}
                rows={ret.cancellations.slice(0, 20).map((x) => [
                  <span key="w" style={{ whiteSpace: 'nowrap' }}>{whenShort(x.at)}</span>,
                  x.orgId ? <Link key="o" href={`/admin/operators/${x.orgId}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>{x.org}</Link> : x.org,
                  <Pill key="k" tone={x.kind === 'cancelled' ? 'neg' : 'warn'}>{x.kind === 'cancelled' ? 'Ended' : 'Will end'}</Pill>,
                  cancelReason(x.reason),
                  x.comment ? <span key="c" style={{ color: 'var(--text-1)' }}>“{x.comment}”</span> : <Muted>—</Muted>,
                ])} />
            )
          ) : ret.failed.length === 0 ? <Empty>{needsHistory ? 'Failed payments are recorded once billing history is on.' : 'No failed payments in this period.'}</Empty> : (
            <Table minWidth={620} head={['When', 'Fleet', 'Amount', 'Why', 'Tries', 'Outcome']} align={['left', 'left', 'right', 'left', 'right', 'left']}
              rows={ret.failed.slice(0, 20).map((x) => [
                <span key="w" style={{ whiteSpace: 'nowrap' }}>{whenShort(x.at)}</span>,
                x.orgId ? <Link key="o" href={`/admin/operators/${x.orgId}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>{x.org}</Link> : x.org,
                x.amount != null ? fmtMoney(x.amount, 2) : '—',
                declineReason(x.reason),
                x.attempts ?? '—',
                x.recovered ? <Pill key="r" tone="pos">Paid in the end</Pill> : <Pill key="r" tone="neg">Unpaid</Pill>,
              ])} />
          )}
          {ret.unknownCancelled > 0 && (
            <div style={{ padding: '10px 18px 12px', fontSize: 11, color: 'var(--text-4)', borderTop: '1px solid var(--line-1)' }}>
              {ret.unknownCancelled} cancelled fleet{ret.unknownCancelled === 1 ? '' : 's'} left before billing history began, so {ret.unknownCancelled === 1 ? 'its' : 'their'} cancellation date isn’t known{business.stripeEnabled ? ' — import from Stripe to fill it in' : ''}.
            </div>
          )}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card>
            <CardHeader title="Why they leave" subtitle="Reasons given when cancelling" />
            <BarList rows={ret.reasons.map((x) => ({ name: x.reason, visitors: x.count, visits: x.count }))} label="Reason" keyOf={(x) => x.name} value={(x) => x.visitors}
              name={(x) => cancelReason(x.name)} columns={[{ label: 'Fleets', width: 50, render: (x) => fmtNum(x.visitors) }]}
              empty="No cancellations in this period. Turn on the cancellation reason survey in Stripe → Settings → Billing → Customer portal to collect them." />
          </Card>
          <Card>
            <CardHeader title="Behind on payment now" subtitle="Paying fleets whose last charge failed" />
            {ret.pastDueNow.length === 0 ? <Empty>Everyone is up to date.</Empty> : (
              <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ret.pastDueNow.map((x) => (
                  <div key={x.orgId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                    <Link href={`/admin/operators/${x.orgId}`} className="an-link" style={{ color: 'var(--text-1)', textDecoration: 'none' }}>{x.org}</Link>
                    <Pill tone="neg">{(x.status ?? 'past due').replace(/_/g, ' ')}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ── Friction ──────────────────────────────────────────────────────────────────
const ms = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
/** Google's Core Web Vitals bands for the 75th percentile. */
const band = (metric: 'lcp' | 'ttfb' | 'inp' | 'cls', v: number | null | undefined): 'pos' | 'warn' | 'neg' | 'muted' => {
  if (v == null) return 'muted';
  const [good, poor] = { lcp: [2500, 4000], ttfb: [800, 1800], inp: [200, 500], cls: [100, 250] }[metric];
  return v <= good ? 'pos' : v <= poor ? 'warn' : 'neg';
};
const Vital = ({ metric, v }: { metric: 'lcp' | 'ttfb' | 'inp' | 'cls'; v: number | null | undefined }) => {
  const tone = band(metric, v);
  const color = { pos: 'var(--pos)', warn: 'var(--warn)', neg: 'var(--neg)', muted: 'var(--text-4)' }[tone];
  return <span style={{ color }}>{metric === 'cls' ? (v == null ? '—' : (v / 1000).toFixed(2)) : ms(v)}</span>;
};

export function FrictionSection({ extras, business, extrasMissing }: { extras: ExtrasData | null; business: BusinessData | null; extrasMissing: boolean }) {
  const [device, setDevice] = useState<string>('all');
  const [limit, setLimit] = useState(12);
  const speedPages = useMemo(() => {
    const rows = (extras?.speed.pages ?? []).filter((r) => device === 'all' || r.device === device);
    if (device !== 'all') return rows;
    // All devices: keep the busiest device's row per page, but sum samples / slow.
    const m = new Map<string, SpeedRow & { devices: number }>();
    for (const r of rows) {
      const cur = m.get(r.path ?? '');
      if (!cur) m.set(r.path ?? '', { ...r, devices: 1 });
      else m.set(r.path ?? '', { ...(r.samples > cur.samples ? r : cur), samples: cur.samples + r.samples, slow: cur.slow + r.slow, devices: cur.devices + 1 });
    }
    return [...m.values()];
  }, [extras, device]);
  const devices = extras?.speed.devices ?? [];
  const signupErrors = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of extras?.interactions ?? []) {
      if (r.name !== 'Signup error') continue;
      const k = r.label ?? 'Other';
      const row = m.get(k) ?? {};
      row[r.device] = (row[r.device] ?? 0) + r.count;
      m.set(k, row);
    }
    return [...m.entries()].map(([kind, by]) => ({ kind, by, total: Object.values(by).reduce((s, n) => s + n, 0) })).sort((a, b) => b.total - a.total);
  }, [extras]);
  const errDevices = [...new Set(signupErrors.flatMap((e) => Object.keys(e.by)))].sort();
  const notFound = extras?.not_found ?? [];

  return (
    <>
      {extrasMissing && <MigrationNotice what="start measuring page speed and broken links" />}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader title="Slow pages" subtitle="Real loading speed of the page each visit landed on · 75th percentile, Google’s Core Web Vitals"
          right={<Tabs tabs={[['all', 'All devices'], ...devices.map((d) => [d.device, d.device] as [string, string])]} value={device} onChange={(v) => { setDevice(v); setLimit(12); }} />} />
        {devices.length > 0 && (
          <div className="an-kpis" style={{ ...kpiGrid(Math.min(devices.length, 4)), padding: '0 18px', marginBottom: 12 }}>
            {devices.slice(0, 4).map((d) => (
              <div key={d.device} style={{ padding: '10px 12px', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.device} · {fmtNum(d.samples)} loads</div>
                <div style={{ fontSize: 13, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Load <Vital metric="lcp" v={d.lcp} /></span><span>Server <Vital metric="ttfb" v={d.ttfb} /></span><span>Response <Vital metric="inp" v={d.inp} /></span>
                </div>
                <div style={{ fontSize: 11, color: d.slow ? 'var(--warn)' : 'var(--text-4)', marginTop: 4 }}>{fmtPct(ratio(d.slow, d.samples))} slow loads</div>
              </div>
            ))}
          </div>
        )}
        {speedPages.length === 0 ? (
          <Empty>{extras?.notes_since ? 'No page loads measured in this period.' : 'Page speed is measured from the first visit after the 20261123 analytics migration is applied.'}</Empty>
        ) : (
          <>
            <Table minWidth={720}
              head={['Landing page', 'Loads', 'Main content shown', 'Server answer', 'Tap response', 'Layout jumps', 'Slow loads']}
              rows={[...speedPages].sort((a, b) => (b.lcp ?? 0) - (a.lcp ?? 0)).slice(0, limit).map((r) => [
                <span key="p" className="mono" style={{ fontSize: 12, color: 'var(--text-1)' }}>{r.path}{device === 'all' ? '' : ''}</span>,
                fmtNum(r.samples),
                <Vital key="l" metric="lcp" v={r.lcp} />,
                <Vital key="t" metric="ttfb" v={r.ttfb} />,
                <Vital key="i" metric="inp" v={r.inp} />,
                <Vital key="c" metric="cls" v={r.cls} />,
                r.slow ? <span key="s" style={{ color: 'var(--warn)' }}>{fmtPct(ratio(r.slow, r.samples))}</span> : <Muted>0%</Muted>,
              ])} />
            <ShowMore total={speedPages.length} shown={limit} onMore={() => setLimit((l) => l + 25)} />
          </>
        )}
        <div style={{ padding: '10px 18px 12px', fontSize: 11, color: 'var(--text-4)', borderTop: '1px solid var(--line-1)', lineHeight: 1.5 }}>
          Green = good, amber = needs work, red = poor (Google’s thresholds: main content under 2.5 s, server under 0.8 s, tap response under 200 ms). A slow load = main content over 4 s or server over 1.8 s.
        </div>
      </Card>

      <div className="split-main-side" style={grid('minmax(0, 1fr) minmax(0, 1fr)')}>
        <Card>
          <CardHeader title="Broken links" subtitle="Visits to pages that don’t exist, and what sent people there" />
          {notFound.length === 0 ? (
            <Empty>{extras?.notes_since ? 'No missing pages visited in this period.' : 'Missing pages are recorded once the 20261123 analytics migration is applied.'}</Empty>
          ) : (
            <Table head={['Missing page', 'Linked from', 'Device', 'Visits']} align={['left', 'left', 'left', 'right']}
              rows={notFound.slice(0, 30).map((r) => [
                <span key="p" className="mono" style={{ fontSize: 12, color: 'var(--text-1)', wordBreak: 'break-all' }}>{r.path}</span>,
                <span key="f" className="mono" style={{ fontSize: 12 }}>{r.from === '(direct)' ? <Muted>typed / bookmark</Muted> : r.from}</span>,
                r.device,
                fmtNum(r.count),
              ])} />
          )}
        </Card>
        <Card>
          <CardHeader title="Failed registrations, by device" subtitle="Errors people were shown on the sign-up screens" />
          {signupErrors.length === 0 ? <Empty>No sign-up errors in this period.</Empty> : (
            <Table head={['Error', ...errDevices, 'Total']}
              rows={signupErrors.map((e) => [<span key="k" style={{ color: 'var(--text-1)', fontSize: 12.5 }}>{e.kind}</span>, ...errDevices.map((d) => (e.by[d] ? fmtNum(e.by[d]) : <Muted key={d}>0</Muted>)), fmtNum(e.total)])} />
          )}
        </Card>
      </div>

      <div className="split-main-side" style={grid('minmax(0, 1fr) minmax(0, 1fr)')}>
        <Card>
          <CardHeader title="Payment problems, by device" subtitle="Checkouts that couldn’t start, and payment pages left unpaid" />
          {!business ? <Empty>Loading…</Empty> : !business.billingReady ? <Empty>Recorded once the 20261123 analytics migration is applied.</Empty> : business.friction.checkout.length === 0 ? (
            <Empty>No checkout problems in this period.</Empty>
          ) : (
            <Table head={['Device', 'Checkout errors', 'Left payment page']}
              rows={business.friction.checkout.map((r) => [<span key="d" style={{ color: 'var(--text-1)' }}>{r.device}</span>, r.failed ? <span key="f" style={{ color: 'var(--neg)' }}>{fmtNum(r.failed)}</span> : <Muted>0</Muted>, fmtNum(r.abandoned)])} />
          )}
        </Card>
        <Card>
          <CardHeader title="Declined renewals" subtitle="Why card charges failed (the bank doesn’t say which device)" />
          {!business ? <Empty>Loading…</Empty> : (
            <BarList rows={business.friction.failedByReason.map((x) => ({ name: x.reason, visitors: x.count, visits: x.count }))} label="Reason" keyOf={(x) => x.name} value={(x) => x.visitors}
              name={(x) => declineReason(x.name)} columns={[{ label: 'Invoices', width: 60, render: (x) => fmtNum(x.visitors) }]}
              empty={business.billingReady ? 'No declined charges in this period.' : 'Recorded once billing history is on.'} />
          )}
        </Card>
      </div>
    </>
  );
}

// ── CSV export ───────────────────────────────────────────────────────────────
type Cell = string | number | boolean | null | undefined;
export interface CsvSection { title: string; head: string[]; rows: Cell[][] }

/** A cell as CSV text. Leading = + - @ are neutralised so a spreadsheet never runs a formula from data. */
function cell(v: Cell): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '') : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sections: CsvSection[]): string {
  const lines: string[] = [];
  for (const s of sections) {
    if (!s.rows.length) continue;
    lines.push(cell(s.title));
    lines.push(s.head.map(cell).join(','));
    for (const r of s.rows) lines.push(r.map(cell).join(','));
    lines.push('');
  }
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens accented names (and €) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Everything on the page, one table after another. */
export function csvSections(opts: {
  periodLabel: string;
  compare: string;
  filters: Record<string, string>;
  data: Dashboard | null;
  extras: ExtrasData | null;
  business: BusinessData | null;
}): CsvSection[] {
  const { data, extras, business } = opts;
  const out: CsvSection[] = [];
  out.push({
    title: 'Rovora analytics export',
    head: ['Field', 'Value'],
    rows: [
      ['Period', opts.periodLabel],
      ['Compared with', opts.compare],
      ['Filters', Object.entries(opts.filters).map(([k, v]) => `${k}=${v}`).join('; ') || 'none'],
      ['Exported', new Date().toLocaleString('en-GB')],
    ],
  });
  if (data) {
    const c = data.kpis.current;
    const p = data.kpis.previous;
    const b = business?.current;
    const bp = business?.previous;
    out.push({
      title: 'Overview',
      head: ['Measure', 'This period', 'Previous period'],
      rows: [
        ['Website visitors', c.visitors, p.visitors],
        ['Visits', c.visits, p.visits],
        ['Pageviews', c.pageviews, p.pageviews],
        ['Bounce rate %', ratio(c.bounces, c.visits) * 100, ratio(p.bounces, p.visits) * 100],
        ['Avg. visit time (s)', ratio(c.engaged_ms, c.visits) / 1000, ratio(p.engaged_ms, p.visits) / 1000],
        ['Enquiries', c.leads, p.leads],
        ['Registrations (verified accounts)', b?.registrations, bp?.registrations],
        ['Trials started (fleets created)', b?.trials ?? c.signups, bp?.trials ?? p.signups],
        ['New paid fleets', b?.paid, bp?.paid],
        ['New MRR (EUR)', b?.newMrr, bp?.newMrr],
      ],
    });
    if (business) {
      const f = business.funnel;
      const steps: [string, number][] = [['Visited the website', c.visitors], ['Registered', f.registrations], ['Started a trial', f.trials], ['Activated', f.activated], ['Paid subscription', f.paid]];
      out.push({ title: 'Conversion funnel', head: ['Step', 'Count', '% of visitors', '% of previous step'], rows: steps.map(([n, v], i) => [n, v, ratio(v, c.visitors) * 100, i ? ratio(v, steps[i - 1][1]) * 100 : 100]) });
    }
    out.push({ title: 'Trend', head: ['Period start', 'Visitors', 'Visits', 'Pageviews', 'Sign-ups', 'Enquiries'], rows: data.series.map((s) => [s.t, s.visitors, s.visits, s.pageviews, s.signups, s.leads]) });
    out.push({ title: 'Traffic by platform', head: ['Platform', 'Visitors', 'Sign-ups', 'Enquiries', 'Paying customers'], rows: platformRows(data, business).map((r) => [r.platform, r.visitors, r.signups, r.leads, r.paying]) });
    const rowsOf = (rows: Row[], extra = false) => rows.map((r) => [r.name, ...(extra ? [r.extra ?? ''] : []), r.visitors, r.visits, r.bounces ?? '', r.signups ?? 0, r.leads ?? 0]);
    out.push({ title: 'Channels', head: ['Channel', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.channels) });
    out.push({ title: 'Sources', head: ['Source', 'Channel', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.sources, true) });
    out.push({ title: 'Campaigns', head: ['Campaign', 'Source / medium', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.campaigns, true) });
    out.push({ title: 'Referring pages', head: ['Referrer', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.referrers) });
    if (business?.attribution.length) out.push({ title: 'New paying fleets by sign-up source', head: ['Channel', 'Source', 'Campaign', 'Paying'], rows: business.attribution.map((a) => [a.channel, a.source, a.campaign ?? '', a.paying]) });
    out.push({ title: 'Countries', head: ['Country', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.countries) });
    out.push({ title: 'Devices', head: ['Device', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.devices) });
    out.push({ title: 'Browsers', head: ['Browser', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.browsers) });
    out.push({ title: 'Operating systems', head: ['OS', 'Visitors', 'Visits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.os) });
    out.push({ title: 'New vs returning (visitors who allowed cookies)', head: ['Type', 'Visitors'], rows: [['New', Math.max(0, data.loyalty.consented_visitors - data.loyalty.returning)], ['Returning', data.loyalty.returning]] });
    out.push({ title: 'Top pages', head: ['Page', 'Visitors', 'Pageviews', 'Avg. time on screen (s)', 'Avg. scroll %'], rows: data.pages.map((p) => [p.name, p.visitors, p.pageviews, p.avg_engaged_ms / 1000, p.avg_scroll]) });
    out.push({ title: 'Landing pages', head: ['Page', 'Visitors', 'Entries', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.entry_pages) });
    out.push({ title: 'Exit pages', head: ['Page', 'Visitors', 'Exits', 'Bounces', 'Sign-ups', 'Enquiries'], rows: rowsOf(data.exit_pages) });
    out.push({ title: 'Interactions', head: ['Action', 'Where / what', 'Count', 'Visitors'], rows: data.events.map((e) => [e.name, e.label ?? '', e.count, e.visitors]) });
    const leads: Conversion[] = data.conversions;
    out.push({
      title: 'Sign-ups and enquiries',
      head: ['When', 'Type', 'Form', 'Topic', 'Demo request', 'Fleet', 'Channel', 'Source', 'Campaign', 'Landing page', 'Country', 'Device'],
      rows: leads.map((x) => [x.at, x.type, x.props.form ?? '', x.props.topic ?? '', x.props.demo ? 'yes' : '', x.props.org_id ? data.orgs[x.props.org_id]?.name ?? '' : '', x.tracked ? x.channel : 'Not tracked', x.source ?? '', x.campaign ?? '', x.entry ?? '', x.country ?? '', x.device ?? '']),
    });
  }
  if (extras) {
    const s = extras.scroll;
    out.push({ title: 'Scroll depth (page views reaching…)', head: ['Depth', 'Page views', '% of measured'], rows: [['25%', s.r25, ratio(s.r25, s.measured) * 100], ['50%', s.r50, ratio(s.r50, s.measured) * 100], ['75%', s.r75, ratio(s.r75, s.measured) * 100], ['Bottom', s.r100, ratio(s.r100, s.measured) * 100]] });
    out.push({ title: 'Engagement by device', head: ['Device', 'Visits', 'Engaged visits', 'Bounces', 'Avg. time (s)'], rows: extras.engagement.by_device.map((d) => [d.device, d.visits, d.engaged, d.bounces, ratio(d.engaged_ms, d.visits) / 1000]) });
    out.push({ title: 'Pages viewed before signing up', head: ['Page', 'Sign-ups that read it'], rows: extras.before_signup.pages.map((p) => [p.path, p.signups]) });
    out.push({ title: 'Sections and screenshots seen', head: ['Kind', 'Item', 'Visits that saw it', 'Visits to that page'], rows: extras.seen.map((x) => [x.name, x.label, x.visits, x.page_visits]) });
    out.push({ title: 'Interactions by device', head: ['Action', 'Where / what', 'Device', 'Count', 'Visitors'], rows: extras.interactions.map((x) => [x.name, x.label ?? '', x.device, x.count, x.visitors]) });
    out.push({ title: 'Page speed (75th percentile)', head: ['Landing page', 'Device', 'Loads', 'Slow loads', 'Main content (ms)', 'First paint (ms)', 'Server (ms)', 'Tap response (ms)', 'Layout shift (x1000)', 'Full load (ms)'], rows: extras.speed.pages.map((r) => [r.path ?? '', r.device, r.samples, r.slow, r.lcp, r.fcp, r.ttfb, r.inp, r.cls, r.load_ms]) });
    out.push({ title: 'Broken links', head: ['Missing page', 'Linked from', 'Device', 'Visits', 'Visitors'], rows: extras.not_found.map((r) => [r.path, r.from, r.device, r.count, r.visitors]) });
  }
  if (business) {
    const t = business.trials;
    out.push({ title: 'Trials now', head: ['Measure', 'Count'], rows: [['Active trials', t.active], ['Ending in 7 days', t.expiringSoon], ['Unused active trials', t.unused], ['Expired unpaid (all time)', t.expired]] });
    out.push({ title: 'Trial-to-paid by start date', head: ['Trial started', 'Trials', 'Activated', 'Unused', 'Paid', 'Expired unpaid', 'Still running (unfinished)'], rows: t.cohorts.map((c) => [c.start, c.started, c.activated, c.unused, c.paid, c.expired, c.running]) });
    out.push({ title: 'Trials started in the period', head: ['Fleet', 'Owner email', 'Started', 'Ends', 'Status', 'Vehicles', 'Drivers'], rows: t.list.map((r) => [r.name, r.ownerEmail ?? '', r.startedAt, r.endsAt ?? '', r.status, r.vehicles, r.drivers]) });
    const r = business.revenue;
    out.push({ title: 'Revenue now', head: ['Measure', 'Value'], rows: [['MRR (EUR)', r.mrr], ['ARR (EUR)', r.arr], ['Active paid fleets', r.activePaid], ['ARPA (EUR)', r.arpa], ['Behind on payment', r.pastDue]] });
    out.push({ title: 'Plans', head: ['Plan', 'Paying fleets', 'MRR (EUR)', 'New in period'], rows: r.plans.map((p) => [p.name, p.accounts, p.mrr, p.newInPeriod]) });
    out.push({ title: 'New subscriptions', head: ['When', 'Fleet', 'Plan', 'MRR (EUR)'], rows: r.newSubs.map((s) => [s.at, s.org, s.plan ? business.planNames[s.plan] ?? s.plan : '', s.amount]) });
    out.push({ title: 'Upgrades and downgrades', head: ['When', 'Fleet', 'Change', 'From', 'To', 'MRR change (EUR)'], rows: r.changes.map((x) => [x.at, x.org, x.kind, x.planFrom ?? '', x.planTo ?? '', x.amount]) });
    const c = business.current;
    const p = business.previous;
    out.push({
      title: 'Retention',
      head: ['Measure', 'This period', 'Previous period'],
      rows: [
        ['Renewals', c.renewals, p.renewals], ['Renewal revenue (EUR)', c.renewalRevenue, p.renewalRevenue],
        ['Cancellations', c.cancellations, p.cancellations], ['Cancellation requests', c.cancelRequests, p.cancelRequests],
        ['Churn rate %', c.churnRate == null ? '' : c.churnRate * 100, p.churnRate == null ? '' : p.churnRate * 100],
        ['Lost MRR (EUR)', c.lostMrr, p.lostMrr], ['Failed payments', c.failedPayments, p.failedPayments], ['Recovered', c.recovered, p.recovered],
        ['Checkout errors', c.checkoutFailed, p.checkoutFailed], ['Payment pages left unpaid', c.checkoutAbandoned, p.checkoutAbandoned],
      ],
    });
    out.push({ title: 'Cancellation reasons', head: ['Reason', 'Fleets'], rows: business.retention.reasons.map((x) => [cancelReason(x.reason), x.count]) });
    out.push({ title: 'Cancellations', head: ['When', 'Fleet', 'Kind', 'Plan', 'Reason', 'Comment'], rows: business.retention.cancellations.map((x) => [x.at, x.org, x.kind === 'cancelled' ? 'Ended' : 'Scheduled', x.plan ?? '', cancelReason(x.reason), x.comment ?? '']) });
    out.push({ title: 'Failed payments', head: ['When', 'Fleet', 'Amount', 'Currency', 'Reason', 'Attempts', 'Recovered'], rows: business.retention.failed.map((x) => [x.at, x.org, x.amount, x.currency ?? '', declineReason(x.reason), x.attempts, x.recovered ? 'yes' : 'no']) });
    out.push({ title: 'Payment problems by device', head: ['Device', 'Checkout errors', 'Left payment page'], rows: business.friction.checkout.map((x) => [x.device, x.failed, x.abandoned]) });
  }
  return out;
}

