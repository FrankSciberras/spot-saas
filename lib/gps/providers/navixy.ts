// Navixy — tracking platform (also white-labelled by many local GPS brands).
// Docs: https://www.navixy.com/docs/navixy-api/user-api/backend-api/
//   tracker/list        → every tracker (id, label, source.device_id = IMEI)
//   tracker/get_states  → latest GPS state per tracker (≤2,000 per call)
//   vehicle/list        → vehicles with plates, linked to trackers
// Auth: an API key (account owner → API keys) sent as `Authorization: NVX <key>`.
// Older / white-label servers only take it as the `hash` form parameter, so if
// the header is refused we retry once that way.
// All calls are POST; failures come back as { success: false, status: { code } }.
// Units: speed km/h, heading degrees. Timestamps are plain
// "yyyy-MM-dd HH:mm:ss" in the ACCOUNT's time zone, so we read the zone from
// user/get_info and convert to UTC.

import {
  GpsProviderError,
  bool,
  cleanBaseUrl,
  fetchJson,
  num,
  str,
  type GpsCredentials,
  type GpsDeviceSnapshot,
  type GpsProviderAdapter,
} from '../types';

const REGION_BASE: Record<string, string> = {
  eu: 'https://api.eu.navixy.com/v2',
  us: 'https://api.us.navixy.com/v2',
  me: 'https://api.me.navixy.com/v2',
};

interface NavixyEnvelope {
  success?: boolean;
  status?: { code?: number; description?: string };
}

interface NavixyTracker {
  id: number;
  label?: string;
  source?: { device_id?: string; blocked?: boolean };
}

interface NavixyState {
  gps?: {
    updated?: string;
    location?: { lat?: number; lng?: number };
    heading?: number;
    speed?: number;
  };
  ignition?: boolean;
  last_update?: string;
}

interface NavixyVehicle {
  tracker_id?: number | null;
  reg_number?: string;
}

type AuthMode = 'header' | 'hash';

function base(c: GpsCredentials): string {
  const region = (c.region ?? 'eu').trim();
  if (region === 'custom') return cleanBaseUrl(c.server_url);
  return REGION_BASE[region] ?? REGION_BASE.eu;
}

async function call<T extends NavixyEnvelope>(
  root: string,
  path: string,
  key: string,
  mode: AuthMode,
  params: Record<string, string> = {},
): Promise<T> {
  const body = new URLSearchParams(mode === 'hash' ? { ...params, hash: key } : params);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (mode === 'header') headers.Authorization = `NVX ${key}`;
  const res = await fetchJson<T>(`${root}/${path}`, {
    method: 'POST',
    headers,
    body: body.toString(),
    providerName: 'Navixy',
  });
  if (res && res.success === false) {
    const code = res.status?.code ?? 0;
    // 3 = wrong key/hash, 4 = user or key not found / session ended, 11/12 = access denied.
    const auth = [3, 4, 11, 12].includes(code);
    throw new GpsProviderError(
      auth ? 'auth' : code === 8 ? 'rate_limit' : 'bad_response',
      auth
        ? 'Navixy refused the API key. Check it, or create a new one.'
        : `Navixy answered with an error: ${res.status?.description ?? code}.`,
    );
  }
  return res;
}

/** time_zone from user/get_info ("Europe/Malta" or "+01:00") → minutes east of UTC now. */
function offsetMinutes(info: Record<string, unknown> | undefined): number {
  const user = (info?.user ?? info) as Record<string, unknown> | undefined;
  const raw =
    (user?.time_zone as string | undefined) ??
    ((user?.settings as Record<string, unknown> | undefined)?.time_zone as string | undefined);
  if (!raw) return 0;
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec(raw.trim());
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  try {
    const tz =
      new Intl.DateTimeFormat('en-US', { timeZone: raw, timeZoneName: 'longOffset' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    const g = /GMT([+-])(\d{2}):(\d{2})/.exec(tz);
    if (g) return (g[1] === '-' ? -1 : 1) * (Number(g[2]) * 60 + Number(g[3]));
  } catch {
    /* unknown zone → treat as UTC */
  }
  return 0;
}

export function navixyLocalToIso(s: string | undefined, offset: number): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offset * 60_000).toISOString();
}

export const navixy: GpsProviderAdapter = {
  key: 'navixy',
  name: 'Navixy',
  fields: [
    { key: 'hash', label: 'API key', secret: true, placeholder: 'From your account → API keys' },
    {
      key: 'region',
      label: 'Navixy server',
      options: [
        { value: 'eu', label: 'Europe (api.eu.navixy.com)' },
        { value: 'us', label: 'Americas (api.us.navixy.com)' },
        { value: 'me', label: 'Middle East (api.me.navixy.com)' },
        { value: 'custom', label: 'My GPS company’s own Navixy server' },
      ],
      defaultValue: 'eu',
    },
    {
      key: 'server_url',
      label: 'API address',
      optional: true,
      placeholder: 'https://api.yourgps.com/v2',
      hint: 'Only if your GPS company runs Navixy under its own name — ask them for the “API URL”.',
    },
  ],
  steps: [
    'Sign in to your Navixy (or your GPS company’s) tracking website as the account owner.',
    'Click your user name → API keys and create a key (keys never expire).',
    'Copy the key and paste it here. Pick Europe unless your GPS company says otherwise.',
  ],
  accountLabel(c) {
    const t = (c.hash ?? '').trim();
    return t ? `key …${t.slice(-4)}` : null;
  },
  async fetchDevices(c) {
    const key = (c.hash ?? '').trim();
    if (!key) throw new GpsProviderError('config', 'Paste your Navixy API key.');
    const root = base(c);

    let mode: AuthMode = 'header';
    let list: NavixyEnvelope & { list?: NavixyTracker[] };
    try {
      list = await call(root, 'tracker/list', key, mode);
    } catch (err) {
      if (!(err instanceof GpsProviderError && err.kind === 'auth')) throw err;
      mode = 'hash';
      list = await call(root, 'tracker/list', key, mode);
    }
    const trackers = (list.list ?? []).filter((t) => !t.source?.blocked);
    if (trackers.length === 0) return [];

    const [info, vehicles] = await Promise.all([
      call<NavixyEnvelope & Record<string, unknown>>(root, 'user/get_info', key, mode).catch(() => undefined),
      call<NavixyEnvelope & { list?: NavixyVehicle[] }>(root, 'vehicle/list', key, mode).catch(() => undefined),
    ]);

    const states: Record<string, NavixyState> = {};
    for (let i = 0; i < trackers.length; i += 1000) {
      const res = await call<NavixyEnvelope & { states?: Record<string, NavixyState> }>(
        root,
        'tracker/get_states',
        key,
        mode,
        {
          trackers: JSON.stringify(trackers.slice(i, i + 1000).map((t) => t.id)),
          allow_not_exist: 'true',
        },
      );
      Object.assign(states, res.states ?? {});
    }

    const offset = offsetMinutes(info as Record<string, unknown> | undefined);
    const plateByTracker = new Map<number, string>();
    for (const v of vehicles?.list ?? []) {
      if (v.tracker_id && v.reg_number) plateByTracker.set(v.tracker_id, v.reg_number);
    }

    return trackers.map((t): GpsDeviceSnapshot => {
      const s = states[String(t.id)];
      return {
        externalId: String(t.id),
        name: str(t.label),
        uniqueId: str(t.source?.device_id),
        plate: str(plateByTracker.get(t.id)),
        latitude: num(s?.gps?.location?.lat),
        longitude: num(s?.gps?.location?.lng),
        speedKmh: num(s?.gps?.speed),
        heading: num(s?.gps?.heading),
        ignition: bool(s?.ignition),
        odometerKm: null,
        recordedAt: navixyLocalToIso(s?.gps?.updated ?? s?.last_update, offset),
      };
    });
  },
};
