'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import FleetIcon from '@/components/fleet/FleetIcon';

export interface TripDriver {
  id: string;
  name: string;
}

interface Segment {
  id: string;
  driver_id: string;
  kind: 'trip' | 'stop';
  started_at: string;
  ended_at: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_m: number;
  max_speed_kmh: number | null;
  is_open: boolean;
  place_hint: string | null;
}

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function durationLabel(startIso: string, endIso: string): string {
  const mins = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function kmLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function mapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

export default function TripsWorkspace({ orgId, drivers }: { orgId: string; drivers: TripDriver[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [dateStr, setDateStr] = useState(() => todayStr());
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const nameById = useMemo(() => new Map(drivers.map((d) => [d.id, d.name])), [drivers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 3600_000);
    let query = supabase
      .from('driver_trip_segments')
      .select('id, driver_id, kind, started_at, ended_at, start_lat, start_lng, end_lat, end_lng, distance_m, max_speed_kmh, is_open, place_hint')
      .eq('organization_id', orgId)
      .gte('started_at', start.toISOString())
      .lt('started_at', end.toISOString())
      .order('started_at', { ascending: true });
    if (driverFilter !== 'all') query = query.eq('driver_id', driverFilter);
    const { data, error: qError } = await query;
    setLoading(false);
    if (qError) {
      setError(`Could not load trips: ${qError.message}`);
      return;
    }
    setSegments((data || []) as Segment[]);
  }, [supabase, orgId, dateStr, driverFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group by driver, keeping the drivers-list ordering (alphabetical).
  const grouped = useMemo(() => {
    const map = new Map<string, Segment[]>();
    for (const s of segments) {
      const list = map.get(s.driver_id) || [];
      list.push(s);
      map.set(s.driver_id, list);
    }
    const order = drivers.map((d) => d.id).filter((id) => map.has(id));
    for (const id of map.keys()) if (!order.includes(id)) order.push(id);
    return order.map((id) => ({ driverId: id, segs: map.get(id)! }));
  }, [segments, drivers]);

  const totals = useMemo(() => {
    let trips = 0;
    let distance = 0;
    let drivingMs = 0;
    let stoppedMs = 0;
    for (const s of segments) {
      const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
      if (s.kind === 'trip') {
        trips++;
        distance += s.distance_m;
        drivingMs += ms;
      } else {
        stoppedMs += ms;
      }
    }
    return { trips, distance, drivingMins: Math.round(drivingMs / 60_000), stoppedMins: Math.round(stoppedMs / 60_000) };
  }, [segments]);

  const minsLabel = (mins: number) =>
    mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();

  return (
    <div style={st.wrap}>
      <div style={st.toolbar}>
        <div style={st.dateNav}>
          <button className="fleetHover" style={st.navBtn} onClick={() => setDateStr((d) => shiftDate(d, -1))} title="Previous day">
            ←
          </button>
          <input
            type="date"
            style={st.dateInput}
            value={dateStr}
            max={todayStr()}
            onChange={(e) => e.target.value && setDateStr(e.target.value)}
          />
          <button
            className="fleetHover"
            style={{ ...st.navBtn, opacity: dateStr >= todayStr() ? 0.4 : 1 }}
            onClick={() => setDateStr((d) => shiftDate(d, 1))}
            disabled={dateStr >= todayStr()}
            title="Next day"
          >
            →
          </button>
          {dateStr !== todayStr() && (
            <button className="fleetHover" style={st.todayBtn} onClick={() => setDateStr(todayStr())}>
              Today
            </button>
          )}
        </div>
        <select style={st.select} value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
          <option value="all">All drivers</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {segments.length > 0 && (
        <div style={st.summaryRow}>
          <span style={st.chip}><strong>{totals.trips}</strong>&nbsp;trips</span>
          <span style={st.chip}><strong>{kmLabel(totals.distance)}</strong>&nbsp;driven</span>
          <span style={st.chip}><strong>{minsLabel(totals.drivingMins)}</strong>&nbsp;driving</span>
          <span style={st.chip}><strong>{minsLabel(totals.stoppedMins)}</strong>&nbsp;waiting</span>
        </div>
      )}

      {error && <div style={st.error}>{error}</div>}

      {loading && <div style={st.note}>Loading trips…</div>}

      {!loading && !error && segments.length === 0 && (
        <div style={st.empty}>
          <FleetIcon name="map" size={30} stroke={1.4} />
          <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No trips recorded this day</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 420, margin: '4px auto 0' }}>
            Trips are compiled from drivers&rsquo; GPS trails once an hour. A driver needs to share their
            location (from the driver app) for journeys to show up here.
          </div>
        </div>
      )}

      {grouped.map(({ driverId, segs }, gi) => {
        const name = nameById.get(driverId) || 'Unknown driver';
        const dTrips = segs.filter((s) => s.kind === 'trip');
        const dKm = dTrips.reduce((sum, s) => sum + s.distance_m, 0);
        const dDriveMins = Math.round(
          dTrips.reduce((sum, s) => sum + (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()), 0) / 60_000
        );
        return (
          <div key={driverId} style={st.card}>
            <div style={st.cardHead}>
              <span style={{ ...st.avatar, background: PALETTE[gi % PALETTE.length] }}>{initialsOf(name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={st.cardName}>{name}</span>
                <span style={st.cardMeta}>
                  {dTrips.length} {dTrips.length === 1 ? 'trip' : 'trips'} · {kmLabel(dKm)} · {minsLabel(dDriveMins)} driving
                </span>
              </span>
            </div>
            <div>
              {segs.map((s) => (
                <div key={s.id} style={st.segRow}>
                  <span style={{ ...st.segIcon, color: s.kind === 'trip' ? 'var(--accent, #2bbd7e)' : 'var(--warn, #f5b54a)' }}>
                    {s.kind === 'trip' ? '→' : '⏸'}
                  </span>
                  <span style={st.segTime}>
                    {timeLabel(s.started_at)}–{s.is_open ? 'now' : timeLabel(s.ended_at)}
                  </span>
                  <span style={st.segText}>
                    {s.kind === 'trip' ? (
                      <>
                        Drove <strong>{kmLabel(s.distance_m)}</strong> in {durationLabel(s.started_at, s.ended_at)}
                        {s.max_speed_kmh != null && ` · top ${s.max_speed_kmh} km/h`}
                      </>
                    ) : (
                      <>
                        Waited <strong>{durationLabel(s.started_at, s.ended_at)}</strong>
                        {s.place_hint ? ` at ${s.place_hint}` : ''}
                      </>
                    )}
                    {s.is_open && <span style={st.openBadge}>ongoing</span>}
                  </span>
                  <a
                    className="fleetHover"
                    style={st.mapLink}
                    href={mapUrl(s.kind === 'trip' ? s.end_lat : s.start_lat, s.kind === 'trip' ? s.end_lng : s.start_lng)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open location on the map"
                  >
                    <FleetIcon name="pin" size={13} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!loading && segments.length > 0 && (
        <div style={st.note}>Trips are compiled from the GPS trail once an hour — the latest journeys can take up to an hour to appear.</div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  dateNav: { display: 'flex', gap: 6, alignItems: 'center' },
  navBtn: {
    width: 32,
    height: 34,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-2)',
    fontSize: 14,
    cursor: 'pointer',
  },
  dateInput: {
    padding: '7px 10px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-1)',
    fontSize: 13,
    fontFamily: 'inherit',
    colorScheme: 'dark',
  },
  todayBtn: {
    padding: '7px 12px',
    background: 'transparent',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-2)',
    fontSize: 12.5,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  select: {
    padding: '8px 10px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-1)',
    fontSize: 13,
    fontFamily: 'inherit',
    minWidth: 160,
  },
  summaryRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: {
    padding: '6px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 999,
    fontSize: 12.5,
    color: 'var(--text-2)',
  },
  card: {
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    padding: '4px 0 6px',
    overflow: 'hidden',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderBottom: '1px solid var(--line-1)',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardName: { display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' },
  cardMeta: { display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 },
  segRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderBottom: '1px solid var(--line-0, transparent)',
  },
  segIcon: { width: 18, textAlign: 'center', fontSize: 13, flexShrink: 0 },
  segTime: {
    fontSize: 12,
    color: 'var(--text-3)',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    width: 96,
  },
  segText: { flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 },
  openBadge: {
    marginLeft: 8,
    padding: '1px 8px',
    background: 'var(--accent-soft, rgba(43,189,126,0.15))',
    color: 'var(--accent, #2bbd7e)',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 600,
  },
  mapLink: {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--line-1)',
    borderRadius: 7,
    color: 'var(--text-3)',
    flexShrink: 0,
  },
  note: { fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 },
  error: { fontSize: 12.5, color: 'var(--neg, #f06464)' },
  empty: {
    padding: '48px 18px',
    textAlign: 'center',
    color: 'var(--text-3)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
  },
};
