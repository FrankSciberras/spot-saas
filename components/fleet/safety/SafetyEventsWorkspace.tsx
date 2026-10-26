'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  EVENT_KIND_META,
  classifiedByLabel,
  eventKindMeta,
  severityOf,
  type SafetyEventKind,
} from '@/lib/tracking/safety';
import type { MapEvent } from './SafetyEventMap';

const SafetyEventMap = dynamic(() => import('./SafetyEventMap'), { ssr: false });

export interface TrailPoint {
  lat: number;
  lng: number;
  s: number | null;
  dt: number;
}

export interface DetailEvent {
  id: string;
  source: 'behavior' | 'speeding';
  kind: SafetyEventKind;
  at: string;
  lat: number | null;
  lng: number | null;
  /** Peak horizontal force, m/s² (harsh events). */
  magnitude: number | null;
  speedBefore: number | null;
  speedAfter: number | null;
  durationMs: number | null;
  turnRate: number | null;
  accuracy: number | null;
  classifiedBy: string | null;
  trail: TrailPoint[] | null;
  appVersion: string | null;
  /** null = not looked up yet; '' = no usable address. */
  place: string | null;
  speedKmh: number | null;
  limitKmh: number | null;
  vehicle: string | null;
  shiftName: string | null;
}

const FILTERS: { key: 'all' | SafetyEventKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'harsh_brake', label: EVENT_KIND_META.harsh_brake.short },
  { key: 'harsh_accel', label: EVENT_KIND_META.harsh_accel.short },
  { key: 'harsh_turn', label: EVENT_KIND_META.harsh_turn.short },
  { key: 'harsh_motion', label: EVENT_KIND_META.harsh_motion.short },
  { key: 'speeding', label: EVENT_KIND_META.speeding.short },
];

const ROUTE_WINDOW_MS = 5 * 60_000;

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fullLabel(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** One-line summary under the event title. */
function summaryOf(e: DetailEvent): string {
  if (e.source === 'speeding') return `${e.speedKmh} km/h where the limit is ${e.limitKmh} km/h`;
  const parts: string[] = [];
  const sev = severityOf(e.magnitude);
  parts.push(sev.label);
  if (e.speedBefore != null && e.speedAfter != null) parts.push(`${Math.round(e.speedBefore)} → ${Math.round(e.speedAfter)} km/h`);
  else if (e.speedAfter != null) parts.push(`${Math.round(e.speedAfter)} km/h`);
  if (e.durationMs != null) parts.push(`${(e.durationMs / 1000).toFixed(1)} s`);
  return parts.join(' · ');
}

export default function SafetyEventsWorkspace({
  driverId,
  events: initialEvents,
  initialEventId,
}: {
  driverId: string;
  events: DetailEvent[];
  initialEventId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState(initialEvents);
  const [filter, setFilter] = useState<'all' | SafetyEventKind>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialEventId && initialEvents.some((e) => e.id === initialEventId) ? initialEventId : null
  );
  // Route is stored with the event it belongs to, so a stale fetch never
  // draws under a different event.
  const [routeFor, setRouteFor] = useState<{ id: string; pts: [number, number][] } | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const e of events) c.set(e.kind, (c.get(e.kind) || 0) + 1);
    return c;
  }, [events]);

  const visible = useMemo(() => (filter === 'all' ? events : events.filter((e) => e.kind === filter)), [events, filter]);
  const selected = events.find((e) => e.id === selectedId) || null;

  const mapEvents: MapEvent[] = useMemo(
    () =>
      visible
        .filter((e) => e.lat != null && e.lng != null)
        .map((e) => ({
          id: e.id,
          lat: e.lat!,
          lng: e.lng!,
          color: eventKindMeta(e.kind).color,
          tooltip: `${eventKindMeta(e.kind).label}\n${dayLabel(e.at)} ${timeLabel(e.at)}${e.place ? `\n${e.place}` : ''}`,
        })),
    [visible]
  );

  const selectedTrail = selected?.trail || null;
  const trail = useMemo<[number, number][]>(
    () => (selectedTrail || []).map((p) => [p.lat, p.lng]),
    [selectedTrail]
  );

  // Coarse GPS history ±5 min around the selected event.
  const selectedAt = selected?.at || null;
  const route = useMemo(() => (routeFor && routeFor.id === selectedId ? routeFor.pts : []), [routeFor, selectedId]);
  useEffect(() => {
    if (!selectedId || !selectedAt) return;
    let cancelled = false;
    const t = new Date(selectedAt).getTime();
    (async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('latitude, longitude, recorded_at')
        .eq('driver_id', driverId)
        .gte('recorded_at', new Date(t - ROUTE_WINDOW_MS).toISOString())
        .lte('recorded_at', new Date(t + ROUTE_WINDOW_MS).toISOString())
        .order('recorded_at', { ascending: true });
      if (!cancelled) setRouteFor({ id: selectedId, pts: ((data || []) as any[]).map((p) => [p.latitude, p.longitude]) });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedAt, supabase, driverId]);

  // Street names, a small batch at a time (the server looks them up at
  // 1/second and caches them on the event, so this only runs once per event).
  const fetchPlaces = useCallback(async (list: DetailEvent[]) => {
    const body = {
      behavior: list.filter((e) => e.source === 'behavior').map((e) => e.id),
      speeding: list.filter((e) => e.source === 'speeding').map((e) => e.id),
    };
    try {
      const res = await fetch('/api/fleet/safety/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return 0;
      const { places } = (await res.json()) as { places: Record<string, string> };
      const found = Object.keys(places).length;
      if (found > 0) setEvents((prev) => prev.map((e) => (e.id in places ? { ...e, place: places[e.id] } : e)));
      return found;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The event opened from a link goes first.
      const missing = initialEvents
        .filter((e) => e.place == null && e.lat != null)
        .sort((a, b) => (b.id === initialEventId ? 1 : 0) - (a.id === initialEventId ? 1 : 0));
      for (let i = 0; i < missing.length && i < 48 && !cancelled; i += 8) {
        if ((await fetchPlaces(missing.slice(i, i + 8))) === 0) break;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEvents, initialEventId, fetchPlaces]);

  // Clicking the open event again closes it. The URL keeps ?event= so the
  // view can be shared or reloaded.
  const select = useCallback(
    (id: string) => {
      const next = id === selectedId ? null : id;
      setSelectedId(next);
      const ev = next ? events.find((e) => e.id === next) : null;
      if (ev && ev.place == null && ev.lat != null) void fetchPlaces([ev]);
      const url = new URL(window.location.href);
      if (next) url.searchParams.set('event', next);
      else url.searchParams.delete('event');
      window.history.replaceState(null, '', url.toString());
    },
    [selectedId, events, fetchPlaces]
  );

  // Keep the chosen event visible in the list (e.g. after clicking its pin).
  useEffect(() => {
    if (!selectedId) return;
    itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const groups = useMemo(() => {
    const out: { day: string; items: DetailEvent[] }[] = [];
    for (const e of visible) {
      const day = dayLabel(e.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [visible]);

  if (events.length === 0) {
    return (
      <div style={st.empty}>
        <FleetIcon name="live" size={30} stroke={1.4} />
        <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No events in this period</div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
          No harsh driving or speeding was recorded for this driver. Try a longer period.
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={st.filters}>
        {FILTERS.filter((f) => f.key === 'all' || counts.get(f.key)).map((f) => {
          const n = f.key === 'all' ? events.length : counts.get(f.key) || 0;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              className="fleetHover"
              onClick={() => setFilter(f.key)}
              style={{ ...st.filter, ...(on ? st.filterOn : {}) }}
            >
              {f.key !== 'all' && <span style={{ ...st.dot, background: eventKindMeta(f.key).color }} />}
              {f.label} <span style={{ opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      <SafetyEventMap events={mapEvents} selectedId={selectedId} onSelect={(id) => select(id)} route={route} trail={trail} height={360} />
      {selected && (route.length > 1 || trail.length > 1) && (
        <div style={st.legend}>
          {trail.length > 1 && (
            <span><span style={{ ...st.legendLine, background: '#2bbd7e' }} /> precise GPS around the event</span>
          )}
          {route.length > 1 && (
            <span><span style={{ ...st.legendLine, background: '#64748b' }} /> route 5 min before &amp; after</span>
          )}
        </div>
      )}

      <div style={st.list}>
        {groups.map((g) => (
          <div key={g.day}>
            <div style={st.dayHead}>{g.day}</div>
            {g.items.map((e) => {
              const meta = eventKindMeta(e.kind);
              const isSel = e.id === selectedId;
              return (
                <div
                  key={e.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(e.id, el);
                    else itemRefs.current.delete(e.id);
                  }}
                  style={{ ...st.item, ...(isSel ? st.itemOn : {}) }}
                >
                  <button className="fleetHover" style={st.row} onClick={() => select(e.id)}>
                    <span style={{ ...st.dot, width: 10, height: 10, background: meta.color }} />
                    <span style={st.time}>{timeLabel(e.at)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={st.title}>{meta.label}</span>
                      <span style={st.summary}>
                        {summaryOf(e)}
                        {e.place ? ` · ${e.place}` : ''}
                      </span>
                    </span>
                    <span style={{ color: 'var(--text-4)', fontSize: 12 }}>{isSel ? '▲' : '▼'}</span>
                  </button>
                  {isSel && <EventDetail e={e} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={st.note}>
        Harsh events are detected by the driver app&rsquo;s motion sensor. App version 1.0.4 and newer also
        records the speed before and after, how long it lasted, sharp cornering, and a precise GPS trail;
        older events show what was available at the time.
      </div>
    </>
  );
}

function EventDetail({ e }: { e: DetailEvent }) {
  const sev = severityOf(e.magnitude);
  const how = classifiedByLabel(e.classifiedBy);
  const facts: [string, string][] = [['When', fullLabel(e.at)]];
  facts.push(['Where', e.place === null ? (e.lat != null ? 'Looking up the street…' : 'No location recorded') : e.place || 'No street name for this spot']);

  if (e.source === 'speeding') {
    facts.push(['Speed', `${e.speedKmh} km/h — ${(e.speedKmh ?? 0) - (e.limitKmh ?? 0)} km/h over`]);
    facts.push(['Limit used', `${e.limitKmh} km/h (your fleet's speed limit setting)`]);
  } else {
    facts.push(['Strength', sev.g ? `${sev.label} (${sev.g})` : sev.label]);
    if (e.speedBefore != null || e.speedAfter != null) {
      facts.push([
        'Speed',
        e.speedBefore != null && e.speedAfter != null
          ? `${Math.round(e.speedBefore)} km/h before → ${Math.round(e.speedAfter)} km/h after`
          : e.speedAfter != null
            ? `${Math.round(e.speedAfter)} km/h just after`
            : `${Math.round(e.speedBefore!)} km/h just before`,
      ]);
    }
    if (e.durationMs != null) facts.push(['Lasted', `${(e.durationMs / 1000).toFixed(1)} seconds`]);
    if (e.turnRate != null && e.turnRate >= 5) facts.push(['Turning', `${Math.round(e.turnRate)}° per second`]);
    if (how) facts.push(['How we know the type', how]);
  }
  if (e.vehicle) facts.push(['Car', e.vehicle]);
  if (e.shiftName) facts.push(['Shift', e.shiftName]);
  if (e.accuracy != null) facts.push(['GPS accuracy', `±${Math.round(e.accuracy)} m`]);

  const speeds = (e.trail || []).filter((p) => p.s != null && Math.abs(p.dt) <= 60);
  const legacy = e.source === 'behavior' && !e.appVersion;

  return (
    <div style={st.detail}>
      <div style={st.facts}>
        {facts.map(([k, v]) => (
          <div key={k} style={st.fact}>
            <span style={st.factKey}>{k}</span>
            <span style={st.factVal}>{v}</span>
          </div>
        ))}
      </div>

      {speeds.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <div style={st.factKey}>Speed around the event</div>
          <div style={st.speedRow}>
            {speeds.map((p, i) => (
              <span key={i} style={{ ...st.speedChip, ...(p.dt >= 0 && p.dt <= 2 ? st.speedChipNow : {}) }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{p.dt > 0 ? `+${p.dt}s` : `${p.dt}s`}</span>
                <strong>{p.s}</strong>
              </span>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-4)', alignSelf: 'center' }}>km/h</span>
          </div>
        </div>
      )}

      {legacy && (
        <div style={st.legacy}>
          Recorded by an older driver app. Once the driver updates to 1.0.4, events also show speed
          before/after, duration, cornering and a precise trail.
        </div>
      )}

      {e.lat != null && e.lng != null && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <a
            className="fleetHover"
            style={st.linkBtn}
            href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <FleetIcon name="pin" size={13} /> Google Maps
          </a>
          <a
            className="fleetHover"
            style={st.linkBtn}
            href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${e.lat},${e.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Street View
          </a>
        </div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  filter: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 11px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 999,
    fontSize: 12,
    color: 'var(--text-2)',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  filterOn: { background: 'var(--text-1)', color: 'var(--bg-1)', borderColor: 'var(--text-1)', fontWeight: 600 },
  dot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', marginTop: -4 },
  legendLine: { display: 'inline-block', width: 18, height: 3, borderRadius: 2, verticalAlign: 'middle', marginRight: 4 },
  list: {
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
  },
  dayHead: {
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--text-4)',
    background: 'var(--bg-2)',
    borderBottom: '1px solid var(--line-1)',
  },
  item: { borderBottom: '1px solid var(--line-1)' },
  itemOn: { background: 'var(--bg-2)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    fontFamily: 'inherit',
    cursor: 'pointer',
    color: 'inherit',
  },
  time: { fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', width: 44, flexShrink: 0 },
  title: { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' },
  summary: {
    display: 'block',
    fontSize: 12,
    color: 'var(--text-3)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detail: { padding: '2px 14px 14px 34px' },
  facts: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px 18px' },
  fact: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  factKey: { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-4)' },
  factVal: { fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 },
  speedRow: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 },
  speedChip: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '3px 8px',
    border: '1px solid var(--line-1)',
    borderRadius: 8,
    fontSize: 12.5,
    color: 'var(--text-1)',
    background: 'var(--bg-1)',
    minWidth: 38,
  },
  speedChipNow: { borderColor: 'var(--neg, #f06464)' },
  legacy: {
    marginTop: 10,
    fontSize: 11.5,
    color: 'var(--text-3)',
    lineHeight: 1.5,
    padding: '7px 10px',
    background: 'var(--bg-1)',
    border: '1px dashed var(--line-2)',
    borderRadius: 8,
  },
  linkBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-2)',
    textDecoration: 'none',
  },
  note: { fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 },
  empty: {
    padding: '48px 18px',
    textAlign: 'center',
    color: 'var(--text-3)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
  },
};
