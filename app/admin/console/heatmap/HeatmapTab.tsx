'use client';

// =============================================================================
// Admin Console → Analytics → Heatmaps. Deliberately light: a few totals and
// the list of pages people clicked on, each opening the full-screen viewer
// (HeatmapViewer.tsx), which only loads its page's clicks when opened.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, Empty, agoShort, fmtNum, fmtPct, ratio, th, td } from '../analytics-ui';
import HeatmapViewer from './HeatmapViewer';
import type { HeatPagesData } from './types';

interface Props {
  from: Date;
  to: Date;
  filters: Record<string, string>;
  /** Changes on the dashboard's Refresh. */
  tick: number;
  rangeLabel: string;
}

interface Loaded { url: string; data: HeatPagesData | null; error: string | null; setup: boolean }

const SPLIT = [
  { key: 'desktop', label: 'Desktop', color: 'var(--accent)' },
  { key: 'tablet', label: 'Tablet', color: '#8b5cf6' },
  { key: 'phone', label: 'Phone', color: '#f59e0b' },
] as const;

export default function HeatmapTab({ from, to, filters, tick, rangeLabel }: Props) {
  const [open, setOpen] = useState<{ path: string; live: boolean } | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ url: '', data: null, error: null, setup: false });
  const filterJson = JSON.stringify(filters);
  const url = useMemo(
    () => `/api/admin/analytics/heatmap?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), filters: filterJson, n: String(tick) })}`,
    [from, to, filterJson, tick],
  );

  useEffect(() => {
    let stop = false;
    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (stop) return;
        if (!r.ok) setLoaded((cur) => ({ url, data: cur.data, error: body.error ?? `HTTP ${r.status}`, setup: !!body.setup }));
        else setLoaded({ url, data: body as HeatPagesData, error: null, setup: false });
      })
      .catch((e) => { if (!stop) setLoaded((cur) => ({ url, data: cur.data, error: String(e), setup: false })); });
    return () => { stop = true; };
  }, [url]);

  const data = loaded.data;
  const loading = loaded.url !== url;
  const pages = data?.pages ?? [];
  const t = data?.totals;
  const splitTotal = t ? t.phone + t.tablet + t.desktop : 0;

  if (loaded.setup) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <CardHeader title="Heatmaps — one step left" subtitle="See where visitors click and tap on every page" />
        <div style={{ padding: '4px 18px 18px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          Run <code>supabase/migrations/20261124_heatmaps.sql</code> in Supabase → SQL editor. Clicks are recorded on every public page from then on, and show up here within seconds.
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
        <Tile label="Clicks & taps" value={t ? fmtNum(t.clicks) : '—'} sub={t ? `on ${fmtNum(t.pages)} ${t.pages === 1 ? 'page' : 'pages'}` : ' '} />
        <Tile label="Visits that clicked" value={t ? fmtNum(t.visits) : '—'} sub={t && t.visits ? `${(t.clicks / t.visits).toFixed(1)} clicks each` : ' '} />
        <Tile label="Rage clicks" value={t ? fmtNum(t.rage) : '—'} sub="fast repeated clicks" warn={!!t?.rage} />
        <Tile label="Dead clicks" value={t ? fmtNum(t.dead) : '—'} sub="clicks where nothing happened" warn={!!t?.dead} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <CardHeader
          title="Heatmaps"
          subtitle={<>Where people click and tap, page by page · {rangeLabel}{loading ? ' · loading…' : ''}{t?.last_at ? ` · last click ${agoShort(t.last_at)}` : ''}</>}
          right={pages.length ? (
            <button type="button" onClick={() => setOpen({ path: pages[0].path, live: true })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 7, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.08)', color: '#f87171', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />Live view
            </button>
          ) : undefined}
        />
        {splitTotal > 0 && (
          <div style={{ padding: '0 18px 12px' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-3)' }}>
              {SPLIT.map((s) => <span key={s.key} style={{ width: `${ratio(t![s.key], splitTotal) * 100}%`, background: s.color }} />)}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
              {SPLIT.map((s) => (
                <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.label} {fmtPct(ratio(t![s.key], splitTotal))}
                </span>
              ))}
            </div>
          </div>
        )}
        {loaded.error && !data && <div style={{ padding: '0 18px 16px', fontSize: 12.5, color: 'var(--neg)' }}>Couldn’t load heatmaps: {loaded.error}</div>}
        {data && !pages.length ? (
          <Empty>No clicks recorded in this period yet. Every click and tap on the public website is recorded from now on — open the site and click around, then press Refresh.</Empty>
        ) : (
          <div style={{ borderTop: '1px solid var(--line-1)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}>Page</th>
                  <th style={{ ...th, textAlign: 'right' }} title="Page views in this period">Views</th>
                  <th style={{ ...th, textAlign: 'right' }}>Clicks</th>
                  <th style={{ ...th, textAlign: 'right' }} title="Visits that clicked at least once ÷ page views">Clicked</th>
                  <th style={{ ...th, textAlign: 'right' }} title="Rage clicks / dead clicks">Rage · dead</th>
                  <th style={{ ...th, width: 110 }}>Screens</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => {
                  const all = p.phone + p.tablet + p.desktop;
                  return (
                    <tr key={p.path} className="op-row" style={{ borderTop: '1px solid var(--line-1)', cursor: 'pointer' }} onClick={() => setOpen({ path: p.path, live: false })}>
                      <td style={{ ...td, verticalAlign: 'middle' }}><span className="mono" style={{ fontSize: 12.5, color: 'var(--text-1)' }}>{p.path}</span></td>
                      <td style={{ ...td, textAlign: 'right', verticalAlign: 'middle' }} className="mono">{fmtNum(p.views)}</td>
                      <td style={{ ...td, textAlign: 'right', verticalAlign: 'middle', color: 'var(--text-1)' }} className="mono">{fmtNum(p.clicks)}</td>
                      <td style={{ ...td, textAlign: 'right', verticalAlign: 'middle' }} className="mono">{p.views ? fmtPct(Math.min(1, ratio(p.visits, p.views))) : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', verticalAlign: 'middle', color: p.rage || p.dead ? 'var(--warn)' : 'var(--text-4)' }} className="mono">{p.rage} · {p.dead}</td>
                      <td style={{ ...td, verticalAlign: 'middle' }}>
                        <div title={`Desktop ${p.desktop} · Tablet ${p.tablet} · Phone ${p.phone}`} style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--bg-3)', width: 90 }}>
                          {SPLIT.map((s) => <span key={s.key} style={{ width: `${ratio(p[s.key], all) * 100}%`, background: s.color }} />)}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--accent)', fontSize: 12.5 }}>View heatmap →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <HeatmapViewer
          key={open.path}
          path={open.path}
          pages={pages}
          from={from}
          to={to}
          filters={filters}
          rangeLabel={rangeLabel}
          startLive={open.live}
          onPath={(path) => setOpen((cur) => ({ path, live: cur?.live ?? false }))}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div style={{ padding: '13px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius)', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: warn ? 'var(--warn)' : 'var(--text-1)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  );
}
