// Samsara — connected-vehicle telematics (vehicle gateways, OBD plug-ins).
// Docs: https://developers.samsara.com/reference/getvehiclestats
//   GET /fleet/vehicles/stats?types=gps,obdOdometerMeters,engineStates
//       → latest GPS fix, odometer and engine state per vehicle (paginated)
//   GET /fleet/vehicles → names, plates, serials (paginated)
// Auth: `Authorization: Bearer <API token>` (Settings → API Tokens).
// EU-hosted organisations use api.eu.samsara.com.
// Units: speedMilesPerHour (MPH), headingDegrees, odometer in METRES.

import {
  GpsProviderError,
  MPH_TO_KMH,
  fetchJson,
  isoTime,
  num,
  str,
  type GpsCredentials,
  type GpsDeviceSnapshot,
  type GpsProviderAdapter,
} from '../types';

interface Page<T> {
  data?: T[];
  pagination?: { endCursor?: string; hasNextPage?: boolean };
}

interface SamsaraStat {
  id: string;
  name?: string;
  gps?: { time?: string; latitude?: number; longitude?: number; headingDegrees?: number; speedMilesPerHour?: number };
  obdOdometerMeters?: { time?: string; value?: number };
  engineState?: { time?: string; value?: string };
  engineStates?: { time?: string; value?: string };
}

interface SamsaraVehicle {
  id: string;
  name?: string;
  licensePlate?: string;
  serial?: string;
  vin?: string;
}

function base(c: GpsCredentials): string {
  return (c.region ?? 'us') === 'eu' ? 'https://api.eu.samsara.com' : 'https://api.samsara.com';
}

async function allPages<T>(url: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const sep = url.includes('?') ? '&' : '?';
    const page = await fetchJson<Page<T>>(`${url}${after ? `${sep}after=${encodeURIComponent(after)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      providerName: 'Samsara',
    });
    out.push(...(page.data ?? []));
    if (!page.pagination?.hasNextPage || !page.pagination.endCursor) break;
    after = page.pagination.endCursor;
  }
  return out;
}

export const samsara: GpsProviderAdapter = {
  key: 'samsara',
  name: 'Samsara',
  fields: [
    { key: 'token', label: 'API token', secret: true, placeholder: 'samsara_api_…' },
    {
      key: 'region',
      label: 'Samsara region',
      options: [
        { value: 'us', label: 'Global (cloud.samsara.com)' },
        { value: 'eu', label: 'Europe (cloud.eu.samsara.com)' },
      ],
      defaultValue: 'eu',
    },
  ],
  steps: [
    'Sign in to your Samsara dashboard.',
    'Go to Settings → Organization → API Tokens and press Add an API Token.',
    'Give it a name like “Rovora”, choose Read-only access to Vehicles, and save.',
    'Copy the token, paste it here, and pick the region your dashboard address uses.',
  ],
  accountLabel(c) {
    const t = (c.token ?? '').trim();
    return t ? `token …${t.slice(-4)}` : null;
  },
  async fetchDevices(c) {
    const token = (c.token ?? '').trim();
    if (!token) throw new GpsProviderError('config', 'Paste your Samsara API token.');
    const root = base(c);
    const [stats, vehicles] = await Promise.all([
      allPages<SamsaraStat>(`${root}/fleet/vehicles/stats?types=gps,obdOdometerMeters,engineStates`, token),
      allPages<SamsaraVehicle>(`${root}/fleet/vehicles?limit=512`, token).catch(() => [] as SamsaraVehicle[]),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    return stats.map((s): GpsDeviceSnapshot => {
      const v = vehicleById.get(s.id);
      const mph = num(s.gps?.speedMilesPerHour);
      const engine = (s.engineStates ?? s.engineState)?.value;
      const odoM = num(s.obdOdometerMeters?.value);
      return {
        externalId: String(s.id),
        name: str(s.name) ?? str(v?.name),
        uniqueId: str(v?.serial) ?? str(v?.vin),
        plate: str(v?.licensePlate),
        latitude: num(s.gps?.latitude),
        longitude: num(s.gps?.longitude),
        speedKmh: mph !== null ? Math.round(mph * MPH_TO_KMH * 10) / 10 : null,
        heading: num(s.gps?.headingDegrees),
        ignition: engine ? engine !== 'Off' : null,
        odometerKm: odoM !== null ? Math.round(odoM / 100) / 10 : null,
        recordedAt: isoTime(s.gps?.time),
      };
    });
  },
};
