// =============================================================================
// GPS PROVIDERS — shared shapes
// =============================================================================
// Every GPS / telematics platform Rovora can read from is one "provider"
// adapter (lib/gps/providers/*). An adapter knows two things: which fields the
// connect form must ask for, and how to fetch the latest position of every
// tracker on the account. Everything else — storing, linking trackers to
// vehicles, history, the Live Map — is shared and provider-agnostic.
//
// Units are normalised here, ONCE: speed in km/h, heading in degrees (0 =
// north), odometer in km, timestamps as ISO strings. Adapters convert from
// knots / mph / metres / unix seconds before returning.
// =============================================================================

export type GpsProviderKey =
  | 'traccar'
  | 'flespi'
  | 'wialon'
  | 'navixy'
  | 'samsara'
  | 'geotab'
  | 'mapon'
  /** Rovora's own GPS server (lib/gps/hosted). */
  | 'rovora';

/** One input on the connect form. */
export interface GpsCredentialField {
  key: string;
  label: string;
  /** Secret fields are encrypted at rest and never sent back to the browser. */
  secret?: boolean;
  /** Optional fields can be left blank (e.g. a custom server). */
  optional?: boolean;
  placeholder?: string;
  /** Short help line under the input. */
  hint?: string;
  /** A fixed list of choices instead of free text (e.g. region). */
  options?: { value: string; label: string }[];
  /** For `options` fields: the pre-selected value. */
  defaultValue?: string;
}

/** What a fleet typed into the connect form, keyed by GpsCredentialField.key. */
export type GpsCredentials = Record<string, string>;

/** The latest state of one tracker, as returned by a provider adapter. */
export interface GpsDeviceSnapshot {
  /** The tracker's id on the provider — stable across syncs. */
  externalId: string;
  name: string | null;
  /** IMEI / serial number, when the provider shares it. */
  uniqueId: string | null;
  /** Number plate, when the provider stores one. */
  plate: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  odometerKm: number | null;
  /** When the tracker took this position fix (ISO). */
  recordedAt: string | null;
}

export interface GpsProviderAdapter {
  key: GpsProviderKey;
  /** Display name, e.g. "Wialon". */
  name: string;
  /** Form fields for the connect card. */
  fields: GpsCredentialField[];
  /** Numbered "where do I find this?" steps shown next to the form. */
  steps: string[];
  /**
   * Fetches every tracker on the account with its latest position. Throws a
   * GpsProviderError on refused credentials / unreachable server.
   */
  fetchDevices(credentials: GpsCredentials): Promise<GpsDeviceSnapshot[]>;
  /** Something the operator recognises the account by — never a secret. */
  accountLabel(credentials: GpsCredentials): string | null;
}

export type GpsErrorKind = 'auth' | 'network' | 'rate_limit' | 'bad_response' | 'config';

export class GpsProviderError extends Error {
  constructor(
    public readonly kind: GpsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GpsProviderError';
  }
}

// --- small helpers shared by adapters -------------------------------------------

export const KNOTS_TO_KMH = 1.852;
export const MPH_TO_KMH = 1.609344;

/** Finite number or null (providers love sending "", null, NaN, strings). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function bool(v: unknown): boolean | null {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
}

/** Unix seconds / ms / ISO string → ISO string. */
export function isoTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(v).trim();
  // "2026-11-17 09:15:00" (no zone) — providers that do this use UTC.
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A real coordinate pair (rejects 0,0 "no fix" and out-of-range values). */
export function validLatLng(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6);
}

/** Trims a server URL to its origin (+ path, without trailing slash). */
export function cleanBaseUrl(raw: string | undefined | null, fallback?: string): string {
  const v = (raw ?? '').trim() || fallback || '';
  if (!v) throw new GpsProviderError('config', 'Enter your server address.');
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new GpsProviderError('config', 'That server address doesn’t look right — it should look like https://gps.example.com');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * fetch() with a timeout and friendly errors. Returns parsed JSON.
 * 401/403 → 'auth', 429 → 'rate_limit', other non-2xx → 'bad_response'.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number; providerName: string },
): Promise<T> {
  const { timeoutMs = 20_000, providerName, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: controller.signal, cache: 'no-store' });
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    throw new GpsProviderError(
      'network',
      aborted
        ? `${providerName} didn’t answer in time. Try again in a minute.`
        : `Couldn’t reach ${providerName}. Check the server address and try again.`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new GpsProviderError('auth', `${providerName} refused these details. Check them and try again.`);
  }
  if (res.status === 429) {
    throw new GpsProviderError('rate_limit', `${providerName} is limiting requests right now. Rovora will retry shortly.`);
  }
  if (!res.ok) {
    throw new GpsProviderError('bad_response', `${providerName} answered with an error (HTTP ${res.status}).`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new GpsProviderError('bad_response', `${providerName} sent back something Rovora couldn’t read. Check the server address.`);
  }
}
