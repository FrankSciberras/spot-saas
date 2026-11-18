'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSettingsAdmin } from '@/components/fleet/FleetSettingsProvider';
import { SETTINGS } from '@/lib/settings/catalog';
import { SettingsSection, type Notify } from './SettingsParts';
import styles from './settings.module.css';

// =============================================================================
// Settings → Live Map → Map: where maps open before there's anything to show.
// Instead of typing coordinates, the admin moves this map to their area and
// saves the view. Stored as three catalog settings (tracking.map_center_lat,
// tracking.map_center_lng, tracking.map_zoom), read by useMapStartView().
// =============================================================================

type View = { lat: number; lng: number; zoom: number };

const LAT = SETTINGS['tracking.map_center_lat'];
const LNG = SETTINGS['tracking.map_center_lng'];
const ZOOM = SETTINGS['tracking.map_zoom'];
const DEFAULT_VIEW: View = { lat: LAT.default, lng: LNG.default, zoom: ZOOM.default };

/** As stored: 4 decimals (about 11 m) and whole zoom levels within the setting's limits. */
function toStored(lat: number, lng: number, zoom: number): View {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return { lat: round4(clamp(lat, LAT.min, LAT.max)), lng: round4(clamp(lng, LNG.min, LNG.max)), zoom: clamp(Math.round(zoom), ZOOM.min, ZOOM.max) };
}

const sameView = (a: View, b: View) => a.lat === b.lat && a.lng === b.lng && a.zoom === b.zoom;
const describe = (v: View) => `${v.lat.toFixed(4)}, ${v.lng.toFixed(4)} · zoom ${v.zoom}`;

export default function MapStartPicker({ notify }: { notify: Notify }) {
  const { fleet, saveFleet } = useSettingsAdmin();
  const saved: View = {
    lat: fleet.values['tracking.map_center_lat'],
    lng: fleet.values['tracking.map_center_lng'],
    zoom: fleet.values['tracking.map_zoom'],
  };
  const changed = ['tracking.map_center_lat', 'tracking.map_center_lng', 'tracking.map_zoom'].some((k) => fleet.overridden.includes(k));

  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const startAt = useRef(saved);
  const [view, setView] = useState<View>(saved);
  const [busy, setBusy] = useState<'save' | 'locate' | null>(null);

  // Leaflet is browser-only, so load it once the box is on screen.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    (async () => {
      const L = await import('leaflet');
      if (cancelled || !divRef.current) return;
      map = L.map(divRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const v = startAt.current;
      map.setView([v.lat, v.lng], v.zoom);
      map.on('moveend', () => {
        const c = map!.getCenter().wrap();
        setView(toStored(c.lat, c.lng, map!.getZoom()));
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  const save = async (next: View | null) => {
    setBusy('save');
    const error = await saveFleet({
      'tracking.map_center_lat': next ? next.lat : null,
      'tracking.map_center_lng': next ? next.lng : null,
      'tracking.map_zoom': next ? next.zoom : null,
    });
    setBusy(null);
    if (error) {
      notify('error', error);
      return;
    }
    if (!next) mapRef.current?.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);
    notify('success', next ? 'The Live Map now opens on this view' : 'The Live Map opens on the default view again');
  };

  const locate = () => {
    if (!navigator.geolocation) {
      notify('error', 'This browser can’t share your location — move the map by hand instead.');
      return;
    }
    setBusy('locate');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 12);
      },
      () => {
        setBusy(null);
        notify('error', 'Couldn’t get your location — move the map by hand instead.');
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const unsaved = !sameView(view, saved);

  return (
    <SettingsSection
      title="Map"
      description="Where the Live Map and safety maps open before any driver is sharing their location."
    >
      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Starting view</div>
          <div className={styles.settingDescription}>
            Move and zoom the map to your area — your town or depot — then save. Drivers’ positions still take over as
            soon as anyone is sharing.
          </div>
        </div>

        <div ref={divRef} className={styles.mapPicker} aria-label="Map — move it to choose the starting view" />

        <div className={styles.mapPickerBar}>
          <span className={styles.settingMeta}>
            {unsaved ? `Showing ${describe(view)} — not saved` : changed ? `Opens at ${describe(saved)}` : `Opens at the default view (Malta) · ${describe(saved)}`}
          </span>
          <div className={styles.mapPickerActions}>
            <button type="button" className="btn btn-secondary" onClick={locate} disabled={busy !== null}>
              {busy === 'locate' ? 'Locating…' : 'Use my location'}
            </button>
            {changed && (
              <button type="button" className="btn btn-secondary" onClick={() => save(null)} disabled={busy !== null}>
                Reset to default
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => save(view)} disabled={busy !== null || !unsaved}>
              {busy === 'save' ? 'Saving…' : 'Save this view'}
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
