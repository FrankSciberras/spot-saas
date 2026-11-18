'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Map as LeafletMap, Marker, Circle, Polyline } from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import FleetIcon from '@/components/fleet/FleetIcon';
import { useMapStartView } from '@/components/fleet/FleetSettingsProvider';
import { diagnoseNotSharing, diagnoseSilent, type SharingDiagnosis } from '@/lib/tracking/sharing-diagnosis';
import { loadSharingInfo, type SharingInfo } from '@/lib/tracking/sharing-info';
import { loadActivity, type ActivityItem } from '@/lib/tracking/activity';
import {
  GPS_DEVICE_MAP_COLUMNS,
  metersApart,
  toVehicleGpsItem,
  vehicleMotion,
  type GpsDeviceMapRow,
  type VehicleGpsItem,
  type VehicleMotion,
} from '@/lib/gps/live-map-shared';
import 'leaflet/dist/leaflet.css';

export type { VehicleGpsItem } from '@/lib/gps/live-map-shared';

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

export type { ActivityItem } from '@/lib/tracking/activity';

/** A driver with an open shift — they're expected to be sharing. */
export interface OnShiftItem {
  driverId: string;
  name: string;
  startTime: string;
  /** The car this shift is in — links the driver to that car's GPS tracker. */
  vehicleId?: string | null;
  vehiclePlate?: string | null;
}

interface TrackingWorkspaceProps {
  orgId: string;
  canManage: boolean;
  initialPositions: PositionItem[];
  onShift: OnShiftItem[];
  /** App status + last tracking event per on-shift driver — explains "not sharing". */
  initialSharingInfo: SharingInfo;
  /** The fleet's "Live location during shifts" setting — off = no "not sharing" flags. */
  expectSharing: boolean;
  initialZones: ZoneItem[];
  initialActivity: ActivityItem[];
  initialSpeedLimit: number | null;
  /** A GPS platform is connected (lib/gps) — enables the Vehicles layer. */
  gpsConnected: boolean;
  /** Every GPS tracker with a position fix. */
  initialVehicles: VehicleGpsItem[];
  /** Privacy: cars only show while a driver is on shift in them. */
  gpsHideOffShift?: boolean;
}

/** Which marker layers the map shows. Remembered per fleet in this browser. */
interface Layers {
  drivers: boolean;
  vehicles: boolean;
}

/** A driver's phone this close to their shift car = the same place → one marker. */
const MERGE_DISTANCE_M = 300;

const MOTION_COLOR: Record<VehicleMotion, string> = {
  moving: '#2bbd7e',
  idling: '#f5b54a',
  parked: '#64748b',
  'no-signal': '#94a3b8',
};

const MOTION_LABEL: Record<VehicleMotion, string> = {
  moving: 'Moving',
  idling: 'Engine on',
  parked: 'Parked',
  'no-signal': 'No signal',
};

const CAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14v-5l-2-5H7l-2 5v5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6" fill="#fff"/><circle cx="16" cy="17" r="1.6" fill="#fff"/></svg>';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface MapMarker {
  key: string;
  lat: number;
  lng: number;
  html: string;
  /** Leaflet divIcon size + anchor (car pills size themselves via CSS). */
  size: [number, number];
  anchor: [number, number];
  tooltip: string;
  z: number;
  onClick: () => void;
}

const PALETTE = ['#2bbd7e', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];
// No positions yet → the fleet's starting view (Settings → Live Map → Map; Malta by default).
const ZONE_COLOR = '#3b6ad9';

type LiveStatus = 'live' | 'stale' | 'offline';
type Tab = 'drivers' | 'vehicles' | 'zones' | 'activity';

/** Stable avatar colour for a driver who has no position yet. */
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** Sharing but no position for this long → in the "not on the map" box. */
const SILENT_MS = 5 * 60_000;

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
  onShift: initialOnShift,
  initialSharingInfo,
  expectSharing,
  initialZones,
  initialActivity,
  initialSpeedLimit,
  gpsConnected,
  initialVehicles,
  gpsHideOffShift = true,
}: TrackingWorkspaceProps) {
  const supabase = useMemo(() => createClient(), []);
  const startView = useMapStartView();
  const startViewRef = useRef(startView);
  const [positions, setPositions] = useState<Map<string, PositionItem>>(
    () => new Map(initialPositions.map((p) => [p.driverId, p]))
  );
  const [vehicles, setVehicles] = useState<Map<string, VehicleGpsItem>>(
    () => new Map(initialVehicles.map((v) => [v.deviceId, v]))
  );
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehicleRealtimeOk, setVehicleRealtimeOk] = useState<boolean | null>(null);
  // Tickboxes: with no GPS platform connected the map is drivers only.
  const [layers, setLayersState] = useState<Layers>({ drivers: true, vehicles: gpsConnected });
  const layersKey = `rovora.liveMap.layers.${orgId}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(layersKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Layers>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
      setLayersState({ drivers: saved.drivers !== false, vehicles: gpsConnected && saved.vehicles !== false });
    } catch {
      /* private mode / bad JSON — keep the defaults */
    }
  }, [layersKey, gpsConnected]);
  const setLayer = (layer: keyof Layers, on: boolean) => {
    setLayersState((prev) => {
      const next = { ...prev, [layer]: on };
      try {
        window.localStorage.setItem(layersKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  // Plate + model per linked vehicle, so Realtime rows (no join) keep their label.
  const vehicleInfoRef = useRef<globalThis.Map<string, { label: string; model: string | null }>>(
    new globalThis.Map(
      initialVehicles.filter((v) => v.vehicleId).map((v) => [v.vehicleId!, { label: v.label, model: v.model }])
    )
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
      map.setView(startViewRef.current.center, startViewRef.current.zoom);
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

  // GPS trackers: apply a gps_devices row (Realtime or a refetch) to state.
  const applyVehicleRow = useCallback(
    async (row: GpsDeviceMapRow) => {
      let info = row.vehicle_id ? vehicleInfoRef.current.get(row.vehicle_id) : undefined;
      if (row.vehicle_id && !info && !row.vehicles) {
        const { data } = await supabase
          .from('vehicles')
          .select('registration_number, make, model')
          .eq('id', row.vehicle_id)
          .maybeSingle();
        if (data) {
          info = {
            label: data.registration_number || row.name || 'Vehicle',
            model: [data.make, data.model].filter(Boolean).join(' ') || null,
          };
          vehicleInfoRef.current.set(row.vehicle_id, info);
        }
      }
      const item = toVehicleGpsItem(
        row,
        info ? { registration_number: info.label, make: info.model, model: null } : undefined
      );
      if (item?.vehicleId && !info) vehicleInfoRef.current.set(item.vehicleId, { label: item.label, model: item.model });
      setVehicles((prev) => {
        const next = new Map(prev);
        if (item) next.set(item.deviceId, item);
        else next.delete(row.id);
        return next;
      });
    },
    [supabase]
  );

  const refetchVehicles = useCallback(async () => {
    const { data } = await supabase.from('gps_devices').select(GPS_DEVICE_MAP_COLUMNS).eq('organization_id', orgId);
    if (!data) return;
    const next = new Map<string, VehicleGpsItem>();
    for (const r of data as unknown as GpsDeviceMapRow[]) {
      const item = toVehicleGpsItem(r);
      if (!item) continue;
      next.set(item.deviceId, item);
      if (item.vehicleId) vehicleInfoRef.current.set(item.vehicleId, { label: item.label, model: item.model });
    }
    setVehicles(next);
  }, [supabase, orgId]);

  // Realtime: stream tracker moves (the server writes gps_devices ~every minute).
  useEffect(() => {
    if (!gpsConnected) return;
    const channel = supabase
      .channel(`gps-devices-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gps_devices', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) {
              setVehicles((prev) => {
                const next = new Map(prev);
                next.delete(id);
                return next;
              });
            }
            return;
          }
          const row = payload.new as GpsDeviceMapRow | null;
          if (row?.id) void applyVehicleRow(row);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setVehicleRealtimeOk(true);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setVehicleRealtimeOk(false);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, orgId, gpsConnected, applyVehicleRow]);

  // While the map is open, ask the server to pull fresh tracker positions
  // (it skips the call if the scheduler did so moments ago).
  useEffect(() => {
    if (!gpsConnected) return;
    let stopped = false;
    const pull = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await fetch('/api/fleet/gps/refresh', { method: 'POST' });
      } catch {
        /* offline — try again next round */
      }
      if (!stopped && vehicleRealtimeOk !== true) void refetchVehicles();
    };
    void pull();
    const t = setInterval(() => void pull(), 30_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [gpsConnected, vehicleRealtimeOk, refetchVehicles]);

  const refetchActivity = useCallback(async () => {
    setActivity(await loadActivity(supabase, orgId));
  }, [supabase, orgId]);

  const [onShift, setOnShift] = useState<OnShiftItem[]>(initialOnShift);
  const [sharingInfo, setSharingInfo] = useState<SharingInfo>(initialSharingInfo);
  // On-shift drivers who aren't on the map get a one-line reason under their
  // name in the list; tapping it opens the details.
  const [openProblems, setOpenProblems] = useState<Set<string>>(() => new Set());
  const toggleProblem = (driverId: string) =>
    setOpenProblems((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  const refetchOnShift = useCallback(async () => {
    const { data } = await supabase
      .from('driver_shifts')
      .select('driver_id, start_time, vehicle_id, drivers:driver_id (full_name), vehicles:vehicle_id (registration_number)')
      .eq('organization_id', orgId)
      .is('end_time', null)
      .order('start_time', { ascending: true });
    if (!data) return;
    type DriverRel = { full_name: string | null };
    type VehicleRel = { registration_number: string | null };
    type Row = {
      driver_id: string;
      start_time: string;
      vehicle_id: string | null;
      drivers: DriverRel | DriverRel[] | null;
      vehicles: VehicleRel | VehicleRel[] | null;
    };
    const next = (data as unknown as Row[]).map((s) => ({
      driverId: s.driver_id,
      name: (Array.isArray(s.drivers) ? s.drivers[0] : s.drivers)?.full_name || 'Unknown driver',
      startTime: s.start_time,
      vehicleId: s.vehicle_id ?? null,
      vehiclePlate: (Array.isArray(s.vehicles) ? s.vehicles[0] : s.vehicles)?.registration_number ?? null,
    }));
    setOnShift(next);
    // Keep the "why not sharing" reasons current as drivers open the app.
    setSharingInfo(await loadSharingInfo(supabase, orgId, next));
  }, [supabase, orgId]);

  // Polling: clock tick + activity + on-shift refresh + positions fallback if realtime is down.
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
      // Shifts also tell the map which car each driver is in (GPS merge).
      if (expectSharing || gpsConnected) void refetchOnShift();
      if (realtimeOk !== true) void refetchPositions();
    }, 20_000);
    return () => clearInterval(interval);
  }, [supabase, orgId, realtimeOk, refetchActivity, refetchOnShift, expectSharing, gpsConnected]);

  // ── Drivers × vehicles ──────────────────────────────────────────────────
  // The car each on-shift driver is in, when that car has a GPS tracker.
  const trackerByVehicle = useMemo(() => {
    const m = new Map<string, VehicleGpsItem>();
    if (!gpsConnected) return m;
    for (const v of vehicles.values()) if (v.vehicleId) m.set(v.vehicleId, v);
    return m;
  }, [vehicles, gpsConnected]);
  const carOfDriver = useMemo(() => {
    const m = new Map<string, VehicleGpsItem>();
    for (const s of onShift) {
      const car = s.vehicleId ? trackerByVehicle.get(s.vehicleId) : undefined;
      if (car) m.set(s.driverId, car);
    }
    return m;
  }, [onShift, trackerByVehicle]);
  const driverInCar = useMemo(() => {
    const m = new Map<string, OnShiftItem>();
    for (const s of onShift) {
      const car = carOfDriver.get(s.driverId);
      if (car) m.set(car.deviceId, s);
    }
    return m;
  }, [onShift, carOfDriver]);

  // Privacy setting: off-shift cars stay off the map (and out of the Cars list).
  const visibleVehicles = useMemo(
    () => Array.from(vehicles.values()).filter((v) => !gpsHideOffShift || driverInCar.has(v.deviceId)),
    [vehicles, gpsHideOffShift, driverInCar]
  );
  const hiddenVehicleCount = vehicles.size - visibleVehicles.length;

  const driverColor = useCallback(
    (driverId: string) => positions.get(driverId)?.color ?? colorFor(driverId),
    [positions]
  );

  /**
   * What to draw. Drivers come from their phones, vehicles from GPS trackers.
   * With both ticked, a driver whose phone is with their shift car (or whose
   * phone isn't live) is drawn INSIDE the car marker — one marker per person
   * in a car, like the trackers' own apps do. With only Drivers ticked, a
   * driver whose phone has gone quiet is placed at their car's GPS position.
   */
  const { markers, driverMarkerKey } = useMemo(() => {
    const out: MapMarker[] = [];
    const keyOf = new Map<string, string>();

    if (layers.vehicles) {
      for (const v of visibleVehicles) {
        const motion = vehicleMotion(v, now);
        const color = MOTION_COLOR[motion];
        const shift = driverInCar.get(v.deviceId);
        const driverName = shift?.name ?? null;
        const badge = shift
          ? `<span class="trkCarDriver" style="--dc:${driverColor(shift.driverId)}">${escapeHtml(initialsOf(shift.name))}</span>`
          : '';
        const arrow =
          motion === 'moving' && v.heading != null
            ? `<span class="trkCarArrow" style="transform:rotate(${Math.round(v.heading)}deg)"></span>`
            : '';
        const html = `
          <div class="trkCar${motion === 'no-signal' ? ' trkCarQuiet' : ''}${selectedVehicle === v.deviceId ? ' trkCarSel' : ''}" style="--mk:${color}">
            <span class="trkCarIcon">${CAR_SVG}${arrow}</span>
            <span class="trkCarLabel">${escapeHtml(v.label)}</span>${badge}
          </div>`;
        const speed = v.speedKmh != null ? Math.round(v.speedKmh) : null;
        out.push({
          key: `v:${v.deviceId}`,
          lat: v.latitude,
          lng: v.longitude,
          html,
          size: [0, 0],
          anchor: [0, 0],
          z: shift ? 600 : 400,
          tooltip:
            `<strong>${escapeHtml(v.label)}</strong>${v.model ? ` · ${escapeHtml(v.model)}` : ''}` +
            `<br/>${MOTION_LABEL[motion]}${motion === 'moving' && speed != null ? ` · ${speed} km/h` : ''}` +
            (v.ignition != null && motion !== 'moving' ? ` · engine ${v.ignition ? 'on' : 'off'}` : '') +
            `<br/>GPS tracker · ${agoLabel(v.recordedAt, now)}` +
            (driverName ? `<br/>Driver on shift: ${escapeHtml(driverName)}` : ''),
          onClick: () => setSelectedVehicle(v.deviceId),
        });
        if (shift) keyOf.set(shift.driverId, `v:${v.deviceId}`);
      }
    }

    if (layers.drivers) {
      const drawn = new Set<string>();
      for (const p of positions.values()) {
        const car = carOfDriver.get(p.driverId);
        const status = statusOf(p, now);
        const carFresh = !!car && vehicleMotion(car, now) !== 'no-signal';
        // Drawn inside the car marker instead.
        if (layers.vehicles && carFresh && (status !== 'live' || metersApart(p.latitude, p.longitude, car!.latitude, car!.longitude) <= MERGE_DISTANCE_M)) {
          continue;
        }
        // Drivers only, phone quiet, car tracker live → show them at the car.
        const viaCar = !layers.vehicles && carFresh && status !== 'live';
        const lat = viaCar ? car!.latitude : p.latitude;
        const lng = viaCar ? car!.longitude : p.longitude;
        const html = `
          <div class="trkMarker${status === 'live' ? ' trkMarkerLive' : ''}${viaCar ? ' trkMarkerViaCar' : ''}" style="--mk:${p.color};opacity:${status === 'offline' && !viaCar ? 0.45 : 1}">
            <span>${escapeHtml(p.initials)}</span>
          </div>`;
        const speedNow = kmh(p.speed);
        const speedMax = kmh(p.maxSpeedToday);
        out.push({
          key: `d:${p.driverId}`,
          lat,
          lng,
          html,
          size: [34, 34],
          anchor: [17, 17],
          z: 500,
          tooltip: viaCar
            ? `<strong>${escapeHtml(p.name)}</strong><br/>Phone quiet ${agoLabel(p.recordedAt, now)} — shown at ${escapeHtml(car!.label)} (car GPS, ${agoLabel(car!.recordedAt, now)})`
            : `<strong>${escapeHtml(p.name)}</strong><br/>${agoLabel(p.recordedAt, now)}` +
              (speedNow != null && status === 'live' ? `<br/>Speed: ${speedNow} km/h` : '') +
              (speedMax != null ? `<br/>Top today: ${speedMax} km/h` : '') +
              (p.batteryPct != null ? `<br/>Battery: ${p.batteryPct}%${p.batteryCharging ? ' (charging)' : ''}` : ''),
          onClick: () => setSelected(p.driverId),
        });
        keyOf.set(p.driverId, `d:${p.driverId}`);
        drawn.add(p.driverId);
      }
      // On shift, never shared a position, but their car has a tracker.
      if (!layers.vehicles) {
        for (const s of onShift) {
          if (drawn.has(s.driverId) || positions.has(s.driverId)) continue;
          const car = carOfDriver.get(s.driverId);
          if (!car || vehicleMotion(car, now) === 'no-signal') continue;
          out.push({
            key: `d:${s.driverId}`,
            lat: car.latitude,
            lng: car.longitude,
            html: `<div class="trkMarker trkMarkerViaCar" style="--mk:${colorFor(s.driverId)}"><span>${escapeHtml(initialsOf(s.name))}</span></div>`,
            size: [34, 34],
            anchor: [17, 17],
            z: 500,
            tooltip: `<strong>${escapeHtml(s.name)}</strong><br/>Not sharing from the phone — shown at ${escapeHtml(car.label)} (car GPS, ${agoLabel(car.recordedAt, now)})`,
            onClick: () => setSelected(s.driverId),
          });
          keyOf.set(s.driverId, `d:${s.driverId}`);
        }
      }
    }
    return { markers: out, driverMarkerKey: keyOf };
  }, [layers, visibleVehicles, positions, onShift, carOfDriver, driverInCar, driverColor, selectedVehicle, now]);

  // Sync Leaflet markers with `markers`.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const wanted = new Set<string>();
    for (const m of markers) {
      wanted.add(m.key);
      const icon = L.divIcon({
        html: m.html,
        className: m.key.startsWith('v:') ? 'trkCarWrap' : 'trkMarkerWrap',
        iconSize: m.size,
        iconAnchor: m.anchor,
      });
      let marker = markersRef.current.get(m.key);
      if (!marker) {
        marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: m.z }).addTo(map);
        markersRef.current.set(m.key, marker);
      } else {
        marker.setLatLng([m.lat, m.lng]);
        marker.setIcon(icon);
        marker.setZIndexOffset(m.z);
      }
      marker.off('click');
      marker.on('click', m.onClick);
      marker.bindTooltip(m.tooltip, { direction: 'top', offset: m.key.startsWith('v:') ? [0, -14] : [0, -16] });
    }
    for (const [key, marker] of markersRef.current) {
      if (!wanted.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    }
    if (!didFitRef.current && markers.length > 0) {
      didFitRef.current = true;
      const pts = markers.map((m) => [m.lat, m.lng] as [number, number]);
      map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
    }
  }, [markers]);

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

  /** Fly to wherever the driver is drawn (their own marker, or inside their car). */
  const focusDriver = (driverId: string) => {
    setSelected(driverId);
    const key = driverMarkerKey.get(driverId);
    const marker = key ? markersRef.current.get(key) : undefined;
    const p = positions.get(driverId);
    const car = carOfDriver.get(driverId);
    const target =
      marker?.getLatLng() ??
      (p ? { lat: p.latitude, lng: p.longitude } : car ? { lat: car.latitude, lng: car.longitude } : null);
    if (!target || !mapRef.current) return;
    mapRef.current.flyTo([target.lat, target.lng], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
    marker?.openTooltip();
  };

  const focusVehicle = (v: VehicleGpsItem) => {
    setSelectedVehicle(v.deviceId);
    if (!layers.vehicles) setLayer('vehicles', true);
    mapRef.current?.flyTo([v.latitude, v.longitude], Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 });
    // The marker may only exist after the layer switch re-renders.
    setTimeout(() => markersRef.current.get(`v:${v.deviceId}`)?.openTooltip(), 650);
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

  // Same for a GPS tracker: today's trail from gps_device_locations.
  const toggleVehicleRoute = async (v: VehicleGpsItem) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const key = `v:${v.deviceId}`;
    if (routeDriver === key) {
      clearRoute();
      return;
    }
    clearRoute();
    setRouteLoading(true);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('gps_device_locations')
      .select('latitude, longitude')
      .eq('device_id', v.deviceId)
      .gte('recorded_at', startOfDay.toISOString())
      .order('recorded_at', { ascending: true })
      .limit(5000);
    setRouteLoading(false);
    const pts = ((data || []) as { latitude: number; longitude: number }[]).map(
      (r) => [r.latitude, r.longitude] as [number, number]
    );
    if (pts.length < 2) {
      window.alert(`${v.label} hasn’t moved enough today to draw a route yet.`);
      return;
    }
    routeLineRef.current = L.polyline(pts, { color: '#3b6ad9', weight: 4, opacity: 0.85 }).addTo(map);
    routeLineRef.current.bindTooltip(`${v.label} — route today (GPS tracker)`);
    map.fitBounds(routeLineRef.current.getBounds().pad(0.2));
    setRouteDriver(key);
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

  const liveCount = Array.from(positions.values()).filter((p) => statusOf(p, now) === 'live').length;
  // On shift but not sharing: never sent a position, or sharing is switched off.
  // (A sharing driver who went quiet already shows as Stale/Offline in the list.)
  const notSharing = expectSharing ? onShift.filter((d) => !positions.get(d.driverId)?.isTracking) : [];
  // On shift and sharing, but the phone has gone quiet.
  const silent = expectSharing
    ? onShift.filter((d) => {
        const p = positions.get(d.driverId);
        return !!p?.isTracking && now - new Date(p.recordedAt).getTime() >= SILENT_MS;
      })
    : [];
  const problems: { driver: OnShiftItem; why: SharingDiagnosis }[] = [
    ...silent.map((d) => {
      const p = positions.get(d.driverId)!;
      return {
        driver: d,
        why: diagnoseSilent({
          lastPosition: { recordedAt: p.recordedAt, speed: p.speed, batteryPct: p.batteryPct, batteryCharging: p.batteryCharging },
          app: sharingInfo.app[d.driverId],
          now,
        }),
      };
    }),
    ...notSharing.map((d) => {
      const pos = positions.get(d.driverId);
      return {
        driver: d,
        why: diagnoseNotSharing({
          shiftStart: d.startTime,
          app: sharingInfo.app[d.driverId],
          lastTrackingEvent: sharingInfo.lastEvent[d.driverId],
          position: pos ? { recordedAt: pos.recordedAt, gpsEnabled: pos.gpsEnabled, locationPermission: pos.locationPermission } : undefined,
          now,
        }),
      };
    }),
  ];

  // One list: on-shift drivers first (even those who never sent a position),
  // each carrying the reason they're not on the map, then everyone else.
  const whyById = new Map(problems.map((x) => [x.driver.driverId, x.why]));
  const shiftById = new Map(onShift.map((d) => [d.driverId, d]));
  type DriverRow = {
    driverId: string;
    name: string;
    initials: string;
    color: string;
    pos?: PositionItem;
    shift?: OnShiftItem;
    why?: SharingDiagnosis;
  };
  const rows: DriverRow[] = [
    ...Array.from(positions.values()).map((p) => ({
      driverId: p.driverId,
      name: p.name,
      initials: p.initials,
      color: p.color,
      pos: p,
      shift: shiftById.get(p.driverId),
      why: whyById.get(p.driverId),
    })),
    ...onShift
      .filter((d) => !positions.has(d.driverId))
      .map((d) => ({
        driverId: d.driverId,
        name: d.name,
        initials: initialsOf(d.name),
        color: colorFor(d.driverId),
        shift: d,
        why: whyById.get(d.driverId),
      })),
  ];
  const statusRank: Record<LiveStatus, number> = { live: 0, stale: 1, offline: 2 };
  const rowRank = (r: DriverRow) => (r.pos ? statusRank[statusOf(r.pos, now)] : 3);
  rows.sort(
    (a, b) =>
      (a.shift ? 0 : 1) - (b.shift ? 0 : 1) ||
      (a.why ? 1 : 0) - (b.why ? 1 : 0) ||
      rowRank(a) - rowRank(b) ||
      a.name.localeCompare(b.name)
  );
  const onShiftCount = rows.filter((r) => r.shift).length;
  const offShiftCount = rows.length - onShiftCount;

  const activityIcon = (a: ActivityItem) => {
    if (a.kind === 'speed') return '⚠';
    if (a.kind === 'health') return a.event === 'low_battery' || a.event === 'battery_critical' ? '🔋' : '⚠';
    if (a.kind === 'tracking') return a.event === 'started' ? '▶' : a.event === 'lost' ? '⚡' : a.event === 'resumed' ? '↻' : '⏹';
    return a.event === 'enter' ? '⊕' : '⊖';
  };
  const activityColor = (a: ActivityItem) => {
    if (a.kind === 'speed') return 'var(--neg, #f06464)';
    if (a.kind === 'health') return a.event === 'low_battery' ? 'var(--warn, #f5b54a)' : 'var(--neg, #f06464)';
    if (a.kind === 'tracking') {
      if (a.event === 'started' || a.event === 'resumed') return 'var(--pos, #2bbd7e)';
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
      if (a.event === 'lost') return `${a.driverName}'s tracking signal was lost${a.detail ? ` — ${a.detail}` : ''}`;
      if (a.event === 'resumed') return `${a.driverName}'s signal came back${a.detail ? ` ${a.detail}` : ''}`;
      return `${a.driverName} ${a.event === 'started' ? 'started sharing' : 'stopped sharing'}`;
    }
    return `${a.driverName} ${a.event === 'enter' ? 'entered' : 'left'} “${a.zoneName}”`;
  };

  return (
    <div style={st.wrap} className="trkWrap">
      <style>{markerCss}</style>

      <div style={st.panel} className="trkPanel">
        <div style={st.tabs}>
          {((gpsConnected ? ['drivers', 'vehicles', 'zones', 'activity'] : ['drivers', 'zones', 'activity']) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="fleetHover"
              style={{ ...st.tabBtn, ...(tab === t ? st.tabBtnActive : {}) }}
            >
              {t === 'drivers'
                ? `Drivers (${liveCount})`
                : t === 'vehicles'
                  ? `Cars (${visibleVehicles.length})`
                  : t === 'zones'
                    ? `Zones (${zones.length})`
                    : 'Activity'}
            </button>
          ))}
        </div>

        {tab === 'drivers' && (
          <div style={st.list}>
            {realtimeOk === false && (
              <div style={st.pollNote}>Live stream unavailable — refreshing every 20s.</div>
            )}
            {rows.length === 0 && (
              <div style={st.empty}>
                <FleetIcon name="live" size={28} stroke={1.4} />
                <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No locations yet</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {expectSharing
                    ? 'Positions appear here as soon as a driver shares their location from the driver app.'
                    : 'Live location during shifts is turned off in Settings, so drivers only appear here if they share their location manually.'}
                </div>
              </div>
            )}
            {rows.map((r, i) => {
              const p = r.pos;
              const status = p ? statusOf(p, now) : 'offline';
              const active = selected === r.driverId;
              const speedNow = p ? kmh(p.speed) : null;
              const speedMax = p ? kmh(p.maxSpeedToday) : null;
              const km = p?.distanceToday != null && p.distanceToday > 100 ? (p.distanceToday / 1000).toFixed(1) : null;
              const showingRoute = routeDriver === r.driverId;
              // On shift but not showing live → don't call them "Offline"; they're working.
              const shiftNoLocation = !!r.shift && status !== 'live';
              // Their shift car has a live GPS tracker → we still know where they are.
              const car = r.shift ? carOfDriver.get(r.driverId) : undefined;
              const carCovers = shiftNoLocation && !!car && vehicleMotion(car, now) !== 'no-signal';
              const open = openProblems.has(r.driverId);
              const groupLabel =
                onShiftCount > 0 && i === 0
                  ? `On shift (${onShiftCount})`
                  : onShiftCount > 0 && i === onShiftCount && offShiftCount > 0
                    ? `Off shift (${offShiftCount})`
                    : null;
              return (
                <div key={r.driverId} style={{ marginBottom: 2 }}>
                  {groupLabel && <div style={{ ...st.groupLabel, ...(i > 0 ? { marginTop: 10 } : {}) }}>{groupLabel}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => (p || car ? focusDriver(r.driverId) : toggleProblem(r.driverId))}
                    className="fleetHover"
                    style={{ ...st.row, ...(active ? st.rowActive : {}), flex: 1, minWidth: 0, marginBottom: 0 }}
                  >
                    <span style={{ ...st.avatar, background: r.color }}>{r.initials}</span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={st.nameLine}>
                        <span style={{ ...st.rowName, minWidth: 0 }}>{r.name}</span>
                        {r.shift && (
                          <span style={st.shiftPill} title={`Shift started ${agoLabel(r.shift.startTime, now)}`}>
                            <span style={{ ...st.dot, width: 6, height: 6, background: 'var(--pos, #2bbd7e)' }} />
                            On shift
                          </span>
                        )}
                        {r.shift?.vehiclePlate && (
                          <span
                            style={{ ...st.carPill, ...(car ? st.carPillGps : {}) }}
                            title={car ? `${r.shift.vehiclePlate} has a GPS tracker` : `Shift in ${r.shift.vehiclePlate}`}
                          >
                            {r.shift.vehiclePlate}
                          </span>
                        )}
                      </span>
                      <span style={st.rowMeta}>
                        <span
                          style={{
                            ...st.dot,
                            background: shiftNoLocation
                              ? carCovers
                                ? MOTION_COLOR[vehicleMotion(car!, now)]
                                : 'var(--warn, #f5b54a)'
                              : STATUS_COLOR[status],
                          }}
                        />
                        {carCovers
                          ? `${p ? 'Phone quiet' : 'Phone not sharing'} · car GPS ${agoLabel(car!.recordedAt, now)}`
                          : !p
                            ? 'No location yet'
                            : shiftNoLocation
                              ? `Not on map · last seen ${agoLabel(p.recordedAt, now)}`
                              : `${status === 'live' ? (p.speed != null && p.speed < 0.5 ? 'Parked' : 'Live') : status === 'stale' ? 'Stale' : 'Offline'} · ${agoLabel(p.recordedAt, now)}`}
                        {km != null && ` · ${km} km`}
                        {p && p.batteryPct != null && (
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
                        {p && deviceIssue(p) && (
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
                  {p ? (
                    <button
                      className="fleetHover"
                      style={{ ...st.routeBtn, ...(showingRoute ? st.routeBtnActive : {}) }}
                      title={showingRoute ? 'Hide route' : "Show today's route"}
                      onClick={() => void toggleRoute(p)}
                      disabled={routeLoading}
                    >
                      <FleetIcon name="pin" size={14} />
                    </button>
                  ) : (
                    <span style={{ width: 28, flexShrink: 0 }} />
                  )}
                  </div>
                  {r.why && r.shift && (
                    <div style={st.whyBox}>
                      <button type="button" onClick={() => toggleProblem(r.driverId)} style={st.problemLine} aria-expanded={open}>
                        <span style={{ ...st.whyTitle, color: r.why.tone === 'neg' ? 'var(--neg, #f06464)' : 'var(--warn, #a06400)' }}>
                          ⚠ {r.why.title}
                        </span>
                        <FleetIcon name="chevron-right" size={13} stroke={2} style={{ flexShrink: 0, color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : undefined }} />
                      </button>
                      {open && (
                        <>
                          {r.why.detail && <div style={st.whyDetail}>{r.why.detail}</div>}
                          <div style={st.whyFix}>→ {r.why.fix}</div>
                          <div style={st.whyMeta}>
                            Shift started {agoLabel(r.shift.startTime, now)}
                            {r.why.meta ? ` · ${r.why.meta}` : ''}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'vehicles' && (
          <div style={st.list}>
            {vehicleRealtimeOk === false && (
              <div style={st.pollNote}>Live stream unavailable — refreshing every 30s.</div>
            )}
            {!layers.vehicles && visibleVehicles.length > 0 && (
              <button type="button" className="fleetHover" style={st.layerNote} onClick={() => setLayer('vehicles', true)}>
                Cars are hidden on the map — tap to show them
              </button>
            )}
            {hiddenVehicleCount > 0 && (
              <div style={st.privacyNote}>
                {hiddenVehicleCount} car{hiddenVehicleCount === 1 ? '' : 's'} hidden — nobody is on shift in{' '}
                {hiddenVehicleCount === 1 ? 'it' : 'them'} (privacy setting
                {canManage ? (
                  <>
                    {', '}
                    <a href="/fleet/gps#privacy" style={{ color: 'inherit' }}>change</a>
                  </>
                ) : null}
                ).
              </div>
            )}
            {vehicles.size === 0 && (
              <div style={st.empty}>
                <FleetIcon name="vehicle" size={28} stroke={1.4} />
                <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No car positions yet</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  Your GPS platform is connected — trackers appear here as soon as they report their first position.
                  {canManage && (
                    <>
                      {' '}
                      <a href="/fleet/gps" style={{ color: 'var(--accent, #2bbd7e)' }}>Check GPS trackers →</a>
                    </>
                  )}
                </div>
              </div>
            )}
            {visibleVehicles
              .map((v) => ({ v, motion: vehicleMotion(v, now), shift: driverInCar.get(v.deviceId) }))
              .sort(
                (a, b) =>
                  (a.shift ? 0 : 1) - (b.shift ? 0 : 1) ||
                  ['moving', 'idling', 'parked', 'no-signal'].indexOf(a.motion) -
                    ['moving', 'idling', 'parked', 'no-signal'].indexOf(b.motion) ||
                  a.v.label.localeCompare(b.v.label)
              )
              .map(({ v, motion, shift }) => {
                const key = `v:${v.deviceId}`;
                const showingRoute = routeDriver === key;
                const speed = v.speedKmh != null ? Math.round(v.speedKmh) : null;
                return (
                  <div key={v.deviceId} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <button
                      onClick={() => focusVehicle(v)}
                      className="fleetHover"
                      style={{ ...st.row, ...(selectedVehicle === v.deviceId ? st.rowActive : {}), flex: 1, minWidth: 0, marginBottom: 0 }}
                    >
                      <span style={{ ...st.avatar, background: MOTION_COLOR[motion] }}>
                        <FleetIcon name="vehicle" size={16} stroke={1.8} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={st.nameLine}>
                          <span style={{ ...st.rowName, minWidth: 0 }}>{v.label}</span>
                          {shift && (
                            <span style={st.shiftPill} title={`${shift.name} is on shift in this car`}>
                              <span style={{ ...st.dot, width: 6, height: 6, background: 'var(--pos, #2bbd7e)' }} />
                              {shift.name.split(/\s+/)[0]}
                            </span>
                          )}
                        </span>
                        <span style={st.rowMeta}>
                          <span style={{ ...st.dot, background: MOTION_COLOR[motion] }} />
                          {MOTION_LABEL[motion]} · {agoLabel(v.recordedAt, now)}
                          {v.model && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}> · {v.model}</span>}
                          {!v.vehicleId && <span style={{ color: 'var(--warn, #a06400)', whiteSpace: 'nowrap' }}> · not linked</span>}
                        </span>
                      </span>
                      {motion === 'moving' && speed != null && (
                        <span style={st.speedBadge}>
                          <span style={st.speedValue}>{speed}</span>
                          <span style={st.speedUnit}>km/h</span>
                        </span>
                      )}
                    </button>
                    <button
                      className="fleetHover"
                      style={{ ...st.routeBtn, ...(showingRoute ? st.routeBtnActive : {}) }}
                      title={showingRoute ? 'Hide route' : "Show today's route"}
                      onClick={() => void toggleVehicleRoute(v)}
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
        <div style={st.layerBox} className="trkLayerBox">
          <span style={st.layerTitle}>Show</span>
          <label style={st.layerLabel}>
            <input type="checkbox" checked={layers.drivers} onChange={(e) => setLayer('drivers', e.target.checked)} />
            Drivers <span style={st.layerSub}>phones</span>
          </label>
          <label
            style={{ ...st.layerLabel, ...(gpsConnected ? {} : st.layerLabelOff) }}
            title={gpsConnected ? 'Cars from your GPS trackers' : 'Connect your GPS trackers to see cars on the map'}
          >
            <input
              type="checkbox"
              checked={gpsConnected && layers.vehicles}
              disabled={!gpsConnected}
              onChange={(e) => setLayer('vehicles', e.target.checked)}
            />
            Cars <span style={st.layerSub}>GPS</span>
          </label>
          {!gpsConnected &&
            (canManage ? (
              <a href="/fleet/gps" style={st.layerLink}>
                Connect GPS →
              </a>
            ) : (
              <span style={st.layerSub}>No GPS connected</span>
            ))}
        </div>
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
/* Driver shown at their car's GPS position (phone quiet): dashed ring. */
.trkMarkerViaCar { border-style: dashed; }

/* GPS tracker (car) pill: [car icon] PLATE [driver initials]. The divIcon is
   0x0, so the pill centres itself on the point. */
.trkCarWrap { background: transparent; border: none; }
.trkCar {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
  display: flex; align-items: center; gap: 5px;
  padding: 3px 7px 3px 3px; border-radius: 9px;
  background: #1b2230; color: #fff; white-space: nowrap;
  border: 2px solid var(--mk, #64748b);
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  font: 600 11.5px/1 Geist, system-ui, sans-serif; letter-spacing: 0.02em;
  cursor: pointer;
}
.trkCarSel { box-shadow: 0 0 0 3px rgba(59,106,217,0.55), 0 2px 8px rgba(0,0,0,0.35); }
.trkCarQuiet { opacity: 0.55; }
.trkCarIcon {
  position: relative; width: 20px; height: 20px; border-radius: 6px;
  background: var(--mk, #64748b);
  display: flex; align-items: center; justify-content: center;
}
.trkCarIcon svg { width: 14px; height: 14px; }
.trkCarArrow {
  position: absolute; inset: -7px; pointer-events: none;
}
.trkCarArrow::before {
  content: ''; position: absolute; left: 50%; top: -1px; transform: translateX(-50%);
  border-left: 4px solid transparent; border-right: 4px solid transparent;
  border-bottom: 6px solid var(--mk, #2bbd7e);
}
.trkCarDriver {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--dc, #2bbd7e); border: 1.5px solid #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; margin-left: 1px;
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
  groupLabel: {
    padding: '4px 10px 4px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
  },
  nameLine: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  shiftPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    padding: '1px 7px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--pos, #2bbd7e)',
    background: 'var(--accent-soft, rgba(43,189,126,0.15))',
    whiteSpace: 'nowrap',
  },
  carPill: {
    flexShrink: 0,
    padding: '1px 6px',
    borderRadius: 5,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'var(--text-2)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line-2)',
    whiteSpace: 'nowrap',
  },
  carPillGps: { color: '#3b6ad9', borderColor: 'rgba(59,106,217,0.45)' },
  layerNote: {
    display: 'block',
    width: '100%',
    marginBottom: 6,
    padding: '7px 10px',
    border: '1px dashed var(--line-2)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-2)',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  privacyNote: {
    marginBottom: 6,
    padding: '7px 10px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    color: 'var(--text-3)',
    fontSize: 11.5,
    lineHeight: 1.45,
  },
  layerBox: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '7px 12px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 10,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    fontSize: 12.5,
    color: 'var(--text-1)',
  },
  layerTitle: {
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
  },
  layerLabel: { display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' },
  layerLabelOff: { color: 'var(--text-4)', cursor: 'not-allowed' },
  layerSub: { fontSize: 11, fontWeight: 400, color: 'var(--text-4)' },
  layerLink: { fontSize: 12, fontWeight: 500, color: 'var(--accent, #2bbd7e)', textDecoration: 'none', whiteSpace: 'nowrap' },
  whyBox: {
    margin: '0 36px 6px 52px',
    padding: '6px 9px',
    borderRadius: 8,
    background: 'var(--warn-soft, rgba(245, 181, 74, 0.12))',
  },
  problemLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    padding: 0,
    border: 0,
    background: 'none',
    font: 'inherit',
    fontSize: 12.5,
    lineHeight: 1.45,
    textAlign: 'left',
    cursor: 'pointer',
  },
  whyTitle: { fontWeight: 600, fontSize: 12.5 },
  whyDetail: { marginTop: 2, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 },
  whyFix: { marginTop: 3, fontSize: 12, color: 'var(--text-1)', lineHeight: 1.45 },
  whyMeta: { marginTop: 3, fontSize: 11, color: 'var(--text-3)' },
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
