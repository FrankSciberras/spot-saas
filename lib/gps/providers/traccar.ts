// Traccar — open-source GPS server (self-hosted, or a hosted Traccar plan).
// Docs: https://www.traccar.org/traccar-api/
//   GET /api/devices    → every device the user can see
//   GET /api/positions  → the LATEST position of each of those devices
// Auth: an API token (Traccar 5.x: Settings → Preferences → Token) sent as
// `Authorization: Bearer …`, or the account's email + password (HTTP Basic).
// Speed comes in KNOTS; totalDistance / odometer in METRES.

import {
  GpsProviderError,
  KNOTS_TO_KMH,
  bool,
  cleanBaseUrl,
  fetchJson,
  isoTime,
  num,
  str,
  type GpsCredentials,
  type GpsDeviceSnapshot,
  type GpsProviderAdapter,
} from '../types';

interface TraccarDevice {
  id: number;
  name?: string;
  uniqueId?: string;
  disabled?: boolean;
  model?: string;
  contact?: string;
  attributes?: Record<string, unknown>;
}

interface TraccarPosition {
  deviceId: number;
  latitude?: number;
  longitude?: number;
  speed?: number;
  course?: number;
  fixTime?: string;
  deviceTime?: string;
  valid?: boolean;
  attributes?: Record<string, unknown>;
}

function headers(c: GpsCredentials): Record<string, string> {
  const token = (c.token ?? '').trim();
  if (token) return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const email = (c.email ?? '').trim();
  const password = c.password ?? '';
  if (!email || !password) {
    throw new GpsProviderError('config', 'Enter an API token, or your Traccar email and password.');
  }
  return {
    Authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`,
    Accept: 'application/json',
  };
}

async function sessionCookie(base: string, token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/session?token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GpsProviderError('network', 'Couldn’t reach Traccar. Check the server address and try again.');
  }
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!res.ok || !cookie) {
    throw new GpsProviderError('auth', 'Traccar refused the token. It may have expired — generate a new one.');
  }
  return cookie;
}

export const traccar: GpsProviderAdapter = {
  key: 'traccar',
  name: 'Traccar',
  fields: [
    {
      key: 'server_url',
      label: 'Server address',
      placeholder: 'https://gps.yourcompany.com',
      hint: 'The address you open Traccar on in your browser.',
    },
    {
      key: 'token',
      label: 'API token',
      secret: true,
      optional: true,
      placeholder: 'Settings → Preferences → Token',
      hint: 'Recommended. Or leave empty and use email + password below.',
    },
    { key: 'email', label: 'Email (if no token)', optional: true, placeholder: 'you@company.com' },
    { key: 'password', label: 'Password (if no token)', secret: true, optional: true },
  ],
  steps: [
    'Open your Traccar web app and sign in.',
    'Click the settings (gear) icon → Preferences.',
    'Under “Token”, pick an expiry far in the future and press the refresh button to generate a token.',
    'Copy the token and your server address (e.g. https://gps.yourcompany.com) and paste both here.',
  ],
  accountLabel(c) {
    try {
      const host = new URL(cleanBaseUrl(c.server_url)).host;
      return c.token ? host : `${(c.email ?? '').trim()} @ ${host}`;
    } catch {
      return null;
    }
  },
  async fetchDevices(c) {
    const base = cleanBaseUrl(c.server_url);
    const load = (h: Record<string, string>) =>
      Promise.all([
        fetchJson<TraccarDevice[]>(`${base}/api/devices`, { headers: h, providerName: 'Traccar' }),
        fetchJson<TraccarPosition[]>(`${base}/api/positions`, { headers: h, providerName: 'Traccar' }),
      ]);

    let devices: TraccarDevice[];
    let positions: TraccarPosition[];
    try {
      [devices, positions] = await load(headers(c));
    } catch (err) {
      // Older Traccar 5.x builds don't take "Bearer" — they swap a token for a
      // session cookie at /api/session?token=… instead.
      const token = (c.token ?? '').trim();
      if (!(err instanceof GpsProviderError && err.kind === 'auth' && token)) throw err;
      const cookie = await sessionCookie(base, token);
      [devices, positions] = await load({ Cookie: cookie, Accept: 'application/json' });
    }
    if (!Array.isArray(devices) || !Array.isArray(positions)) {
      throw new GpsProviderError('bad_response', 'That address answered, but it doesn’t look like a Traccar server.');
    }
    const posByDevice = new Map<number, TraccarPosition>();
    for (const p of positions) posByDevice.set(p.deviceId, p);

    return devices
      .filter((d) => !d.disabled)
      .map((d): GpsDeviceSnapshot => {
        const p = posByDevice.get(d.id);
        const attrs = p?.attributes ?? {};
        const odoM = num(attrs.odometer) ?? num(attrs.totalDistance);
        const speedKnots = num(p?.speed);
        return {
          externalId: String(d.id),
          name: str(d.name),
          uniqueId: str(d.uniqueId),
          plate: str(d.attributes?.plate) ?? str(d.attributes?.licensePlate),
          latitude: p && p.valid !== false ? num(p.latitude) : null,
          longitude: p && p.valid !== false ? num(p.longitude) : null,
          speedKmh: speedKnots !== null ? Math.round(speedKnots * KNOTS_TO_KMH * 10) / 10 : null,
          heading: num(p?.course),
          ignition: bool(attrs.ignition),
          odometerKm: odoM !== null ? Math.round(odoM / 100) / 10 : null,
          recordedAt: isoTime(p?.fixTime ?? p?.deviceTime),
        };
      });
  },
};
