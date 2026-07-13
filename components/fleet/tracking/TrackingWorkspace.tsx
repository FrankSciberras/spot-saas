'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Map as LeafletMap, Marker, Circle, Polyline } from 'leaflet';
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
  maxSpeedToday: number | null;
  distanceToday: number | null;
  isTracking: boolean;
  recordedAt: string;
  batteryPct: number | null;
  batteryCharging: boolean | null;
  gpsEnabled: boolean | null;
  locationPermission: string | null;
}

export interface ZoneItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  notifyOn: 'enter' | 'exit' | 'both';
  active: boolean;
}

export interface ActivityItem {
  id: string;
  kind: 'tracking' | 'zone' | 'speed' | 'health';
  event: string;
  driverName: string;
  zoneName: string | null;
  detail: string | null;
  occurredAt: string;
}

interface TrackingWorkspaceProps {
  orgId: string;
  canManage: boolean;
  initialPositions: PositionItem[];
  initialZones: ZoneItem[];
  initialActivity: ActivityItem[];
  initialSpeedLimit: number | null;
}

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];
// No positions yet → default view (Malta).
const FALLBACK_CENTER: [number, number] = [35.9, 14.42];
const ZONE_COLOR = '#3b6ad9';

type LiveStatus = 'live' | 'stale' | 'offline';
type Tab = 'drivers' | 'zones' | 'activity';

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

function kmh(speedMs: number | null): number | null {
  return speedMs != null ? Math.round(Number(speedMs) * 3.6) : null;
}

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function radiusLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`;
}

function batteryColor(p: PositionItem): string {
  if (p.batteryCharging) return 'var(--text-3)';
  if (p.batteryPct != null && p.batteryPct <= 10) return 'var(--neg, #f06464)';
  if (p.batteryPct != null && p.batteryPct <= 20) return 'var(--warn, #f5b54a)';
  return 'var(--text-3)';
}

function deviceIssue(p: PositionItem): string | null {
  if (p.gpsEnabled === false) return 'GPS off';
  if (p.locationPermission === 'denied') return 'No location access';
  if (p.locationPermission === 'foreground_only') return 'Limited location';
  return null;
}

const STATUS_COLOR: Record<LiveStatus, string> = {
  live: 'var(--pos, #2bbd7e)',
  stale: 'var(--warn, #f5b54a)',
  offline: 'var(--text-4, #777)',
};

interface ZoneDraft {
  latitude: number;
  longitude: number;
  name: string;
  radiusM: number;
  notifyOn: 'enter' | 'exit' | 'both';
}

export default function TrackingWorkspace({
  orgId,
  canManage,
  initialPositions,
  initialZones,
  initialActivity,
  initialSpeedLimit,
}: TrackingWorkspaceProps) {
  const supabase = useMemo(() => createClient(), []);
  const [positions, setPositions] = useState<Map<string, PositionItem>>(
    () => new Map(initialPositions.map((p) => [p.driverId, p]))
  );
  const [zones, setZones] = useState<ZoneItem[]>(initialZones);
  const [activity, setActivity] = useState<ActivityItem[]>(initialActivity);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>('drivers');
  const [selected, setSelected] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState<boolean | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoneError, setZoneError] = useState('');
  const [routeDriver, setRouteDriver] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [speedLimitInput, setSpeedLimitInput] = useState(initialSpeedLimit != null ? String(initialSpeedLimit) : '');
  const [speedLimitSaved, setSpeedLimitSaved] = useState(false);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const circlesRef = useRef<globalThis.Map<string, Circle>>(new globalThis.Map());
  const draftCircleRef = useRef<Circle | null>(null);
  const routeLineRef = useRef<Polyline | null>(null);
  const pickingRef = useRef(false);
  const namesRef = useRef<globalThis.Map<string, string>>(
    new globalThis.Map(initialPositions.map((p) => [p.driverId, p.name]))
  );
  const colorIdxRef = useRef(initialPositions.length);
  const didFitRef = useRef(false);

  pickingRef.current = picking;

  // Init Leaflet map (client-only, so import dynamically inside the effect).
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
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
      map.on('click', (e: any) => {
        if (!pickingRef.current) return;
        setDraft((d) => ({
          latitude: e.latlng.lat,
          longitude: e.latlng.lng,
          name: d?.name || '',
          radiusM: d?.radiusM || 500,
          notifyOn: d?.notifyOn || 'enter',
        }));
        setPicking(false);
      });
      mapRef.current = map;
      // Leaflet only reads the container size once — keep tiles filling the
      // card when the responsive layout (mobile stack / rotation) resizes it.
      if (typeof ResizeObserver !== 'undefined' && mapDivRef.current) {
        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.invalidateSize();
        });
        resizeObserver.observe(mapDivRef.current);
      }
      setNow(Date.now()); // trigger marker sync now that the map exists
    })();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
      circlesRef.current.clear();
      draftCircleRef.current = null;
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
            const speed = (row.speed as number) ?? null;
            const speedKmhNow = speed != null ? Number(speed) * 3.6 : null;
            const prevMax = existing?.maxSpeedToday ?? null;
            next.set(driverId, {
              driverId,
              name: name!,
              initials: initialsOf(name!),
              color: existing?.color || PALETTE[colorIdxRef.current++ % PALETTE.length],
              latitude: row.latitude as number,
              longitude: row.longitude as number,
              accuracy: (row.accuracy as number) ?? null,
              heading: (row.heading as number) ?? null,
              speed,
              maxSpeedToday:
                speed != null && (prevMax == null || Number(speed) > prevMax) ? Number(speed) : prevMax,
              distanceToday: existing?.distanceToday ?? null,
              isTracking: !!row.is_tracking,
              recordedAt: (row.recorded_at as string) || new Date().toISOString(),
              batteryPct: (row.battery_pct as number) ?? null,
              batteryCharging: (row.battery_charging as boolean) ?? null,
              gpsEnabled: (row.gps_enabled as boolean) ?? null,
              locationPermission: (row.location_permission as string) ?? null,
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

  const refetchActivity = useCallback(async () => {
    const [trackingRes, zoneRes, speedRes, healthRes] = await Promise.all([
      supabase
        .from('driver_tracking_events')
        .select('id, event, occurred_at, drivers:driver_id (full_name)')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(30),
      supabase
        .from('geofence_events')
        .select('id, event, occurred_at, drivers:driver_id (full_name), geofences:geofence_id (name)')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(30),
      supabase
        .from('speeding_events')
        .select('id, speed_kmh, limit_kmh, occurred_at, drivers:driver_id (full_name)')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(20),
      supabase
        .from('device_health_events')
        .select('id, event, detail, occurred_at, drivers:driver_id (full_name)')
        .eq('organization_id', orgId)
        .order('occurred_at', { ascending: false })
        .limit(20),
    ]);
    const nameOf = (rel: any) => (Array.isArray(rel) ? rel[0] : rel)?.full_name || 'Unknown driver';
    const zoneNameOf = (rel: any) => (Array.isArray(rel) ? rel[0] : rel)?.name || 'zone';
    const merged: ActivityItem[] = [
      ...((trackingRes.data || []) as any[]).map((e) => ({
        id: `t-${e.id}`,
        kind: 'tracking' as const,
        event: e.event as string,
        driverName: nameOf(e.drivers),
        zoneName: null,
        detail: null,
        occurredAt: e.occurred_at as string,
      })),
      ...((zoneRes.data || []) as any[]).map((e) => ({
        id: `z-${e.id}`,
        kind: 'zone' as const,
        event: e.event as string,
        driverName: nameOf(e.drivers),
        zoneName: zoneNameOf(e.geofences),
        detail: null,
        occurredAt: e.occurred_at as string,
      })),
      ...((speedRes.data || []) as any[]).map((e) => ({
        id: `s-${e.id}`,
        kind: 'speed' as const,
        event: 'speeding',
        driverName: nameOf(e.drivers),
        zoneName: null,
        detail: `${e.speed_kmh} km/h (limit ${e.limit_kmh})`,
        occurredAt: e.occurred_at as string,
      })),
      ...((healthRes.data || []) as any[]).map((e) => ({
        id: `h-${e.id}`,
        kind: 'health' as const,
        event: e.event as string,
        driverName: nameOf(e.drivers),
        zoneName: null,
        detail: (e.detail as string) ?? null,
        occurredAt: e.occurred_at as string,
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 40);
    setActivity(merged);
  }, [supabase, orgId]);

  // Polling: clock tick + activity refresh + positions fallback if realtime is down.
  useEffect(() => {
    const refetchPositions = async () => {
      const { data } = await supabase
        .from('driver_positions')
        .select('driver_id, latitude, longitude, accuracy, heading, speed, is_tracking, recorded_at, battery_pct, battery_charging, gps_enabled, location_permission, drivers:driver_id (full_name)')
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
            maxSpeedToday: existing?.maxSpeedToday ?? null,
            distanceToday: existing?.distanceToday ?? null,
            isTracking: !!r.is_tracking,
            recordedAt: r.recorded_at,
            batteryPct: r.battery_pct ?? null,
            batteryCharging: r.battery_charging ?? null,
            gpsEnabled: r.gps_enabled ?? null,
            locationPermission: r.location_permission ?? null,
          });
        }
        return next;
      });
    };
    const interval = setInterval(() => {
      setNow(Date.now());
      void refetchActivity();
      if (realtimeOk !== true) void refetchPositions();
    }, 20_000);
    return () => clearInterval(interval);
  }, [supabase, orgId, realtimeOk, refetchActivity]);

  // Sync driver markers with state.
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
      const speedNow = kmh(p.speed);
      const speedMax = kmh(p.maxSpeedToday);
      marker.bindTooltip(
        `<strong>${p.name}</strong><br/>${agoLabel(p.recordedAt, now)}` +
          (speedNow != null && status === 'live' ? `<br/>Speed: ${speedNow} km/h` : '') +
          (speedMax != null ? `<br/>Top today: ${speedMax} km/h` : '') +
          (p.batteryPct != null ? `<br/>Battery: ${p.batteryPct}%${p.batteryCharging ? ' (charging)' : ''}` : ''),
        { direction: 'top', offset: [0, -16] }
      );
    }
    for (const [id, marker] of markersRef.current) {
      if (!positions.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    if (!didFitRef.current && positions.size > 0) {
      didFitRef.current = true;
      const pts = Array.from(positions.values()).map((p) => [p.latitude, p.longitude] as [number, number]);
      map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
    }
  }, [positions, now]);

  // Sync zone circles with state.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    for (const z of zones) {
      let circle = circlesRef.current.get(z.id);
      if (!circle) {
        circle = L.circle([z.latitude, z.longitude], {
          radius: z.radiusM,
          color: ZONE_COLOR,
          weight: 1.5,
          fillColor: ZONE_COLOR,
          fillOpacity: z.active ? 0.12 : 0.04,
          opacity: z.active ? 0.8 : 0.3,
        }).addTo(map);
        circlesRef.current.set(z.id, circle);
      } else {
        circle.setLatLng([z.latitude, z.longitude]);
        circle.setRadius(z.radiusM);
        circle.setStyle({ fillOpacity: z.active ? 0.12 : 0.04, opacity: z.active ? 0.8 : 0.3 });
      }
      circle.bindTooltip(`${z.name} · ${radiusLabel(z.radiusM)}`);
    }
    for (const [id, circle] of circlesRef.current) {
      if (!zones.some((z) => z.id === id)) {
        circle.remove();
        circlesRef.current.delete(id);
      }
    }
  }, [zones]);

  // Draft zone preview circle.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!draft) {
      draftCircleRef.current?.remove();
      draftCircleRef.current = null;
      return;
    }
    if (!draftCircleRef.current) {
      draftCircleRef.current = L.circle([draft.latitude, draft.longitude], {
        radius: draft.radiusM,
        color: 'var(--accent, #2bbd7e)',
        dashArray: '6 6',
        weight: 2,
        fillColor: '#2bbd7e',
        fillOpacity: 0.1,
      }).addTo(map);
    } else {
      draftCircleRef.current.setLatLng([draft.latitude, draft.longitude]);
      draftCircleRef.current.setRadius(draft.radiusM);
    }
  }, [draft]);

  const focusDriver = (p: PositionItem) => {
    setSelected(p.driverId);
    mapRef.current?.flyTo([p.latitude, p.longitude], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
    markersRef.current.get(p.driverId)?.openTooltip();
  };

  const focusZone = (z: ZoneItem) => {
    mapRef.current?.flyTo([z.latitude, z.longitude], 13, { duration: 0.6 });
  };

  // Route playback: draw today's GPS trail for one driver.
  const clearRoute = useCallback(() => {
    routeLineRef.current?.remove();
    routeLineRef.current = null;
    setRouteDriver(null);
  }, []);

  const toggleRoute = async (p: PositionItem) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (routeDriver === p.driverId) {
      clearRoute();
      return;
    }
    clearRoute();
    setRouteLoading(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase.rpc('driver_route', {
      p_driver: p.driverId,
      p_since: startOfDay.toISOString(),
    });
    setRouteLoading(false);
    const pts = ((data || []) as any[]).map((r) => [r.latitude, r.longitude] as [number, number]);
    if (pts.length < 2) {
      setRouteDriver(null);
      window.alert('Not enough GPS points recorded today to draw a route for this driver.');
      return;
    }
    routeLineRef.current = L.polyline(pts, {
      color: p.color,
      weight: 4,
      opacity: 0.85,
    }).addTo(map);
    routeLineRef.current.bindTooltip(`${p.name} — route today (${pts.length} points)`);
    map.fitBounds(routeLineRef.current.getBounds().pad(0.2));
    setRouteDriver(p.driverId);
  };

  const saveSpeedLimit = async () => {
    const value = speedLimitInput.trim() === '' ? null : Number(speedLimitInput);
    if (value !== null && (!Number.isFinite(value) || value < 10 || value > 250)) {
      setZoneError('Speed limit must be between 10 and 250 km/h (or empty to disable).');
      return;
    }
    setZoneError('');
    const { error } = await supabase
      .from('organizations')
      .update({ speed_limit_kmh: value })
      .eq('id', orgId);
    if (error) {
      setZoneError(`Could not save speed limit: ${error.message}`);
      return;
    }
    setSpeedLimitSaved(true);
    setTimeout(() => setSpeedLimitSaved(false), 2000);
  };

  const refetchZones = useCallback(async () => {
    const { data } = await supabase
      .from('geofences')
      .select('id, name, latitude, longitude, radius_m, notify_on, active')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });
    if (data) {
      setZones(
        (data as any[]).map((z) => ({
          id: z.id,
          name: z.name,
          latitude: z.latitude,
          longitude: z.longitude,
          radiusM: z.radius_m,
          notifyOn: z.notify_on,
          active: z.active,
        }))
      );
    }
  }, [supabase, orgId]);

  const saveZone = async () => {
    if (!draft || !draft.name.trim()) {
      setZoneError('Give the zone a name.');
      return;
    }
    setSaving(true);
    setZoneError('');
    const { error } = await supabase.from('geofences').insert({
      organization_id: orgId,
      name: draft.name.trim(),
      latitude: draft.latitude,
      longitude: draft.longitude,
      radius_m: draft.radiusM,
      notify_on: draft.notifyOn,
    });
    setSaving(false);
    if (error) {
      setZoneError(`Could not save: ${error.message}`);
      return;
    }
    setDraft(null);
    await refetchZones();
  };

  const toggleZone = async (z: ZoneItem) => {
    await supabase.from('geofences').update({ active: !z.active }).eq('id', z.id);
    await refetchZones();
  };

  const deleteZone = async (z: ZoneItem) => {
    if (!window.confirm(`Delete zone "${z.name}"? Its event history is removed too.`)) return;
    await supabase.from('geofences').delete().eq('id', z.id);
    await refetchZones();
  };

  const list = Array.from(positions.values()).sort((a, b) => {
    const rank: Record<LiveStatus, number> = { live: 0, stale: 1, offline: 2 };
    const sa = statusOf(a, now);
    const sb = statusOf(b, now);
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    return a.name.localeCompare(b.name);
  });
  const liveCount = list.filter((p) => statusOf(p, now) === 'live').length;

  const activityIcon = (a: ActivityItem) => {
    if (a.kind === 'speed') return '⚠';
    if (a.kind === 'health') return a.event === 'low_battery' || a.event === 'battery_critical' ? '🔋' : '⚠';
    if (a.kind === 'tracking') return a.event === 'started' ? '▶' : a.event === 'lost' ? '⚡' : '⏹';
    return a.event === 'enter' ? '⊕' : '⊖';
  };
  const activityColor = (a: ActivityItem) => {
    if (a.kind === 'speed') return 'var(--neg, #f06464)';
    if (a.kind === 'health') return a.event === 'low_battery' ? 'var(--warn, #f5b54a)' : 'var(--neg, #f06464)';
    if (a.kind === 'tracking') {
      if (a.event === 'started') return 'var(--pos, #2bbd7e)';
      if (a.event === 'lost') return 'var(--neg, #f06464)';
      return 'var(--text-3)';
    }
    return 'var(--warn, #f5b54a)';
  };
  const activityText = (a: ActivityItem) => {
    if (a.kind === 'speed') return `${a.driverName} was speeding — ${a.detail}`;
    if (a.kind === 'health') {
      if (a.event === 'low_battery') return `${a.driverName}'s phone battery is low${a.detail ? ` (${a.detail})` : ''}`;
      if (a.event === 'battery_critical') return `${a.driverName}'s phone battery is critical${a.detail ? ` (${a.detail})` : ''}`;
      if (a.event === 'gps_off') return `${a.driverName} turned location services off`;
      return a.detail === 'denied'
        ? `${a.driverName} removed the app's location access`
        : `${a.driverName} limited location to “while using the app”`;
    }
    if (a.kind === 'tracking') {
      if (a.event === 'lost') return `${a.driverName}'s tracking signal was lost`;
      return `${a.driverName} ${a.event === 'started' ? 'started sharing' : 'stopped sharing'}`;
    }
    return `${a.driverName} ${a.event === 'enter' ? 'entered' : 'left'} “${a.zoneName}”`;
  };

  return (
    <div style={st.wrap} className="trkWrap">
      <style>{markerCss}</style>

      <div style={st.panel} className="trkPanel">
        <div style={st.tabs}>
          {(['drivers', 'zones', 'activity'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="fleetHover"
              style={{ ...st.tabBtn, ...(tab === t ? st.tabBtnActive : {}) }}
            >
              {t === 'drivers' ? `Drivers (${liveCount})` : t === 'zones' ? `Zones (${zones.length})` : 'Activity'}
            </button>
          ))}
        </div>

        {tab === 'drivers' && (
          <div style={st.list}>
            {realtimeOk === false && (
              <div style={st.pollNote}>Live stream unavailable — refreshing every 20s.</div>
            )}
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
              const speedNow = kmh(p.speed);
              const speedMax = kmh(p.maxSpeedToday);
              const km = p.distanceToday != null && p.distanceToday > 100 ? (p.distanceToday / 1000).toFixed(1) : null;
              const showingRoute = routeDriver === p.driverId;
              return (
                <div key={p.driverId} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <button
                    onClick={() => focusDriver(p)}
                    className="fleetHover"
                    style={{ ...st.row, ...(active ? st.rowActive : {}), flex: 1, minWidth: 0, marginBottom: 0 }}
                  >
                    <span style={{ ...st.avatar, background: p.color }}>{p.initials}</span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={st.rowName}>{p.name}</span>
                      <span style={st.rowMeta}>
                        <span style={{ ...st.dot, background: STATUS_COLOR[status] }} />
                        {status === 'live' ? 'Live' : status === 'stale' ? 'Stale' : 'Offline'} · {agoLabel(p.recordedAt, now)}
                        {km != null && ` · ${km} km`}
                        {p.batteryPct != null && (
                          <span
                            style={{
                              color: batteryColor(p),
                              fontWeight: !p.batteryCharging && p.batteryPct <= 20 ? 600 : 400,
                              whiteSpace: 'nowrap',
                            }}
                            title={`Battery ${p.batteryPct}%${p.batteryCharging ? ' — charging' : ''}`}
                          >
                            · {p.batteryPct}%{p.batteryCharging ? '⚡' : ''}
                          </span>
                        )}
                        {deviceIssue(p) && (
                          <span style={{ color: 'var(--neg, #f06464)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            · {deviceIssue(p)}
                          </span>
                        )}
                      </span>
                    </span>
                    {status === 'live' && speedNow != null && (
                      <span style={st.speedBadge} title={speedMax != null ? `Top speed today: ${speedMax} km/h` : undefined}>
                        <span style={st.speedValue}>{speedNow}</span>
                        <span style={st.speedUnit}>km/h</span>
                        {speedMax != null && <span style={st.speedMax}>↑{speedMax}</span>}
                      </span>
                    )}
                  </button>
                  <button
                    className="fleetHover"
                    style={{ ...st.routeBtn, ...(showingRoute ? st.routeBtnActive : {}) }}
                    title={showingRoute ? 'Hide route' : "Show today's route"}
                    onClick={() => void toggleRoute(p)}
                    disabled={routeLoading}
                  >
                    <FleetIcon name="pin" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'zones' && (
          <div style={st.list}>
            {canManage && !draft && (
              <button
                className="fleetHover"
                style={{ ...st.primaryBtn, ...(picking ? st.primaryBtnActive : {}) }}
                onClick={() => setPicking((v) => !v)}
              >
                {picking ? 'Click the map to place the zone…' : '+ New zone'}
              </button>
            )}

            {draft && (
              <div style={st.zoneForm}>
                <div style={st.zoneFormTitle}>New zone</div>
                <input
                  style={st.input}
                  placeholder="Zone name (e.g. Airport)"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  autoFocus
                />
                <label style={st.sliderLabel}>
                  Radius: <strong>{radiusLabel(draft.radiusM)}</strong>
                  <input
                    type="range"
                    min={100}
                    max={10000}
                    step={100}
                    value={draft.radiusM}
                    onChange={(e) => setDraft({ ...draft, radiusM: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                </label>
                <select
                  style={st.input}
                  value={draft.notifyOn}
                  onChange={(e) => setDraft({ ...draft, notifyOn: e.target.value as ZoneDraft['notifyOn'] })}
                >
                  <option value="enter">Notify when a driver enters</option>
                  <option value="exit">Notify when a driver leaves</option>
                  <option value="both">Notify on enter and leave</option>
                </select>
                {zoneError && <div style={st.formError}>{zoneError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="fleetHover" style={{ ...st.primaryBtn, flex: 1, marginBottom: 0 }} onClick={saveZone} disabled={saving}>
                    {saving ? 'Saving…' : 'Save zone'}
                  </button>
                  <button className="fleetHover" style={st.ghostBtn} onClick={() => { setDraft(null); setZoneError(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {zones.length === 0 && !draft && (
              <div style={st.empty}>
                <FleetIcon name="pin" size={28} stroke={1.4} />
                <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No zones yet</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {canManage
                    ? 'Create a zone around a place you care about — you’ll get a notification when a driver enters it.'
                    : 'Zones created by an admin appear here and on the map.'}
                </div>
              </div>
            )}

            {canManage && !draft && (
              <div style={st.zoneForm}>
                <div style={st.zoneFormTitle}>Speed alerts</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...st.input, width: 90 }}
                    type="number"
                    min={10}
                    max={250}
                    placeholder="off"
                    value={speedLimitInput}
                    onChange={(e) => setSpeedLimitInput(e.target.value)}
                  />
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1 }}>km/h limit</span>
                  <button className="fleetHover" style={{ ...st.ghostBtn, padding: '8px 12px' }} onClick={saveSpeedLimit}>
                    {speedLimitSaved ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.45 }}>
                  Alerts when any driver exceeds this speed (max one per driver per 10 min). Leave empty to disable.
                </div>
                {zoneError && <div style={st.formError}>{zoneError}</div>}
              </div>
            )}

            {zones.map((z) => (
              <div key={z.id} style={st.zoneRow}>
                <button className="fleetHover" style={st.zoneMain} onClick={() => focusZone(z)}>
                  <span style={{ ...st.zoneDot, opacity: z.active ? 1 : 0.3 }} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={st.rowName}>{z.name}</span>
                    <span style={st.rowMeta}>
                      {radiusLabel(z.radiusM)} · alerts on {z.notifyOn === 'both' ? 'enter & leave' : z.notifyOn === 'enter' ? 'enter' : 'leave'}
                      {!z.active && ' · paused'}
                    </span>
                  </span>
                </button>
                {canManage && (
                  <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      className="fleetHover"
                      style={st.zoneAction}
                      title={z.active ? 'Pause alerts' : 'Resume alerts'}
                      onClick={() => toggleZone(z)}
                    >
                      <FleetIcon name={z.active ? 'moon' : 'sun'} size={14} />
                    </button>
                    <button className="fleetHover" style={st.zoneAction} title="Delete zone" onClick={() => deleteZone(z)}>
                      <FleetIcon name="close" size={14} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'activity' && (
          <div style={st.list}>
            {activity.length === 0 && (
              <div style={st.empty}>
                <FleetIcon name="audit" size={28} stroke={1.4} />
                <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No activity yet</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  When drivers start or stop sharing, or enter a zone, it shows up here.
                </div>
              </div>
            )}
            {activity.map((a) => (
              <div key={a.id} style={st.activityRow}>
                <span style={{ ...st.activityIcon, color: activityColor(a) }}>{activityIcon(a)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...st.activityText, ...(a.kind === 'speed' || a.kind === 'health' || a.event === 'lost' ? { fontWeight: 600 } : {}) }}>
                    {activityText(a)}
                  </span>
                  <span style={st.activityTime}>
                    {agoLabel(a.occurredAt, now)} · {new Date(a.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={st.mapCard} className="trkMapCard">
        <div ref={mapDivRef} style={st.map} />
        {picking && <div style={st.mapHint}>Click anywhere on the map to place the zone centre</div>}
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

/* Mobile: stack map (hero, on top) above the panel instead of a side-by-side
   split that squeezed the map into a sliver. Inline styles need !important. */
@media (max-width: 860px) {
  .trkWrap {
    flex-direction: column-reverse !important;
    height: auto !important;
    min-height: 0 !important;
  }
  .trkMapCard {
    flex: none !important;
    width: 100% !important;
    height: 46vh !important;
    min-height: 300px !important;
  }
  .trkPanel {
    width: 100% !important;
    flex-shrink: 1 !important;
    max-height: 48vh !important;
  }
}
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
    width: 310,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--line-1)',
    padding: '8px 8px 0',
    gap: 2,
  },
  tabBtn: {
    flex: 1,
    padding: '9px 4px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--text-3)',
    fontSize: 12.5,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabBtnActive: { color: 'var(--text-1)', borderBottomColor: 'var(--accent, #2bbd7e)' },
  list: { flex: 1, overflowY: 'auto', padding: 8 },
  pollNote: {
    fontSize: 11.5,
    color: 'var(--warn, #f5b54a)',
    padding: '6px 10px',
    marginBottom: 4,
  },
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
  speedBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    flexShrink: 0,
    lineHeight: 1.1,
  },
  speedValue: { fontSize: 15, fontWeight: 600, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' },
  speedUnit: { fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.04em' },
  speedMax: { fontSize: 10, color: 'var(--text-3)', marginTop: 2 },
  primaryBtn: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--accent, #2bbd7e)',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    marginBottom: 8,
  },
  primaryBtnActive: { background: 'var(--warn, #f5b54a)' },
  ghostBtn: {
    padding: '10px 12px',
    background: 'transparent',
    color: 'var(--text-2)',
    border: '1px solid var(--line-2)',
    borderRadius: 9,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  zoneForm: {
    background: 'var(--bg-2)',
    border: '1px solid var(--line-1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  zoneFormTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    width: '100%',
    padding: '9px 10px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-1)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  sliderLabel: { fontSize: 12.5, color: 'var(--text-2)' },
  formError: { fontSize: 12, color: 'var(--neg, #f06464)' },
  zoneRow: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 },
  zoneMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  zoneDot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: `2px solid ${'#3b6ad9'}`,
    background: 'rgba(59,106,217,0.25)',
    flexShrink: 0,
  },
  routeBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--line-1)',
    borderRadius: 7,
    color: 'var(--text-3)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  routeBtnActive: {
    background: 'var(--accent-soft, rgba(43,189,126,0.15))',
    borderColor: 'var(--accent, #2bbd7e)',
    color: 'var(--accent, #2bbd7e)',
  },
  zoneAction: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text-3)',
    cursor: 'pointer',
  },
  activityRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
  },
  activityIcon: { fontSize: 14, lineHeight: '18px', flexShrink: 0, width: 18, textAlign: 'center' },
  activityText: { display: 'block', fontSize: 12.5, color: 'var(--text-1)', lineHeight: 1.4 },
  activityTime: { display: 'block', fontSize: 11, color: 'var(--text-4)', marginTop: 2 },
  mapCard: {
    flex: 1,
    minWidth: 0,
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
    background: 'var(--bg-1)',
    position: 'relative',
  },
  map: { width: '100%', height: '100%' },
  mapHint: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 12.5,
    color: 'var(--text-1)',
    zIndex: 1000,
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  },
};
