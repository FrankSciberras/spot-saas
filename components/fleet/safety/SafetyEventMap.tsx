'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapEvent {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Plain text, shown on hover. */
  tooltip: string;
}

interface Props {
  events: MapEvent[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Coarse GPS history around the selected event (one point a minute). */
  route?: [number, number][];
  /** Precise points the driver app captured around the event. */
  trail?: [number, number][];
  height?: number;
}

const FALLBACK_CENTER: [number, number] = [35.9, 14.45];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Leaflet map of safety events — used for the fleet-wide "where events
 * happen" map and the per-driver event view. Leaflet is imported inside the
 * effect because it touches `window` at import time.
 */
export default function SafetyEventMap({ events, selectedId, onSelect, route, trail, height = 340 }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const pinsRef = useRef<LayerGroup | null>(null);
  const linesRef = useRef<LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const eventsRef = useRef(events);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    eventsRef.current = events;
  });

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !divRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(divRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.setView(FALLBACK_CENTER, 11);
      linesRef.current = L.layerGroup().addTo(map);
      pinsRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      if (typeof ResizeObserver !== 'undefined' && divRef.current) {
        observer = new ResizeObserver(() => mapRef.current?.invalidateSize());
        observer.observe(divRef.current);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      pinsRef.current = null;
      linesRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Pins
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const pins = pinsRef.current;
    if (!ready || !L || !map || !pins) return;
    pins.clearLayers();
    const ordered = [...events].sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
    for (const e of ordered) {
      const selected = e.id === selectedId;
      L.circleMarker([e.lat, e.lng], {
        radius: selected ? 10 : 6.5,
        color: selected ? '#ffffff' : e.color,
        weight: selected ? 3 : 1.5,
        fillColor: e.color,
        fillOpacity: selected ? 1 : 0.8,
      })
        .bindTooltip(escapeHtml(e.tooltip).replace(/\n/g, '<br>'), { direction: 'top', offset: [0, -6] })
        .on('click', () => onSelectRef.current?.(e.id))
        .addTo(pins);
    }
    if (!fittedRef.current && events.length > 0) {
      fittedRef.current = true;
      if (events.length === 1) map.setView([events[0].lat, events[0].lng], 15);
      else map.fitBounds(L.latLngBounds(events.map((e) => [e.lat, e.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
    }
  }, [ready, events, selectedId]);

  // Route + trail around the selected event, and zoom to it.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const lines = linesRef.current;
    if (!ready || !L || !map || !lines) return;
    lines.clearLayers();
    if (route && route.length > 1) {
      L.polyline(route, { color: '#64748b', weight: 4, opacity: 0.7, dashArray: '6 6' }).addTo(lines);
    }
    if (trail && trail.length > 1) {
      L.polyline(trail, { color: '#2bbd7e', weight: 5, opacity: 0.9 }).addTo(lines);
    }
    const selected = eventsRef.current.find((e) => e.id === selectedId);
    if (selected) {
      const pts: [number, number][] = [[selected.lat, selected.lng], ...(trail || [])];
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 17 });
      else map.setView([selected.lat, selected.lng], 16);
    }
    // Only re-zoom when the selection or its lines change, not when pins
    // refresh (e.g. place names arriving) — keeps the user's panning.
  }, [ready, route, trail, selectedId]);

  return (
    <div
      ref={divRef}
      style={{
        height,
        width: '100%',
        borderRadius: 'var(--radius-lg, 14px)',
        overflow: 'hidden',
        border: '1px solid var(--line-1)',
        background: 'var(--bg-2)',
        zIndex: 0,
      }}
    />
  );
}
