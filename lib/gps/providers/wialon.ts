// Wialon (Gurtam) — Wialon Hosting and Wialon Local.
// Docs: https://sdk.wialon.com/wiki/en/sidebar/remoteapi/apiref/apiref
//   svc=token/login         → session id (eid) from an access token
//   svc=core/search_items   → every unit, with the flags below
//   svc=core/logout         → close the session again
// All calls are POSTs to /wialon/ajax.html with `params` as JSON.
// Errors come back as HTTP 200 with { error: <code> }.
// Units: speed km/h, course degrees, time unix seconds, mileage counter km.

import {
  GpsProviderError,
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

// Wialon Hosting runs several data centres; the account lives on one of them.
const HOSTING_API: Record<string, string> = {
  hosting: 'https://hst-api.wialon.com',
  eu: 'https://hst-api.wialon.eu',
  us: 'https://hst-api.wialon.us',
  org: 'https://hst-api.wialon.org',
};

// core/search_items data flags.
const FLAG_BASE = 0x1; // nm, id
const FLAG_ADVANCED = 0x100; // uid (IMEI), hw
const FLAG_LAST_MESSAGE = 0x400; // pos, lmsg
const FLAG_COUNTERS = 0x2000; // cnm (mileage, km)
const FLAG_PROFILE = 0x800000; // pflds (registration_plate, …)
const FLAGS = FLAG_BASE | FLAG_ADVANCED | FLAG_LAST_MESSAGE | FLAG_COUNTERS | FLAG_PROFILE;

interface WialonUnit {
  id: number;
  nm?: string;
  uid?: string;
  cnm?: number;
  pos?: { t?: number; y?: number; x?: number; s?: number; c?: number } | null;
  lmsg?: { p?: Record<string, unknown> } | null;
  pflds?: Record<string, { n?: string; v?: string }> | null;
}

const ERROR_TEXT: Record<number, string> = {
  1: 'Wialon ended the session. Rovora will sign in again on the next sync.',
  4: 'Wialon refused the token. It may have expired — create a new one.',
  7: 'This Wialon token doesn’t have access to your units.',
  8: 'Wialon refused the token. It may have expired — create a new one.',
  1011: 'Wialon refused the token. It may have expired — create a new one.',
};

function apiBase(c: GpsCredentials): string {
  const region = (c.region ?? 'hosting').trim();
  if (region === 'local') return cleanBaseUrl(c.server_url);
  return HOSTING_API[region] ?? HOSTING_API.hosting;
}

async function call<T>(base: string, svc: string, params: unknown, sid?: string): Promise<T> {
  const body = new URLSearchParams({ svc, params: JSON.stringify(params) });
  if (sid) body.set('sid', sid);
  const res = await fetchJson<T & { error?: number; reason?: string }>(`${base}/wialon/ajax.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    providerName: 'Wialon',
  });
  if (res && typeof res === 'object' && typeof res.error === 'number' && res.error !== 0) {
    const kind = [4, 7, 8, 1011].includes(res.error) ? 'auth' : res.error === 1003 ? 'rate_limit' : 'bad_response';
    throw new GpsProviderError(kind, ERROR_TEXT[res.error] ?? `Wialon answered with error ${res.error}.`);
  }
  return res;
}

function plateOf(u: WialonUnit): string | null {
  for (const f of Object.values(u.pflds ?? {})) {
    if (f?.n === 'registration_plate') return str(f.v);
  }
  return null;
}

function ignitionOf(p: Record<string, unknown> | undefined): boolean | null {
  if (!p) return null;
  // Common names: generic "ign"/"ignition", Teltonika AVL IO 239.
  return bool(p.ign) ?? bool(p.ignition) ?? bool(p.io_239);
}

export const wialon: GpsProviderAdapter = {
  key: 'wialon',
  name: 'Wialon',
  fields: [
    {
      key: 'region',
      label: 'Where do you sign in to Wialon?',
      options: [
        { value: 'hosting', label: 'Wialon Hosting — hosting.wialon.com' },
        { value: 'eu', label: 'Wialon Hosting — hosting.wialon.eu' },
        { value: 'us', label: 'Wialon Hosting — hosting.wialon.us' },
        { value: 'org', label: 'Wialon Hosting — hosting.wialon.org' },
        { value: 'local', label: 'Wialon Local (your GPS company’s own server)' },
      ],
      defaultValue: 'hosting',
    },
    {
      key: 'server_url',
      label: 'Wialon Local server',
      optional: true,
      placeholder: 'https://wialon.yourcompany.com',
      hint: 'The address you open Wialon on in your browser.',
    },
    {
      key: 'token',
      label: 'Access token',
      secret: true,
      placeholder: 'Filled in for you by “Sign in with Wialon”',
      hint: 'Or paste a token you already have.',
    },
  ],
  steps: [
    'Pick where you sign in to Wialon (many local GPS companies run Wialon under their own name — ask them if unsure).',
    'Press “Sign in with Wialon”. Wialon’s own sign-in page opens — Rovora never sees your password.',
    'Sign in and press Allow. You come straight back here with the token filled in — press Connect.',
    'The token never expires unless you delete it in Wialon (User settings → Access tokens).',
  ],
  accountLabel(c) {
    const t = (c.token ?? '').trim();
    return t ? `token …${t.slice(-4)}` : null;
  },
  async fetchDevices(c) {
    const token = (c.token ?? '').trim();
    if (!token) throw new GpsProviderError('config', 'Paste your Wialon access token.');
    const base = apiBase(c);

    const login = await call<{ eid?: string }>(base, 'token/login', { token, fl: 1 });
    const sid = login.eid;
    if (!sid) throw new GpsProviderError('auth', 'Wialon didn’t accept the token.');

    try {
      const found = await call<{ items?: WialonUnit[] }>(
        base,
        'core/search_items',
        {
          spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' },
          force: 1,
          flags: FLAGS,
          from: 0,
          to: 0,
        },
        sid,
      );
      return (found.items ?? []).map((u): GpsDeviceSnapshot => ({
        externalId: String(u.id),
        name: str(u.nm),
        uniqueId: str(u.uid),
        plate: plateOf(u),
        latitude: num(u.pos?.y),
        longitude: num(u.pos?.x),
        speedKmh: num(u.pos?.s),
        heading: num(u.pos?.c),
        ignition: ignitionOf(u.lmsg?.p ?? undefined),
        odometerKm: num(u.cnm),
        recordedAt: isoTime(u.pos?.t),
      }));
    } finally {
      // Don't leave sessions open on the customer's Wialon account.
      await call(base, 'core/logout', {}, sid).catch(() => undefined);
    }
  },
};
