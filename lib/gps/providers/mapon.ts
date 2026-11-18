// Mapon — fleet tracking platform popular in northern & central Europe.
// Docs: https://mapon.com/api/
//   GET /api/v1/unit/list.json?key=… → every unit with its latest position
// Auth: an API key (Mapon → Settings → API) passed as `key`.
// Errors come back as { error: { code, msg } }.
// Units: speed km/h, direction degrees, mileage in METRES.

import {
  GpsProviderError,
  bool,
  fetchJson,
  isoTime,
  num,
  str,
  type GpsDeviceSnapshot,
  type GpsProviderAdapter,
} from '../types';

const BASE = 'https://mapon.com/api/v1';

interface MaponUnit {
  unit_id: number;
  label?: string;
  number?: string;
  vehicle_title?: string;
  box_id?: number | string;
  imei?: string;
  device?: { imei?: string };
  lat?: number;
  lng?: number;
  direction?: number;
  speed?: number;
  mileage?: number;
  last_update?: string;
  ignition?: { state?: string | boolean } | string | boolean;
  state?: { name?: string };
}

interface MaponResponse {
  data?: { units?: MaponUnit[] };
  error?: { code?: number; msg?: string };
}

function ignitionOf(u: MaponUnit): boolean | null {
  const raw = typeof u.ignition === 'object' && u.ignition !== null ? u.ignition.state : u.ignition;
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  const b = bool(raw);
  if (b !== null) return b;
  if (u.state?.name === 'driving') return true;
  return null;
}

export const mapon: GpsProviderAdapter = {
  key: 'mapon',
  name: 'Mapon',
  fields: [{ key: 'key', label: 'API key', secret: true, placeholder: 'From Mapon → Settings → API' }],
  steps: [
    'Sign in to Mapon.',
    'Open Settings → API (ask Mapon support to enable API access if you don’t see it).',
    'Create a key, copy it and paste it here.',
  ],
  accountLabel(c) {
    const t = (c.key ?? '').trim();
    return t ? `key …${t.slice(-4)}` : null;
  },
  async fetchDevices(c) {
    const key = (c.key ?? '').trim();
    if (!key) throw new GpsProviderError('config', 'Paste your Mapon API key.');
    const res = await fetchJson<MaponResponse>(`${BASE}/unit/list.json?key=${encodeURIComponent(key)}&include[]=device`, {
      headers: { Accept: 'application/json' },
      providerName: 'Mapon',
    });
    if (res.error) {
      const code = res.error.code ?? 0;
      throw new GpsProviderError(
        code === 1 || code === 2 || /key|auth/i.test(res.error.msg ?? '') ? 'auth' : 'bad_response',
        code === 1 || code === 2 || /key|auth/i.test(res.error.msg ?? '')
          ? 'Mapon refused the API key. Check it, or create a new one.'
          : `Mapon answered with an error: ${res.error.msg ?? code}.`,
      );
    }
    return (res.data?.units ?? []).map((u): GpsDeviceSnapshot => ({
      externalId: String(u.unit_id),
      name: str(u.label) ?? str(u.vehicle_title) ?? str(u.number),
      uniqueId: str(u.device?.imei) ?? str(u.imei) ?? str(u.box_id),
      plate: str(u.number),
      latitude: num(u.lat),
      longitude: num(u.lng),
      speedKmh: num(u.speed),
      heading: num(u.direction),
      ignition: ignitionOf(u),
      // Mapon doesn't document the mileage unit — leave it out rather than guess.
      odometerKm: null,
      recordedAt: isoTime(u.last_update),
    }));
  },
};
