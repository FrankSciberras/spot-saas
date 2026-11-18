// Geotab (MyGeotab) — GO devices, very common in larger European fleets.
// Docs: https://developers.geotab.com/myGeotab/apiReference/methods
//   Authenticate                         → session credentials + home server
//   ExecuteMultiCall [Get Device, Get DeviceStatusInfo]
//                                        → every vehicle + its latest fix
// JSON-RPC over POST https://<server>/apiv1. Errors come back as { error }.
// Units: speed km/h, bearing degrees.
// The session is cached in memory so we don't re-authenticate every minute
// (Geotab rate-limits Authenticate).

import { createHash } from 'node:crypto';
import {
  GpsProviderError,
  fetchJson,
  isoTime,
  num,
  str,
  type GpsCredentials,
  type GpsDeviceSnapshot,
  type GpsProviderAdapter,
} from '../types';

interface GeotabCredentials {
  database: string;
  sessionId: string;
  userName: string;
}

interface Session {
  credentials: GeotabCredentials;
  server: string;
  at: number;
}

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string; name?: string; errors?: { name?: string; message?: string }[] };
}

interface GeotabDevice {
  id: string;
  name?: string;
  serialNumber?: string;
  licensePlate?: string;
  vehicleIdentificationNumber?: string;
  activeTo?: string;
}

interface GeotabStatus {
  device?: { id?: string };
  latitude?: number;
  longitude?: number;
  speed?: number;
  bearing?: number;
  dateTime?: string;
  isDriving?: boolean;
}

const SESSION_TTL_MS = 6 * 60 * 60_000;
const sessions = new Map<string, Session>();

const cacheKey = (c: GpsCredentials) =>
  createHash('sha256').update(`${c.server_url}|${c.database}|${c.username}|${c.password}`).digest('hex');

function host(raw: string | undefined): string {
  const v = (raw ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return v || 'my.geotab.com';
}

async function rpc<T>(server: string, method: string, params: unknown): Promise<T> {
  const res = await fetchJson<RpcResponse<T>>(`https://${server}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ method, params }),
    providerName: 'Geotab',
  });
  if (res.error) {
    const names = [res.error.name, ...(res.error.errors ?? []).map((e) => e.name)].join(' ');
    if (/InvalidUser|DbUnavailable|Unauthorized/i.test(names)) {
      throw new GpsProviderError('auth', 'Geotab refused the login. Check the database name, username and password.');
    }
    if (/OverLimit/i.test(names)) {
      throw new GpsProviderError('rate_limit', 'Geotab is limiting requests right now. Rovora will retry shortly.');
    }
    throw new GpsProviderError('bad_response', `Geotab answered with an error: ${res.error.message ?? 'unknown'}.`);
  }
  return res.result as T;
}

async function session(c: GpsCredentials, fresh = false): Promise<Session> {
  const key = cacheKey(c);
  const cached = sessions.get(key);
  if (!fresh && cached && Date.now() - cached.at < SESSION_TTL_MS) return cached;

  const database = (c.database ?? '').trim();
  const userName = (c.username ?? '').trim();
  if (!database || !userName || !c.password) {
    throw new GpsProviderError('config', 'Enter your Geotab database, username and password.');
  }
  const start = host(c.server_url);
  const auth = await rpc<{ credentials: GeotabCredentials; path?: string }>(start, 'Authenticate', {
    database,
    userName,
    password: c.password,
  });
  const server = auth.path && auth.path !== 'ThisServer' ? host(auth.path) : start;
  const s = { credentials: auth.credentials, server, at: Date.now() };
  sessions.set(key, s);
  return s;
}

export const geotab: GpsProviderAdapter = {
  key: 'geotab',
  name: 'Geotab',
  fields: [
    { key: 'database', label: 'Database', placeholder: 'Your MyGeotab database name' },
    { key: 'username', label: 'Username', placeholder: 'api.rovora@yourcompany.com' },
    { key: 'password', label: 'Password', secret: true },
    {
      key: 'server_url',
      label: 'Server',
      optional: true,
      placeholder: 'my.geotab.com',
      hint: 'Leave empty unless your Geotab reseller gave you a different server.',
    },
  ],
  steps: [
    'In MyGeotab, go to People → Users and add a new user just for Rovora (e.g. api.rovora@yourcompany.com).',
    'Give it the “View only” (or a read-only) security clearance and tick “Authenticate via MyGeotab”.',
    'Enter your database name (shown in the MyGeotab address and top-right menu), plus that user’s username and password here.',
  ],
  accountLabel(c) {
    const db = (c.database ?? '').trim();
    const u = (c.username ?? '').trim();
    return db ? `${u} @ ${db}` : null;
  },
  async fetchDevices(c) {
    const run = async (s: Session) =>
      rpc<[GeotabDevice[], GeotabStatus[]]>(s.server, 'ExecuteMultiCall', {
        calls: [
          { method: 'Get', params: { typeName: 'Device' } },
          { method: 'Get', params: { typeName: 'DeviceStatusInfo' } },
        ],
        credentials: s.credentials,
      });

    let result: [GeotabDevice[], GeotabStatus[]];
    try {
      result = await run(await session(c));
    } catch (err) {
      // A cached session may have expired — sign in once more before giving up.
      if (err instanceof GpsProviderError && err.kind === 'auth') {
        sessions.delete(cacheKey(c));
        result = await run(await session(c, true));
      } else {
        throw err;
      }
    }

    const [devices, statuses] = result ?? [[], []];
    const statusByDevice = new Map<string, GeotabStatus>();
    for (const s of statuses ?? []) if (s.device?.id) statusByDevice.set(s.device.id, s);
    const now = Date.now();

    return (devices ?? [])
      .filter((d) => !d.activeTo || new Date(d.activeTo).getTime() > now)
      .map((d): GpsDeviceSnapshot => {
        const s = statusByDevice.get(d.id);
        return {
          externalId: String(d.id),
          name: str(d.name),
          uniqueId: str(d.serialNumber),
          plate: str(d.licensePlate),
          latitude: num(s?.latitude),
          longitude: num(s?.longitude),
          speedKmh: num(s?.speed),
          heading: num(s?.bearing),
          ignition: s?.isDriving ? true : null,
          odometerKm: null,
          recordedAt: isoTime(s?.dateTime),
        };
      });
  },
};
