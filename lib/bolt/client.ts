// =============================================================================
// BOLT FLEET API (v2) CLIENT
// =============================================================================
// Talks to Bolt's "Fleet integration gateway v2" with a fleet's own API key
// (created in the Bolt Fleet Portal → Settings → Fleet API keys (v2)).
//
//   Auth:  OAuth 2.0 client-credentials at https://oidc.bolt.eu/token
//          (scope fleet-integration:api). Tokens last 10 minutes.
//   API:   https://node.bolt.eu/fleet-integration-gateway-v2/fleetIntegration/v2
//          Every endpoint is a POST with a JSON body.
//   Spec:  https://apidocs.bolt.eu/fleetIntegration/fleetIntegrationGatewayV2Auth/
//
// Two things about this API shape the code below:
//   * Failures come back as HTTP 200 with a non-zero `code` in the body
//     ({ code: 503, message: 'NOT_AUTHORIZED' }), so the HTTP status alone
//     says nothing — we always inspect the envelope.
//   * Most endpoints allow only 2 requests / second per key, so calls for the
//     same key are spaced out here rather than left to fail.
//
// SERVER ONLY — it handles the key secret.
// =============================================================================

import { createHash } from 'node:crypto';

const TOKEN_URL = 'https://oidc.bolt.eu/token';
const API_BASE = 'https://node.bolt.eu/fleet-integration-gateway-v2/fleetIntegration/v2';

/** Bolt allows 2 req/s on most endpoints; 550ms apart keeps us under it. */
const MIN_GAP_MS = 550;
const PAGE_SIZE = 1000;
/** Bolt refuses ride-history windows longer than 31 days. */
export const MAX_RIDE_WINDOW_DAYS = 31;

// --- Types (mirroring Bolt's OpenAPI schemas) ---------------------------------

export type BoltEntityStatus = 'active' | 'suspended' | 'deactivated';

export interface BoltCompany {
  company_id: number;
  legal_name: string | null;
  city_name: string | null;
  country_code: string | null;
  status_code: 'active' | 'deactivated';
}

export interface BoltNamedCode {
  code: string;
  name: string;
}

export interface BoltSuspensionDetail {
  category: BoltNamedCode;
  type: BoltNamedCode;
  document_type: BoltNamedCode | null;
  start: string;
  end: string | null;
  message: string | null;
}

export interface BoltSuspension {
  current: BoltSuspensionDetail[];
  upcoming: BoltSuspensionDetail[];
}

export interface BoltVehicleBase {
  uuid: string | null;
  registration_number: string;
  normalised_registration_number: string | null;
  vin: string | null;
  make: string | null;
  model: string;
  year: number;
  colour: string | null;
  seats: number | null;
}

export interface BoltDriverBase {
  uuid: string | null;
  partner_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string;
}

export interface BoltDriver extends BoltDriverBase {
  is_online: boolean;
  personal_code: string | null;
  status: BoltEntityStatus;
  eligible_for_scheduled_ride: boolean;
  added_to_fleet: string;
  deactivated_since: string | null;
  suspension: BoltSuspension | null;
  vehicles: {
    access: 'all_fleet_vehicles' | 'listed_only';
    selected: (BoltVehicleBase & { status: BoltEntityStatus }) | null;
  } | null;
  settings: { cash_rides_enabled: boolean } | null;
}

export interface BoltVehicle extends BoltVehicleBase {
  status: BoltEntityStatus;
  added_to_fleet: string;
  deactivated_since: string | null;
  suspension: BoltSuspension | null;
  branding: { status: string; verified_until: string } | null;
}

export type BoltOnlineState = 'waiting' | 'on_ride' | 'on_break';

export interface BoltOnlineDriver extends BoltDriverBase {
  current_state: { code: BoltOnlineState; changed_at: string | null };
  current_location: { lat: number; lng: number } | null;
  vehicle: BoltVehicleBase | null;
  current_order: { order_reference: string; state: string; category_name: string | null } | null;
}

export type BoltRideStatus =
  | 'finished'
  | 'driver_rejected'
  | 'driver_did_not_respond'
  | 'rider_cancelled'
  | 'rider_did_not_show'
  | 'driver_cancelled_after_accept';

export interface BoltOrderStop {
  type: 'pickup' | 'dropoff' | 'waypoint' | 'change_point';
  address: string | null;
  location: { lat: number; lng: number } | null;
  arrived_at_datetime: string | null;
  departed_at_datetime: string | null;
}

export interface BoltOrder {
  order_reference: string;
  status: BoltRideStatus;
  type: 'regular' | 'scheduled';
  is_optional: boolean | null;
  category_name: string | null;
  driver_cancelled_reason: string | null;
  rider_cancelled_reason: string | null;
  request_created_datetime: string;
  driver_accepted_datetime: string | null;
  pickup_datetime: string | null;
  finished_datetime: string | null;
  created_by: 'rider' | 'fleet' | null;
  payment_method: 'cash' | 'card_terminal' | 'business' | 'in_app' | null;
  price: {
    currency: string | null;
    total: number | null;
    tip: number | null;
    booking_fee: number | null;
    toll_fee: number | null;
    cancellation_fee: number | null;
  } | null;
  ride_duration_seconds: number | null;
  pickup_duration_seconds: number | null;
  pickup_to_dropoff_distance_km: number | null;
  total_ride_distance_km: number | null;
  ride_rating: number | null;
  driver: BoltDriverBase | null;
  vehicle: BoltVehicleBase | null;
  stops: BoltOrderStop[];
}

// --- Errors ------------------------------------------------------------------

export type BoltErrorKind =
  /** Bolt rejected the key itself — wrong, revoked or expired. */
  | 'auth'
  /** The key is fine but may not touch this company / endpoint. */
  | 'forbidden'
  | 'rate_limit'
  | 'bad_request'
  /** Could not reach Bolt at all, or it answered with something unreadable. */
  | 'network';

export class BoltApiError extends Error {
  kind: BoltErrorKind;
  code?: number | string;

  constructor(kind: BoltErrorKind, message: string, code?: number | string) {
    super(message);
    this.name = 'BoltApiError';
    this.kind = kind;
    this.code = code;
  }
}

/** A sentence a fleet owner can act on, for any failure talking to Bolt. */
export function describeBoltError(error: unknown): string {
  if (error instanceof BoltApiError) {
    switch (error.kind) {
      case 'auth':
        return 'Bolt didn’t accept this API key. Check the Client ID and secret, and that the key is still active in your Bolt Fleet Portal.';
      case 'forbidden':
        return 'This Bolt API key isn’t allowed to read that company’s data. In the Bolt Fleet Portal, check the key’s Companies and Endpoints are set to “All”.';
      case 'rate_limit':
        return 'Bolt is receiving too many requests for this key right now. Please try again in a minute.';
      case 'bad_request':
        return 'Bolt rejected the request. Please try again — if it keeps happening, contact support.';
      case 'network':
        return 'We couldn’t reach Bolt just now. Please try again in a minute.';
    }
  }
  return 'Something went wrong talking to Bolt. Please try again.';
}

// --- Shared, per-key state ----------------------------------------------------
// Module-level so the dashboard, "Sync now" and the cron job cooperate when
// they run in the same server process.

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const nextSlot = new Map<string, number>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Bolt wants ISO 8601 without milliseconds: 2026-11-10T12:00:00Z. */
export function boltDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface BoltCredentials {
  clientId: string;
  clientSecret: string;
}

export class BoltClient {
  private readonly creds: BoltCredentials;
  private readonly cacheKey: string;

  constructor(creds: BoltCredentials) {
    this.creds = creds;
    // Keyed on the secret too, so a wrong secret can never ride on a token
    // cached for the right one.
    this.cacheKey = createHash('sha256').update(`${creds.clientId}:${creds.clientSecret}`).digest('hex');
  }

  // ---- auth ------------------------------------------------------------------

  private async accessToken(forceNew = false): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (!forceNew && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.creds.clientId,
          client_secret: this.creds.clientSecret,
          grant_type: 'client_credentials',
          scope: 'fleet-integration:api',
        }),
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      });
    } catch {
      throw new BoltApiError('network', 'Could not reach the Bolt sign-in service.');
    }

    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!res.ok || !body?.access_token) {
      // Bolt answers unknown credentials with a bare 4xx/5xx — there is no
      // finer-grained reason to pass on, so all of these mean "bad key".
      tokenCache.delete(this.cacheKey);
      throw new BoltApiError('auth', 'Bolt did not issue an access token for this key.', res.status);
    }

    tokenCache.set(this.cacheKey, {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 600) * 1000,
    });
    return body.access_token;
  }

  // ---- transport -------------------------------------------------------------

  /** Waits for this key's next free slot so we stay inside Bolt's rate limit. */
  private async throttle(gapMs: number): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(this.cacheKey) ?? 0);
    nextSlot.set(this.cacheKey, slot + gapMs);
    if (slot > now) await sleep(slot - now);
  }

  private async call<T>(path: string, body?: Record<string, unknown>, gapMs = MIN_GAP_MS): Promise<T> {
    let refreshedToken = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken();
      await this.throttle(gapMs);

      let res: Response;
      try {
        res = await fetch(`${API_BASE}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
          cache: 'no-store',
        });
      } catch {
        if (attempt < 2) continue;
        throw new BoltApiError('network', `Could not reach Bolt (${path}).`);
      }

      const envelope = (await res.json().catch(() => null)) as
        | { code?: number; message?: string; data?: T }
        | null;

      if (!envelope || typeof envelope.code !== 'number') {
        if (attempt < 2 && res.status >= 500) continue;
        throw new BoltApiError('network', `Unexpected answer from Bolt (${path}, HTTP ${res.status}).`, res.status);
      }

      if (envelope.code === 0) return envelope.data as T;

      const message = envelope.message || 'UNKNOWN';

      // The token can expire mid-sync; one fresh token is worth a try before
      // concluding the key itself is dead.
      if (message === 'NOT_AUTHORIZED' && !refreshedToken) {
        refreshedToken = true;
        await this.accessToken(true);
        continue;
      }
      if (message === 'TOO_MANY_REQUESTS' && attempt < 4) {
        await sleep(1200 * (attempt + 1));
        continue;
      }

      const kind: BoltErrorKind =
        message === 'NOT_AUTHORIZED'
          ? 'auth'
          : message === 'COMPANY_NOT_ALLOWED'
            ? 'forbidden'
            : message === 'TOO_MANY_REQUESTS'
              ? 'rate_limit'
              : 'bad_request';
      throw new BoltApiError(kind, `Bolt ${path} failed: ${message}`, envelope.code);
    }
  }

  /** Walks every page of a list endpoint. */
  private async paged<T>(
    path: string,
    body: Record<string, unknown>,
    listKey: string,
    totalKey: string,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const data = await this.call<Record<string, unknown> | null>(path, { ...body, offset, limit: PAGE_SIZE });
      const rows = (data?.[listKey] as T[] | undefined) ?? [];
      const total = Number(data?.[totalKey] ?? 0);
      all.push(...rows);
      if (rows.length < PAGE_SIZE || all.length >= total) break;
    }
    return all;
  }

  // ---- endpoints -------------------------------------------------------------

  /** The companies this key may read. Also the cheapest way to test a key. */
  async getCompanies(): Promise<BoltCompany[]> {
    const data = await this.call<{ companies: BoltCompany[] }>('/getCompanies');
    return data?.companies ?? [];
  }

  async getDrivers(companyId: number): Promise<BoltDriver[]> {
    return this.paged<BoltDriver>('/getDrivers', { company_id: companyId }, 'drivers', 'total_rows');
  }

  async getVehicles(companyId: number): Promise<BoltVehicle[]> {
    return this.paged<BoltVehicle>('/getVehicles', { company_id: companyId }, 'vehicles', 'total_rows');
  }

  /** Who is online right now. Bolt allows 20 req/s here, so no real spacing. */
  async getOnlineDrivers(companyId: number): Promise<BoltOnlineDriver[]> {
    const data = await this.call<{ drivers: BoltOnlineDriver[] }>(
      '/getOnlineDrivers',
      { company_id: companyId },
      60,
    );
    return data?.drivers ?? [];
  }

  /**
   * Every ride offer requested between two moments (inclusive). The window may
   * be at most MAX_RIDE_WINDOW_DAYS long — callers split longer spans.
   */
  async getRideHistory(companyId: number, from: Date, to: Date): Promise<BoltOrder[]> {
    return this.paged<BoltOrder>(
      '/getRideHistory',
      { company_id: companyId, start_datetime: boltDateTime(from), end_datetime: boltDateTime(to) },
      'orders',
      'total',
    );
  }
}
