'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import FleetIcon from '@/components/fleet/FleetIcon';
import 'leaflet/dist/leaflet.css';

export interface PositionItem {
  driverId: string;
  name: string;
  initials: string;
  color: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  isTracking: boolean;
  recordedAt: string;
}

interface TrackingWorkspaceProps {
  orgId: string;
  initialPositions: PositionItem[];
}

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];
// No positions yet → default view (Malta).
const FALLBACK_CENTER: [number, number] = [35.9, 14.42];

type LiveStatus = 'live' | 'stale' | 'offline';

function statusOf(p: PositionItem, now: number): LiveStatus {
  const age = now - new Date(p.recordedAt).getTime();
  if (p.isTracking && age < 120_000) return 'live';
  if (age < 15 * 60_000) return 'stale';
  return 'offline';
}

function agoLabel(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_COLOR: Record<LiveStatus, string> = {
  live: 'var(--pos, #2bbd7e)',
  stale: 'var(--warn, #f5b54a)',
  offline: 'var(--text-4, #777)',
};

export default function TrackingWorkspace({ orgId, initialPositions }: TrackingWorkspaceProps) {
  const supabase = useMemo(() => createClient(), []);
  const [positions, setPositions] = useState<Map<string, PositionItem>>(
    () => new Map(initialPositions.map((p) => [p.driverId, p]))
  );
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState<boolean | null>(null);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const namesRef = useRef<globalThis.Map<string, string>>(
    new globalThis.Map(initialPositions.map((p) => [p.driverId, p.name]))
  );
  const colorIdxRef = useRef(initialPositions.length);
  const didFitRef = useRef(false);

  // Init Leaflet map (client-only, so import dynamically inside the effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.setView(FALLBACK_CENTER, 11);
      mapRef.current = map;
      setNow(Date.now()); // trigger marker sync now that the map exists
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: stream position changes for this org.
  useEffect(() => {
    const channel = supabase
      .channel(`driver-positions-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_positions', filter: `organization_id=eq.${orgId}` },
        async (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || !row.driver_id) return;
          const driverId = row.driver_id as string;
          let name = namesRef.current.get(driverId);
          if (!name) {
            const { data } = await supabase.from('drivers').select('full_name').eq('id', driverId).single();
            name = data?.full_name || 'Unknown driver';
            namesRef.current.set(driverId, name!);
          }
          setPositions((prev) => {
            const next = new Map(prev);
            const existing = next.get(driverId);
            next.set(driverId, {
              driverId,
              name: name!,
              initials: initialsOf(name!),
              color: existing?.color || PALETTE[colorIdxRef.current++ % PALETTE.length],
              latitude: row.latitude as number,
              longitude: row.longitude as number,
              accuracy: (row.accuracy as number) ?? null,
              heading: (row.heading as number) ?? null,
              speed: (row.speed as number) ?? null,
              isTracking: !!row.is_tracking,
              recordedAt: (row.recorded_at as string) || new Date().toISOString(),
            });
            return next;
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeOk(true);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeOk(false);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, orgId]);

  // Polling fallback (also refreshes after laptop sleep / dropped sockets).
  useEffect(() => {
    const refetch = async () => {
      const { data } = await supabase
        .from('driver_positions')
        .select('driver_id, latitude, longitude, accuracy, heading, speed, is_tracking, recorded_at, drivers:driver_id (full_name)')
        .eq('organization_id', orgId);
      if (!data) return;
      setPositions((prev) => {
        const next = new Map(prev);
        for (const r of data as any[]) {
          const name = (Array.isArray(r.drivers) ? r.drivers[0] : r.drivers)?.full_name || 'Unknown driver';
          namesRef.current.set(r.driver_id, name);
          const existing = next.get(r.driver_id);
          next.set(r.driver_id, {
            driverId: r.driver_id,
            name,
            initials: initialsOf(name),
            color: existing?.color || PALETTE[colorIdxRef.current++ % PALETTE.length],
            latitude: r.latitude,
            longitude: r.longitude,
            accuracy: r.accuracy,
            heading: r.heading,
            speed: r.speed,
            isTracking: !!r.is_tracking,
            recordedAt: r.recorded_at,
          });
        }
        return next;
      });
    };
    const interval = setInterval(() => {
      setNow(Date.now());
      if (realtimeOk !== true) refetch();
    }, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [supabase, orgId, realtimeOk]);

  // Sync markers with state.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    for (const p of positions.values()) {
      const status = statusOf(p, now);
      const html = `
        <div class="trkMarker${status === 'live' ? ' trkMarkerLive' : ''}" style="--mk:${p.color};opacity:${status === 'offline' ? 0.45 : 1}">
          <span>${p.initials}</span>
        </div>`;
      const icon = L.divIcon({ html, className: 'trkMarkerWrap', iconSize: [34, 34], iconAnchor: [17, 17] });
      let marker = markersRef.current.get(p.driverId);
      if (!marker) {
        marker = L.marker([p.latitude, p.longitude], { icon }).addTo(map);
        marker.on('click', () => setSelected(p.driverId));
        markersRef.current.set(p.driverId, marker);
      } else {
        marker.setLatLng([p.latitude, p.longitude]);
        marker.setIcon(icon);
      }
      const speedKmh = p.speed != null ? Math.round(Number(p.speed) * 3.6) : null;
      marker.bindTooltip(
        `<strong>${p.name}</strong><br/>${agoLabel(p.recordedAt, now)}${speedKmh != null ? ` · ${speedKmh} km/h` : ''}`,
        { direction: 'top', offset: [0, -16] }
      );
    }
    // Remove markers for drivers no longer present.
    for (const [id, marker] of markersRef.current) {
      if (!positions.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    // Fit bounds once on first data.
    if (!didFitRef.current && positions.size > 0) {
      didFitRef.current = true;
      const pts = Array.from(positions.values()).map((p) => [p.latitude, p.longitude] as [number, number]);
      map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
    }
  }, [positions, now]);

  const focusDriver = (p: PositionItem) => {
    setSelected(p.driverId);
    mapRef.current?.flyTo([p.latitude, p.longitude], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
    markersRef.current.get(p.driverId)?.openTooltip();
  };

  const list = Array.from(positions.values()).sort((a, b) => {
    const sa = statusOf(a, now);
    const sb = statusOf(b, now);
    const rank: Record<LiveStatus, number> = { live: 0, stale: 1, offline: 2 };
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    return a.name.localeCompare(b.name);
  });
  const liveCount = list.filter((p) => statusOf(p, now) === 'live').length;

  return (
    <div style={st.wrap}>
      <style>{markerCss}</style>

      <div style={st.panel}>
        <div style={st.panelHead}>
          <div>
            <div style={st.panelTitle}>Drivers</div>
            <div style={st.panelSub}>
              <span style={{ color: 'var(--pos, #2bbd7e)' }}>{liveCount} live</span> · {list.length} with location
            </div>
          </div>
          {realtimeOk === false && (
            <span style={st.pollBadge} title="Realtime unavailable — refreshing every 15s">polling</span>
          )}
        </div>

        <div style={st.list}>
          {list.length === 0 && (
            <div style={st.empty}>
              <FleetIcon name="live" size={28} stroke={1.4} />
              <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No locations yet</div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Positions appear here as soon as a driver shares their location from the driver app.
              </div>
            </div>
          )}
          {list.map((p) => {
            const status = statusOf(p, now);
            const active = selected === p.driverId;
            return (
              <button
                key={p.driverId}
                onClick={() => focusDriver(p)}
                className="fleetHover"
                style={{ ...st.row, ...(active ? st.rowActive : {}) }}
              >
                <span style={{ ...st.avatar, background: p.color }}>{p.initials}</span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={st.rowName}>{p.name}</span>
                  <span style={st.rowMeta}>
                    <span style={{ ...st.dot, background: STATUS_COLOR[status] }} />
                    {status === 'live' ? 'Live' : status === 'stale' ? 'Stale' : 'Offline'} · {agoLabel(p.recordedAt, now)}
                    {p.speed != null && status === 'live' ? ` · ${Math.round(Number(p.speed) * 3.6)} km/h` : ''}
                  </span>
                </span>
                <FleetIcon name="chevron-right" size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={st.mapCard}>
        <div ref={mapDivRef} style={st.map} />
      </div>
    </div>
  );
}

const markerCss = `
.trkMarkerWrap { background: transparent; border: none; }
.trkMarker {
  width: 34px; height: 34px; border-radius: 50%;
  background: var(--mk, #2bbd7e); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; font-family: Geist, system-ui, sans-serif;
  border: 2.5px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.trkMarkerLive::after {
  content: ''; position: absolute; inset: -6px; border-radius: 50%;
  border: 2px solid var(--mk, #2bbd7e); opacity: 0.6;
  animation: trkPulse 2s ease-out infinite;
}
@keyframes trkPulse {
  0% { transform: scale(0.8); opacity: 0.6; }
  100% { transform: scale(1.5); opacity: 0; }
}
.leaflet-container { font-family: inherit; }
.leaflet-tooltip { font-size: 12px; line-height: 1.45; }
`;

const st: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    gap: 14,
    alignItems: 'stretch',
    height: 'calc(100vh - var(--topbar-h, 60px) - 110px)',
    minHeight: 420,
  },
  panel: {
    width: 290,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
  },
  panelHead: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--line-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-1)' },
  panelSub: { fontSize: 12, color: 'var(--text-3)', marginTop: 2 },
  pollBadge: {
    fontSize: 10,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--warn, #f5b54a)',
    border: '1px solid var(--line-2)',
    borderRadius: 5,
    padding: '2px 6px',
  },
  list: { flex: 1, overflowY: 'auto', padding: 8 },
  empty: { padding: '36px 18px', textAlign: 'center', color: 'var(--text-3)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: 2,
  },
  rowActive: { background: 'var(--bg-2)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
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
  rowName: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11.5,
    color: 'var(--text-3)',
    marginTop: 2,
  },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  mapCard: {
    flex: 1,
    minWidth: 0,
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
    background: 'var(--bg-1)',
  },
  map: { width: '100%', height: '100%' },
};
