'use client';

// =============================================================================
// Heatmap viewer — opens full screen from Admin Console → Analytics → Heatmaps.
//
//   Header   page · screen size (Desktop / Tablet / Phone) · Heatmap / Clicks /
//            Scroll · which clicks (all, rage, dead) · Live · zoom
//   Stage    the real page at the width those visitors used, with the map on
//            top (frame.ts). Hover an element for its numbers; click to pin it.
//   Timeline every click in the period as a bar chart; drag the handles to
//            look at a slice of time, or press play to watch clicks build up.
//   Sidebar  Overview (clicks, who clicked, time to first click, time on page,
//            scroll, rage / dead, by hour) · Elements (most pressed) · Visits
//            (replay one visitor's clicks in order) · Live feed.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import { countryName, flag, fmtDur, fmtNum, fmtPct, ratio } from '../analytics-ui';
import { HeatFrame, type HeatMode } from './frame';
import { heatColor } from './render';
import {
  LAYOUTS,
  decodeClicks,
  elementDetail,
  elementName,
  layoutOf,
  renderWidth,
  type Click,
  type HeatPageData,
  type HeatPageRow,
  type Layout,
} from './types';

const Icon = FleetIcon;
const LIVE_WINDOW_MS = 30 * 60_000;
const LIVE_POLL_MS = 10_000;
const BINS = 48;

type Show = 'all' | 'rage' | 'dead';
type Panel = 'overview' | 'elements' | 'visits' | 'live';

interface Props {
  path: string;
  pages: HeatPageRow[];
  from: Date;
  to: Date;
  filters: Record<string, string>;
  rangeLabel: string;
  startLive?: boolean;
  onPath: (path: string) => void;
  onClose: () => void;
}

interface Loaded { url: string; data: HeatPageData | null; error: string | null; setup: boolean }

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const stamp = (t: number, withTime: boolean) =>
  new Date(t).toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });
const deviceIcon = (d: string) => (d === 'Mobile' ? '📱' : d === 'Tablet' ? '📲' : '🖥️');

export default function HeatmapViewer({ path, pages, from, to, filters, rangeLabel, startLive, onPath, onClose }: Props) {
  const row = pages.find((p) => p.path === path);
  const firstLayout: Layout = row ? (['desktop', 'phone', 'tablet'] as Layout[]).reduce((best, l) => (row[l] > row[best] ? l : best), 'desktop' as Layout) : 'desktop';
  const [layout, setLayout] = useState<Layout>(firstLayout);
  const [mode, setMode] = useState<HeatMode>('heat');
  const [show, setShow] = useState<Show>('all');
  const [liveNow, setLiveNow] = useState<number | null>(() => (startLive ? Date.now() : null));
  const live = liveNow != null;
  const [win, setWin] = useState<[number, number]>([0, 1]);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<Panel>(startLive ? 'live' : 'overview');
  const [picked, setPicked] = useState<number | null>(null);
  /** null = clicks on the page; a pop-up id = clicks on that website pop-up, opened in the frame. */
  const [popup, setPopup] = useState<string | null>(null);
  const [replay, setReplay] = useState<{ visit: number; step: number; done: boolean } | null>(null);
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const [stage, setStage] = useState({ w: 900, h: 640 });
  const [layoutInfo, setLayoutInfo] = useState<{ placed: number; missing: number } | null>(null);
  const [frameReady, setFrameReady] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ url: '', data: null, error: null, setup: false });

  const stageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<HeatFrame | null>(null);
  const describeRef = useRef<(el: number) => string[] | null>(() => null);

  // ── Data ────────────────────────────────────────────────────────────────
  const filterJson = JSON.stringify(filters);
  const url = useMemo(() => {
    const qs = new URLSearchParams({
      from: (liveNow != null ? new Date(liveNow - LIVE_WINDOW_MS) : from).toISOString(),
      to: (liveNow != null ? new Date(liveNow + 60_000) : to).toISOString(),
      path,
      layout,
      filters: filterJson,
    });
    return `/api/admin/analytics/heatmap?${qs}`;
  }, [liveNow, from, to, path, layout, filterJson]);

  useEffect(() => {
    let stop = false;
    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (stop) return;
        if (!r.ok) setLoaded((cur) => ({ url, data: cur.data, error: body.error ?? `HTTP ${r.status}`, setup: !!body.setup }));
        else setLoaded({ url, data: body as HeatPageData, error: null, setup: false });
      })
      .catch((e) => { if (!stop) setLoaded((cur) => ({ url, data: cur.data, error: String(e), setup: false })); });
    return () => { stop = true; };
  }, [url]);
  const loading = loaded.url !== url;
  const data = loaded.data;

  // Live: move the 30-minute window forward every few seconds.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLiveNow(Date.now()), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [live]);

  const elements = useMemo(() => data?.elements ?? [], [data]);
  const allClicks = useMemo(() => (data ? decodeClicks(data.clicks) : []), [data]);
  // Clicks on a website pop-up only make sense drawn on that pop-up, so the
  // page and each pop-up are separate layers: everything below (numbers,
  // lists, replay) follows the one being viewed.
  const popupLayers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of allClicks) {
      const p = elements[c.el]?.p;
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const names = new Map((data?.popups ?? []).map((x) => [x.id, x.name]));
    return [...counts.entries()].map(([id, n]) => ({ id, n, name: names.get(id) ?? 'Pop-up' })).sort((a, b) => b.n - a.n);
  }, [allClicks, elements, data]);
  const clicks = useMemo(
    () => allClicks.filter((c) => (elements[c.el]?.p ?? null) === popup),
    [allClicks, elements, popup],
  );
  const popupName = popup ? popupLayers.find((x) => x.id === popup)?.name ?? (data?.popups ?? []).find((x) => x.id === popup)?.name ?? 'Pop-up' : null;
  const visits = useMemo(() => data?.visits ?? [], [data]);
  const genAt = data ? Date.parse(data.generatedAt) : to.getTime();
  const periodStart = live ? genAt - LIVE_WINDOW_MS : from.getTime();
  const periodEnd = live ? genAt : Math.min(to.getTime(), genAt);
  const span = Math.max(1, periodEnd - periodStart);

  // Which clicks: rage / dead only, then the timeline window.
  const shown = useMemo(() => clicks.filter((c) => (show === 'rage' ? c.rage : show === 'dead' ? c.dead : true)), [clicks, show]);
  const tA = periodStart + win[0] * span;
  const tB = win[1] >= 1 ? Infinity : periodStart + win[1] * span;
  const inWindow = useMemo(() => shown.filter((c) => c.t >= tA && c.t <= tB), [shown, tA, tB]);
  const replayClicks = useMemo(
    () => (replay ? clicks.filter((c) => c.visit === replay.visit).sort((a, b) => a.t - b.t) : []),
    [clicks, replay],
  );

  // ── Numbers ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const byEl = new Map<number, { n: number; rage: number; dead: number; visits: Set<number>; ms: number[] }>();
    const firstByVisit = new Map<number, number>();
    const hours = new Array(24).fill(0) as number[];
    let rage = 0;
    let dead = 0;
    for (const c of inWindow) {
      let e = byEl.get(c.el);
      if (!e) byEl.set(c.el, (e = { n: 0, rage: 0, dead: 0, visits: new Set(), ms: [] }));
      e.n += 1;
      e.visits.add(c.visit);
      if (c.rage) { e.rage += 1; rage += 1; }
      if (c.dead) { e.dead += 1; dead += 1; }
      if (c.ms >= 0) {
        e.ms.push(c.ms);
        const f = firstByVisit.get(c.visit);
        if (f == null || c.ms < f) firstByVisit.set(c.visit, c.ms);
      }
      hours[new Date(c.t).getHours()] += 1;
    }
    const ranked = [...byEl.entries()]
      .map(([el, e]) => ({ el, n: e.n, rage: e.rage, dead: e.dead, visitors: e.visits.size, ms: median(e.ms) }))
      .sort((a, b) => b.n - a.n);
    const visitSet = new Set(inWindow.map((c) => c.visit));
    return {
      total: inWindow.length,
      visitors: visitSet.size,
      rage,
      dead,
      firstClick: median([...firstByVisit.values()]),
      hours,
      ranked,
      byEl: new Map(ranked.map((r) => [r.el, r])),
    };
  }, [inWindow]);

  const visitRows = useMemo(() => {
    const m = new Map<number, { visit: number; n: number; first: number; last: number; rage: number }>();
    for (const c of shown) {
      const v = m.get(c.visit);
      if (!v) m.set(c.visit, { visit: c.visit, n: 1, first: c.t, last: c.t, rage: c.rage ? 1 : 0 });
      else { v.n += 1; v.first = Math.min(v.first, c.t); v.last = Math.max(v.last, c.t); v.rage += c.rage ? 1 : 0; }
    }
    return [...m.values()].sort((a, b) => b.first - a.first).slice(0, 200);
  }, [shown]);

  const histogram = useMemo(() => {
    const bins = new Array(BINS).fill(0) as number[];
    for (const c of shown) {
      const i = Math.min(BINS - 1, Math.max(0, Math.floor(((c.t - periodStart) / span) * BINS)));
      bins[i] += 1;
    }
    return bins;
  }, [shown, periodStart, span]);
  const histMax = Math.max(1, ...histogram);

  // Tooltip text for the frame (kept current through a ref).
  useEffect(() => {
    describeRef.current = (el: number) => {
      const s = stats.byEl.get(el);
      if (!s) return null;
      const where = elementDetail(elements[el]);
      const lines = [elementName(elements[el]) + (where ? ` (${where})` : ''), `${fmtNum(s.n)} clicks · ${fmtPct(ratio(s.n, stats.total))} of all clicks here`];
      lines.push(`${fmtNum(s.visitors)} ${s.visitors === 1 ? 'visitor' : 'visitors'}${s.ms ? ` · usually ${fmtDur(s.ms)} after the page opened` : ''}`);
      if (s.rage || s.dead) lines.push([s.rage ? `${s.rage} rage` : '', s.dead ? `${s.dead} dead` : ''].filter(Boolean).join(' · ') + (s.rage + s.dead === 1 ? ' click' : ' clicks'));
      return lines;
    };
  }, [stats, elements]);

  // ── Frame ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const frame = new HeatFrame(iframe, {
      describe: (el) => describeRef.current(el),
      onPick: (el) => setPicked(el),
      onLayout: (info) => setLayoutInfo({ placed: info.placed, missing: info.missing }),
    });
    frameRef.current = frame;
    // The page may have finished loading before this ran (fast, cached).
    if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.body?.childElementCount) {
      frame.attach();
      queueMicrotask(() => setFrameReady((n) => n + 1));
    }
    return () => { frame.detach(); frameRef.current = null; };
  }, []);

  const replayOn = replay != null;
  useEffect(() => {
    frameRef.current?.setData(elements, replayOn ? [] : inWindow);
  }, [elements, inWindow, replayOn, frameReady]);
  useEffect(() => {
    frameRef.current?.setMode(mode, data?.page.reach ?? null);
  }, [mode, data, frameReady]);
  useEffect(() => {
    frameRef.current?.setHotSince(live ? genAt - 60_000 : 0);
  }, [live, genAt, frameReady]);
  useEffect(() => {
    frameRef.current?.select(picked);
  }, [picked, frameReady]);

  // Open the chosen pop-up inside the page (or close it) — see the hooks in
  // components/marketing/popups/SitePopups.tsx. The page may still be
  // hydrating right after load, so wait for its hook to appear.
  useEffect(() => {
    const win = iframeRef.current?.contentWindow as (Window & { __rvPopup?: Window['__rvPopup'] }) | null | undefined;
    if (!win) return;
    let cancelled = false;
    let tries = 0;
    const apply = () => {
      if (cancelled) return;
      let api: Window['__rvPopup'];
      try {
        api = win.__rvPopup;
      } catch {
        return;
      }
      if (!api) {
        if (tries++ < 50) setTimeout(apply, 150);
        return;
      }
      if (popup) {
        if (api.current() !== popup) void api.show(popup);
      } else if (api.current()) {
        api.hide();
      }
    };
    apply();
    return () => { cancelled = true; };
  }, [popup, frameReady]);

  // Replay: run when a visit is chosen (or "Again"); stop when it changes or
  // closes. The clicks come through a ref so a live refresh doesn't restart it.
  const replayClicksRef = useRef<Click[]>([]);
  useEffect(() => { replayClicksRef.current = replayClicks; }, [replayClicks]);
  const replayVisit = replay?.visit ?? null;
  const replayRun = replay ? replay.step === 0 && !replay.done : false;
  useEffect(() => {
    const frame = frameRef.current;
    if (replayVisit == null || !frame || !replayRun) return;
    frame.replay(
      replayClicksRef.current,
      (i) => setReplay((r) => (r && r.visit === replayVisit ? { ...r, step: i } : r)),
      () => setReplay((r) => (r && r.visit === replayVisit ? { ...r, done: true } : r)),
    );
  }, [replayVisit, replayRun, frameReady]);
  useEffect(() => {
    if (replayVisit == null) frameRef.current?.stopReplay();
  }, [replayVisit]);

  // Stage size → scale.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setStage({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const deviceW = useMemo(() => renderWidth(layout, clicks), [layout, clicks]);
  const scale = zoom === 'fit' ? Math.min(1, Math.max(0.15, (stage.w - 24) / deviceW)) : 1;
  const frameH = Math.round(Math.min(1800, Math.max(560, (stage.h - 16) / scale)));
  useEffect(() => { frameRef.current?.setUiScale(scale); }, [scale, frameReady]);

  // Play the timeline: grow the window's end from its start to "now".
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setWin(([a, b]) => {
        const next = b + 1 / 70;
        if (next >= 1) { setPlaying(false); return [a, 1]; }
        return [a, next];
      });
    }, 110);
    return () => clearInterval(t);
  }, [playing]);

  // Esc closes; the console behind stops scrolling while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const startPlay = () => {
    setReplay(null);
    setWin(([a]) => [a, Math.min(1, a + 0.02)]);
    setPlaying(true);
  };
  const toggleLive = () => {
    setPlaying(false);
    setWin([0, 1]);
    if (live) { setLiveNow(null); if (panel === 'live') setPanel('overview'); }
    else { setLiveNow(Date.now()); setPanel('live'); }
  };
  const choose = (el: number) => setPicked((cur) => (cur === el ? null : el));

  const page = data?.page;
  const layouts = data?.layouts;
  const capped = data && data.total > data.clicks.length;
  const windowed = win[0] > 0 || win[1] < 1;
  const withTime = span <= 3 * 86_400_000;

  return (
    <div className="hm-shell" role="dialog" aria-label={`Heatmap of ${path}`}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div className="hm-head">
        <button type="button" className="hm-btn" onClick={onClose} aria-label="Close heatmap"><Icon name="close" size={14} /><span className="hm-hide-sm">Close</span></button>
        <label className="hm-select hm-grow" title="Page">
          <select value={path} onChange={(e) => { setPicked(null); setReplay(null); onPath(e.target.value); }} aria-label="Page">
            {!pages.some((p) => p.path === path) && <option value={path}>{path}</option>}
            {pages.map((p) => <option key={p.path} value={p.path}>{p.path} · {fmtNum(p.clicks)} clicks</option>)}
          </select>
          <span className="mono">{path}</span>
          <Icon name="chevron-down" size={12} />
        </label>
        <div className="hm-seg" role="group" aria-label="Screen size">
          {LAYOUTS.map((l) => (
            <button key={l.id} type="button" aria-pressed={layout === l.id} className={layout === l.id ? 'on' : ''} onClick={() => { setLayout(l.id); setPicked(null); setReplay(null); }}>
              {l.short}{layouts ? <em>{fmtNum(layouts[l.id] ?? 0)}</em> : null}
            </button>
          ))}
        </div>
        <div className="hm-seg" role="group" aria-label="View">
          {([['heat', 'Heatmap'], ['dots', 'Clicks'], ['scroll', 'Scroll']] as [HeatMode, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <label className="hm-select" title="Which clicks">
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Which clicks">
            <option value="all">All clicks</option>
            <option value="rage">Rage clicks only</option>
            <option value="dead">Dead clicks only</option>
          </select>
          <span>{show === 'all' ? 'All clicks' : show === 'rage' ? 'Rage only' : 'Dead only'}</span>
          <Icon name="chevron-down" size={12} />
        </label>
        {(popupLayers.length > 0 || popup) && (
          <label className="hm-select" title="Clicks on the page, or on a website pop-up">
            <select value={popup ?? ''} onChange={(e) => { setPicked(null); setReplay(null); setPopup(e.target.value || null); }} aria-label="Page or pop-up">
              <option value="">Page</option>
              {popupLayers.map((x) => <option key={x.id} value={x.id}>Pop-up: {x.name} · {fmtNum(x.n)} clicks</option>)}
            </select>
            <span>{popup ? `Pop-up: ${popupName}` : `Page · ${popupLayers.length} pop-up${popupLayers.length === 1 ? '' : 's'}`}</span>
            <Icon name="chevron-down" size={12} />
          </label>
        )}
        <button type="button" className={`hm-btn ${live ? 'hm-live' : ''}`} onClick={toggleLive} aria-pressed={live} title="Show the last 30 minutes, updating every 10 seconds">
          <span className="hm-dot" />{live ? 'Live' : 'Go live'}
        </button>
        <button type="button" className="hm-btn hm-hide-sm" onClick={() => setZoom((z) => (z === 'fit' ? 'full' : 'fit'))} title={zoom === 'fit' ? 'Show at real size' : 'Fit to screen'}>
          {zoom === 'fit' ? '100%' : 'Fit'}
        </button>
      </div>

      <div className="hm-body">
        {/* ── Stage ── */}
        <div className="hm-main">
          <div className="hm-note">
            {live ? <>Live · last 30 minutes · updates every 10 s{loading ? ' · updating…' : ''}</> : <>{rangeLabel}{windowed ? ` · ${stamp(tA, withTime)} – ${win[1] >= 1 ? 'end' : stamp(tB, withTime)}` : ''}{loading ? ' · loading…' : ''}</>}
            {' · '}{LAYOUTS.find((l) => l.id === layout)?.label} at {deviceW}px
            {capped ? ` · newest ${fmtNum(data!.clicks.length)} of ${fmtNum(data!.total)} clicks` : ''}
            {popup ? ` · clicks on the pop-up “${popupName}”, shown on it` : ''}
            {layoutInfo && layoutInfo.missing > 0 && mode !== 'scroll' ? ` · ${layoutInfo.missing} clicked ${layoutInfo.missing === 1 ? 'item isn’t' : 'items aren’t'} on screen now (menus, pop-ups) — shown where they were` : ''}
          </div>
          <div className="hm-stage" ref={stageRef}>
            {loaded.setup && <div className="hm-empty">Heatmaps need one database step — run <code>supabase/migrations/20261124_heatmaps.sql</code> in Supabase → SQL editor.</div>}
            {!loaded.setup && loaded.error && !data && <div className="hm-empty">Couldn’t load clicks: {loaded.error}</div>}
            <div className="hm-frame" style={{ width: deviceW * scale, height: frameH * scale }}>
              <iframe
                ref={iframeRef}
                src={path}
                title={`Page ${path} with its heatmap`}
                onLoad={() => { frameRef.current?.attach(); setFrameReady((n) => n + 1); }}
                style={{ width: deviceW, height: frameH, transform: `scale(${scale})` }}
              />
            </div>
            {data && !loading && inWindow.length === 0 && mode !== 'scroll' && !replayOn && (
              <div className="hm-float">No {show === 'all' ? '' : `${show} `}clicks on this page{layout ? ` on ${layout}s` : ''} {live ? 'in the last 30 minutes' : 'in this period'}.</div>
            )}
            {mode === 'scroll' && page && !page.measured && <div className="hm-float">No scroll data for this page in this period yet.</div>}
          </div>

          {/* ── Timeline ── */}
          <div className="hm-timeline">
            <button type="button" className="hm-btn hm-icon" onClick={() => (playing ? setPlaying(false) : startPlay())} aria-label={playing ? 'Pause' : 'Play the clicks over time'} title={playing ? 'Pause' : 'Watch clicks build up over time'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <div className="hm-track">
              <div className="hm-bars" aria-hidden="true">
                {histogram.map((n, i) => {
                  const inside = (i + 0.5) / BINS >= win[0] && (i + 0.5) / BINS <= win[1];
                  return <span key={i} style={{ height: `${Math.max(n ? 8 : 0, (n / histMax) * 100)}%`, opacity: inside ? 1 : 0.28 }} />;
                })}
              </div>
              <div className="hm-window" style={{ left: `${win[0] * 100}%`, width: `${(win[1] - win[0]) * 100}%` }} />
              <input type="range" min={0} max={1000} value={Math.round(win[0] * 1000)} aria-label="Start of time window"
                onChange={(e) => { setPlaying(false); const v = Number(e.target.value) / 1000; setWin(([, b]) => [Math.min(v, b - 0.01), b]); }} />
              <input type="range" min={0} max={1000} value={Math.round(win[1] * 1000)} aria-label="End of time window"
                onChange={(e) => { setPlaying(false); const v = Number(e.target.value) / 1000; setWin(([a]) => [a, Math.max(v, a + 0.01)]); }} />
            </div>
            <div className="hm-tl-label">
              <span>{stamp(periodStart, withTime || live)}</span>
              {windowed ? <button type="button" className="hm-link" onClick={() => { setPlaying(false); setWin([0, 1]); }}>Whole period</button> : <span>{live ? 'now' : stamp(periodEnd, withTime)}</span>}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <aside className="hm-side">
          <div className="hm-tabs" role="tablist">
            {([['overview', 'Overview'], ['elements', 'Most pressed'], ['visits', 'Visits'], ...(live ? [['live', 'Live feed']] : [])] as [Panel, string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={panel === id} className={panel === id ? 'on' : ''} onClick={() => setPanel(id)}>{label}</button>
            ))}
          </div>

          {picked != null && (
            <div className="hm-picked">
              <div>
                <b>{elementName(elements[picked])}</b>
                <span className="mono">{elementDetail(elements[picked]) ?? elements[picked]?.s}</span>
              </div>
              {stats.byEl.get(picked) ? (
                <div className="hm-picked-stats">
                  <Mini v={fmtNum(stats.byEl.get(picked)!.n)} l="clicks" />
                  <Mini v={fmtPct(ratio(stats.byEl.get(picked)!.n, stats.total))} l="of all clicks" />
                  <Mini v={fmtNum(stats.byEl.get(picked)!.visitors)} l="visitors" />
                  <Mini v={stats.byEl.get(picked)!.ms ? fmtDur(stats.byEl.get(picked)!.ms) : '—'} l="after opening" />
                </div>
              ) : <span className="hm-muted">No clicks on this in the current view.</span>}
              <button type="button" className="hm-link" onClick={() => setPicked(null)}>Clear</button>
            </div>
          )}

          {panel === 'overview' && (
            <div className="hm-pane">
              <div className="hm-kpis">
                <Mini v={fmtNum(stats.total)} l="clicks" big />
                <Mini v={page?.visits ? fmtPct(Math.min(1, ratio(stats.visitors, page.visits))) : fmtNum(stats.visitors)} l={page?.visits ? `of ${fmtNum(page.visits)} visits clicked` : 'visits clicked'} big />
                <Mini v={stats.visitors ? (stats.total / stats.visitors).toFixed(1) : '—'} l="clicks per visit" />
                <Mini v={stats.firstClick ? fmtDur(stats.firstClick) : '—'} l="to first click" />
                <Mini v={page?.engaged_ms ? fmtDur(page.engaged_ms) : '—'} l="time on page" />
                <Mini v={page?.scroll ? `${page.scroll}%` : '—'} l="scrolled (avg)" />
                <Mini v={fmtNum(stats.rage)} l="rage clicks" warn={stats.rage > 0} onClick={stats.rage ? () => setShow('rage') : undefined} />
                <Mini v={fmtNum(stats.dead)} l="dead clicks" warn={stats.dead > 0} onClick={stats.dead ? () => setShow('dead') : undefined} />
              </div>
              <Section title="Top 5 pressed">
                {stats.ranked.slice(0, 5).map((r, i) => (
                  <ElementRow key={r.el} rank={i + 1} name={elementName(elements[r.el])} sub={elementDetail(elements[r.el])} n={r.n} share={ratio(r.n, stats.total)} rage={r.rage} dead={r.dead} on={picked === r.el} onClick={() => choose(r.el)} />
                ))}
                {!stats.ranked.length && <span className="hm-muted">No clicks yet.</span>}
              </Section>
              <Section title="Clicks by hour of day">
                <div className="hm-hours">
                  {stats.hours.map((n, h) => (
                    <span key={h} title={`${String(h).padStart(2, '0')}:00 — ${n} clicks`} style={{ height: `${Math.max(n ? 6 : 2, (n / Math.max(1, ...stats.hours)) * 100)}%`, background: n ? heatColor(n / Math.max(1, ...stats.hours), 0.9) : undefined }} />
                  ))}
                </div>
                <div className="hm-hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
              </Section>
              {layouts && (
                <Section title="All clicks on this page by screen">
                  {LAYOUTS.map((l) => {
                    const total = (layouts.phone ?? 0) + (layouts.tablet ?? 0) + (layouts.desktop ?? 0);
                    return (
                      <button key={l.id} type="button" className={`hm-split ${layout === l.id ? 'on' : ''}`} onClick={() => setLayout(l.id)}>
                        <span>{l.label}</span>
                        <i style={{ width: `${ratio(layouts[l.id] ?? 0, total) * 100}%` }} />
                        <em>{fmtNum(layouts[l.id] ?? 0)}</em>
                      </button>
                    );
                  })}
                </Section>
              )}
              <p className="hm-help">
                <b>Rage click</b>: three or more quick clicks on one spot — something isn’t working or isn’t loading fast enough.{' '}
                <b>Dead click</b>: a click on something that isn’t a link or button, where nothing happened — people expected it to do something.
              </p>
            </div>
          )}

          {panel === 'elements' && (
            <div className="hm-pane">
              <p className="hm-help" style={{ marginTop: 0 }}>Everything clicked on this page, most first. Hover the page or pick a row to see where it is.</p>
              {stats.ranked.slice(0, 150).map((r, i) => (
                <ElementRow key={r.el} rank={i + 1} name={elementName(elements[r.el])} sub={elementDetail(elements[r.el])} n={r.n} share={ratio(r.n, stats.total)} rage={r.rage} dead={r.dead} visitors={r.visitors} on={picked === r.el} onClick={() => choose(r.el)} />
              ))}
              {!stats.ranked.length && <span className="hm-muted">No clicks in this view.</span>}
            </div>
          )}

          {panel === 'visits' && (
            <div className="hm-pane">
              <p className="hm-help" style={{ marginTop: 0 }}>Each visit that clicked on this page. Press one to replay its clicks in order on the page.</p>
              {replay && (
                <div className="hm-replay">
                  <span>Replaying visit · click {replay.step + 1} of {replayClicks.length}{replay.done ? ' · done' : ''}</span>
                  <button type="button" className="hm-link" onClick={() => setReplay({ visit: replay.visit, step: 0, done: false })}>Again</button>
                  <button type="button" className="hm-link" onClick={() => setReplay(null)}>Stop</button>
                </div>
              )}
              {visitRows.map((v) => {
                const info = visits[v.visit];
                const on = replay?.visit === v.visit;
                return (
                  <button key={v.visit} type="button" className={`hm-visit ${on ? 'on' : ''}`} onClick={() => setReplay(on ? null : { visit: v.visit, step: 0, done: false })}>
                    <span className="hm-visit-dev" aria-hidden="true">{deviceIcon(info?.d ?? '')}</span>
                    <span className="hm-visit-main">
                      <b>{stamp(v.first, true)}</b>
                      <span>{info?.c ? `${flag(info.c)} ${countryName(info.c)}` : 'Unknown country'} · {info?.src ?? 'Direct'}{info?.b ? ` · ${info.b}` : ''}</span>
                    </span>
                    <span className="hm-visit-n">{v.n} {v.n === 1 ? 'click' : 'clicks'}{v.rage ? <em> · {v.rage} rage</em> : null}<small>{v.last > v.first ? fmtDur(v.last - v.first) : ''}</small></span>
                  </button>
                );
              })}
              {!visitRows.length && <span className="hm-muted">No visits with clicks in this view.</span>}
            </div>
          )}

          {panel === 'live' && live && (
            <div className="hm-pane">
              <p className="hm-help" style={{ marginTop: 0 }}>Clicks on this page in the last 30 minutes, newest first. New ones glow on the map in Clicks view.</p>
              {[...shown].sort((a, b) => b.t - a.t).slice(0, 60).map((c: Click, i) => (
                <div key={`${c.t}-${i}`} className="hm-feed">
                  <span className="mono">{clock(c.t)}</span>
                  <span className="hm-feed-what">{elementName(elements[c.el])}{c.rage ? <em> · rage</em> : c.dead ? <em> · dead</em> : null}</span>
                  <span className="hm-feed-dev">{layoutOf(c.vw)} {visits[c.visit]?.c ? flag(visits[c.visit].c) : ''}</span>
                </div>
              ))}
              {!shown.length && <span className="hm-muted">Waiting for clicks… this updates every 10 seconds.</span>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Mini({ v, l, big, warn, onClick }: { v: string; l: string; big?: boolean; warn?: boolean; onClick?: () => void }) {
  const style: CSSProperties = { color: warn ? 'var(--warn)' : 'var(--text-1)', fontSize: big ? 20 : 15 };
  const body = (
    <>
      <span className="hm-mini-v mono" style={style}>{v}</span>
      <span className="hm-mini-l">{l}</span>
    </>
  );
  return onClick
    ? <button type="button" className="hm-mini hm-mini-btn" onClick={onClick} title="Show only these">{body}</button>
    : <div className="hm-mini">{body}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="hm-section">
      <div className="hm-section-title">{title}</div>
      {children}
    </div>
  );
}

function ElementRow({ rank, name, sub, n, share, rage, dead, visitors, on, onClick }: {
  rank: number; name: string; sub?: string; n: number; share: number; rage: number; dead: number; visitors?: number; on: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`hm-el ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="hm-el-rank mono">{rank}</span>
      <span className="hm-el-main">
        <b>{name}</b>
        {sub && <span className="mono">{sub}</span>}
        <i style={{ width: `${Math.max(2, share * 100)}%`, background: heatColor(Math.min(1, 0.35 + share * 2), 0.85) }} />
      </span>
      <span className="hm-el-n">
        <b className="mono">{fmtNum(n)}</b>
        <span>{fmtPct(share)}{visitors != null ? ` · ${fmtNum(visitors)} visitors` : ''}</span>
        {(rage > 0 || dead > 0) && <em>{rage ? `${rage} rage` : ''}{rage && dead ? ' · ' : ''}{dead ? `${dead} dead` : ''}</em>}
      </span>
    </button>
  );
}

const CSS = `
.hm-shell { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; background: var(--bg-0); color: var(--text-1); }
.hm-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--line-1); background: var(--bg-1); }
.hm-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--text-1); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.hm-btn:hover { border-color: var(--accent-line); }
.hm-icon { width: 34px; justify-content: center; padding: 7px 0; font-size: 11px; }
.hm-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-4); }
.hm-live { border-color: rgba(239,68,68,.5); color: #f87171; background: rgba(239,68,68,.1); }
.hm-live .hm-dot { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.25); animation: hm-pulse 1.4s ease-in-out infinite; }
@keyframes hm-pulse { 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }
.hm-select { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--bg-2); font-size: 12.5px; cursor: pointer; min-width: 0; }
.hm-select span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-select select { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; font-size: 16px; }
.hm-grow { flex: 1 1 180px; max-width: 360px; }
.hm-seg { display: inline-flex; border: 1px solid var(--line-2); border-radius: 8px; overflow: hidden; background: var(--bg-2); }
.hm-seg button { padding: 7px 11px; border: 0; background: transparent; color: var(--text-2); font: inherit; font-size: 12.5px; cursor: pointer; display: inline-flex; gap: 5px; align-items: baseline; white-space: nowrap; }
.hm-seg button + button { border-left: 1px solid var(--line-1); }
.hm-seg button.on { background: var(--accent-soft); color: var(--accent); }
.hm-seg em { font-style: normal; font-size: 10.5px; opacity: .7; font-family: 'Geist Mono', monospace; }
.hm-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
.hm-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--line-1); }
.hm-note { padding: 7px 14px; font-size: 11.5px; color: var(--text-3); border-bottom: 1px solid var(--line-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hm-stage { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 8px 12px; background: repeating-linear-gradient(45deg, var(--bg-0), var(--bg-0) 10px, var(--bg-1) 10px, var(--bg-1) 20px); }
.hm-frame { position: relative; margin: 0 auto; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.35); background: #fff; }
.hm-frame iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; background: #fff; }
.hm-empty, .hm-float { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); z-index: 2; max-width: min(520px, 90%); padding: 9px 14px; border-radius: 9px; font-size: 12.5px; background: var(--bg-1); border: 1px solid var(--line-2); box-shadow: 0 8px 24px rgba(0,0,0,.25); text-align: center; }
.hm-empty code { font-size: 11.5px; }
.hm-timeline { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 10px; padding: 8px 14px 10px; border-top: 1px solid var(--line-1); background: var(--bg-1); }
.hm-timeline > .hm-btn { grid-row: 1 / span 2; align-self: center; }
.hm-track { position: relative; height: 40px; }
.hm-bars { position: absolute; inset: 0 0 6px; display: flex; align-items: flex-end; gap: 2px; }
.hm-bars span { flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-width: 1px; }
.hm-window { position: absolute; top: 0; bottom: 0; border-left: 2px solid var(--accent); border-right: 2px solid var(--accent); background: rgba(62,207,142,.06); pointer-events: none; }
.hm-track input[type=range] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; background: transparent; pointer-events: none; -webkit-appearance: none; appearance: none; }
.hm-track input[type=range]::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 14px; height: 40px; border-radius: 4px; background: var(--accent); opacity: .85; cursor: ew-resize; border: 2px solid var(--bg-0); }
.hm-track input[type=range]::-moz-range-thumb { pointer-events: auto; width: 12px; height: 38px; border-radius: 4px; background: var(--accent); opacity: .85; cursor: ew-resize; border: 2px solid var(--bg-0); }
.hm-track input[type=range]::-webkit-slider-runnable-track { background: transparent; }
.hm-tl-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-3); margin-top: 3px; }
.hm-link { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.hm-side { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg-1); }
.hm-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid var(--line-1); overflow-x: auto; }
.hm-tabs button { padding: 8px 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--text-3); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.hm-tabs button.on { color: var(--text-1); border-bottom-color: var(--accent); }
.hm-pane { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.hm-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.hm-mini { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; border-radius: 8px; background: var(--bg-2); border: 1px solid var(--line-1); text-align: left; min-width: 0; }
.hm-mini-btn { cursor: pointer; font: inherit; color: inherit; }
.hm-mini-btn:hover { border-color: var(--warn); }
.hm-mini-v { font-weight: 500; line-height: 1.15; }
.hm-mini-l { font-size: 11px; color: var(--text-3); }
.hm-section { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.hm-section-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-4); margin-bottom: 2px; }
.hm-el { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; gap: 8px; align-items: center; width: 100%; padding: 7px 8px; border-radius: 8px; border: 1px solid transparent; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.hm-el:hover { background: var(--bg-2); }
.hm-el.on { background: var(--accent-soft); border-color: var(--accent-line); }
.hm-el-rank { font-size: 11px; color: var(--text-4); text-align: right; }
.hm-el-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.hm-el-main b { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-el-main span { font-size: 10.5px; color: var(--text-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-el-main i { display: block; height: 3px; border-radius: 2px; }
.hm-el-n { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; font-size: 10.5px; color: var(--text-3); white-space: nowrap; }
.hm-el-n b { font-size: 13px; color: var(--text-1); font-weight: 500; }
.hm-el-n em, .hm-visit-n em, .hm-feed em { font-style: normal; color: var(--warn); }
.hm-hours { display: flex; align-items: flex-end; gap: 2px; height: 54px; }
.hm-hours span { flex: 1; background: var(--bg-3); border-radius: 2px 2px 0 0; }
.hm-hours-axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-4); font-family: 'Geist Mono', monospace; }
.hm-split { display: grid; grid-template-columns: 64px minmax(0,1fr) 48px; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 7px; border: 0; background: none; color: var(--text-2); font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
.hm-split i { display: block; height: 6px; border-radius: 3px; background: var(--accent); min-width: 2px; }
.hm-split em { font-style: normal; text-align: right; font-family: 'Geist Mono', monospace; font-size: 11.5px; }
.hm-split.on { background: var(--bg-2); color: var(--text-1); }
.hm-help { font-size: 11.5px; line-height: 1.5; color: var(--text-3); margin: 12px 0 0; }
.hm-help b { color: var(--text-2); font-weight: 500; }
.hm-muted { font-size: 12px; color: var(--text-4); padding: 6px 2px; }
.hm-picked { margin: 10px 12px 0; padding: 10px; border-radius: 9px; border: 1px solid rgba(59,130,246,.45); background: rgba(59,130,246,.08); display: flex; flex-direction: column; gap: 8px; }
.hm-picked > div:first-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hm-picked b { font-size: 13px; font-weight: 500; }
.hm-picked .mono { font-size: 10.5px; color: var(--text-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-picked-stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 4px; }
.hm-picked-stats .hm-mini { padding: 6px; }
.hm-picked .hm-link { align-self: flex-start; }
.hm-visit { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; gap: 8px; align-items: center; width: 100%; padding: 8px; border-radius: 8px; border: 1px solid transparent; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.hm-visit:hover { background: var(--bg-2); }
.hm-visit.on { background: rgba(255,90,44,.1); border-color: rgba(255,90,44,.4); }
.hm-visit-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.hm-visit-main b { font-size: 12.5px; font-weight: 500; }
.hm-visit-main span { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-visit-n { display: flex; flex-direction: column; align-items: flex-end; font-size: 11.5px; color: var(--text-2); white-space: nowrap; }
.hm-visit-n small { font-size: 10.5px; color: var(--text-4); }
.hm-replay { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 10px; border-radius: 8px; background: rgba(255,90,44,.1); font-size: 12px; }
.hm-replay span { flex: 1; }
.hm-feed { display: grid; grid-template-columns: 62px minmax(0,1fr) auto; gap: 8px; font-size: 12px; padding: 5px 4px; border-bottom: 1px solid var(--line-1); }
.hm-feed .mono { color: var(--text-3); font-size: 11px; }
.hm-feed-what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-feed-dev { color: var(--text-3); font-size: 11px; text-transform: capitalize; }
@media (max-width: 980px) {
  .hm-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 42%); }
  .hm-main { border-right: 0; border-bottom: 1px solid var(--line-1); }
}
@media (max-width: 640px) {
  .hm-head { gap: 6px; padding: 8px 10px; }
  .hm-hide-sm { display: none; }
  .hm-grow { flex-basis: 100%; max-width: none; order: -1; }
  .hm-seg button { padding: 6px 8px; font-size: 12px; }
  .hm-note { white-space: normal; }
  .hm-picked-stats { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
`;
