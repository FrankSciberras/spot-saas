// flespi — telematics backend that speaks almost every tracker protocol
// (Teltonika, Queclink, Concox, Ruptela…). Docs: https://flespi.io/docs/
//   GET /gw/devices/all?fields=id,name,configuration          → devices
//   GET /gw/devices/all/telemetry/<param,param,…>              → latest values
// Auth: `Authorization: FlespiToken <token>` (Tokens → + in the flespi panel).
// Telemetry values are already normalised by flespi: speed km/h, mileage km.

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

const BASE = 'https://flespi.io';
const PARAMS = [
  'position.latitude',
  'position.longitude',
  'position.speed',
  'position.direction',
  'position.valid',
  'engine.ignition.status',
  'vehicle.mileage',
  'timestamp',
];

interface FlespiDevice {
  id: number;
  name?: string;
  configuration?: { ident?: string; [k: string]: unknown };
}

type TelemetryValue = { value?: unknown; ts?: number };
interface FlespiTelemetry {
  id: number;
  telemetry?: Record<string, TelemetryValue | undefined> | null;
}

interface FlespiEnvelope<T> {
  result?: T[];
  errors?: { code?: number; reason?: string }[];
}

export const flespi: GpsProviderAdapter = {
  key: 'flespi',
  name: 'flespi',
  fields: [
    {
      key: 'token',
      label: 'flespi token',
      secret: true,
      placeholder: 'FlespiToken …',
      hint: 'A Standard token is enough — Rovora only reads devices and telemetry.',
    },
  ],
  steps: [
    'Sign in to the flespi panel at flespi.io.',
    'Open Tokens in the left menu and press + to create a token (type: Standard, no expiry).',
    'Copy the token and paste it here — with or without the word “FlespiToken”.',
  ],
  accountLabel(c) {
    const t = (c.token ?? '').replace(/^FlespiToken\s+/i, '').trim();
    return t ? `token …${t.slice(-4)}` : null;
  },
  async fetchDevices(c) {
    const token = (c.token ?? '').replace(/^FlespiToken\s+/i, '').trim();
    if (!token) throw new GpsProviderError('config', 'Paste your flespi token.');
    const init = { headers: { Authorization: `FlespiToken ${token}`, Accept: 'application/json' }, providerName: 'flespi' };

    const [devices, telemetry] = await Promise.all([
      fetchJson<FlespiEnvelope<FlespiDevice>>(`${BASE}/gw/devices/all?fields=id,name,configuration`, init),
      fetchJson<FlespiEnvelope<FlespiTelemetry>>(`${BASE}/gw/devices/all/telemetry/${PARAMS.join(',')}`, init),
    ]);
    if (devices.errors?.length && !devices.result?.length) {
      throw new GpsProviderError('auth', `flespi refused the token: ${devices.errors[0]?.reason ?? 'unknown reason'}.`);
    }

    const telById = new Map<number, Record<string, TelemetryValue | undefined>>();
    for (const t of telemetry.result ?? []) telById.set(t.id, t.telemetry ?? {});

    return (devices.result ?? []).map((d): GpsDeviceSnapshot => {
      const t = telById.get(d.id) ?? {};
      const v = (k: string) => t[k]?.value;
      const valid = v('position.valid');
      const posTs = t['position.latitude']?.ts ?? num(v('timestamp'));
      return {
        externalId: String(d.id),
        name: str(d.name),
        uniqueId: str(d.configuration?.ident),
        plate: null,
        latitude: valid === false ? null : num(v('position.latitude')),
        longitude: valid === false ? null : num(v('position.longitude')),
        speedKmh: num(v('position.speed')),
        heading: num(v('position.direction')),
        ignition: bool(v('engine.ignition.status')),
        odometerKm: num(v('vehicle.mileage')),
        recordedAt: isoTime(posTs),
      };
    });
  },
};
