// =============================================================================
// ROVORA GPS — admin calls to Rovora's own Traccar server (server only)
// =============================================================================
// Isolation model:
//   * Each fleet gets ONE hidden Traccar user, created here, that can READ its
//     own trackers and nothing else (readonly + deviceReadonly + deviceLimit 0
//     — only a Traccar admin can change those flags). Its random password is
//     stored encrypted in gps_connections, and the normal Traccar adapter
//     reads that fleet's positions with it, so the GPS server itself enforces
//     "a fleet only sees its own trackers".
//   * Only the admin (Rovora) creates devices and links them to a fleet user
//     (POST /api/permissions). Traccar rejects data from IMEIs it doesn't know
//     (database.registerUnknown is off by default).
// Docs: https://www.traccar.org/api-reference/
// =============================================================================

import { randomBytes } from 'node:crypto';
import { GpsProviderError } from '../types';
import type { HostedGpsConfig } from './config';

interface TraccarUser {
  id: number;
  email: string;
}

export interface TraccarDeviceRecord {
  id: number;
  name: string;
  uniqueId: string;
}

async function adminCall<T>(
  cfg: HostedGpsConfig,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.adminEmail}:${cfg.adminPassword}`).toString('base64')}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GpsProviderError('network', 'Rovora GPS is not reachable right now. Please try again in a minute.');
  }
  if (res.status === 401 || res.status === 403) {
    console.error(`Rovora GPS admin call ${method} ${path} refused (${res.status}) — check ROVORA_GPS_ADMIN_* env.`);
    throw new GpsProviderError('config', 'Rovora GPS is not set up correctly. Please contact support.');
  }
  const text = await res.text();
  if (!res.ok) {
    // Traccar answers 400 with a Java exception text, e.g. a duplicate uniqueId.
    const err = new GpsProviderError('bad_response', `Rovora GPS refused the request (HTTP ${res.status}).`);
    (err as GpsProviderError & { detail?: string }).detail = text.slice(0, 500);
    throw err;
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

const isDuplicate = (err: unknown) =>
  err instanceof GpsProviderError && /duplicate|unique|already exists/i.test((err as { detail?: string }).detail ?? '');

/** A login for the fleet's hidden account. Not a real mailbox — Traccar just needs a unique email. */
export function fleetAccountEmail(orgId: string): string {
  return `fleet-${orgId}@fleets.rovora.eu`;
}

/** Creates the fleet's read-only Traccar user. Returns its id and the password to store. */
export async function createFleetAccount(
  cfg: HostedGpsConfig,
  orgId: string,
  fleetName: string,
): Promise<{ userId: number; email: string; password: string }> {
  const email = fleetAccountEmail(orgId);
  const password = randomBytes(24).toString('base64url');
  const body = {
    name: `Rovora fleet — ${fleetName}`.slice(0, 120),
    email,
    password,
    readonly: true,
    deviceReadonly: true,
    deviceLimit: 0,
    userLimit: 0,
    limitCommands: true,
    disableReports: true,
    administrator: false,
  };
  try {
    const user = await adminCall<TraccarUser>(cfg, 'POST', '/api/users', body);
    return { userId: user.id, email, password };
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    // Left over from an earlier attempt — reset its password and reuse it.
    const users = await adminCall<TraccarUser[]>(cfg, 'GET', '/api/users');
    const existing = users.find((u) => u.email === email);
    if (!existing) throw err;
    await adminCall(cfg, 'PUT', `/api/users/${existing.id}`, { ...body, id: existing.id });
    return { userId: existing.id, email, password };
  }
}

export async function deleteFleetAccount(cfg: HostedGpsConfig, userId: number): Promise<void> {
  await adminCall(cfg, 'DELETE', `/api/users/${userId}`).catch((err) => {
    console.error(`Rovora GPS: deleting fleet user ${userId} failed`, err);
  });
}

async function findDevice(cfg: HostedGpsConfig, imei: string): Promise<TraccarDeviceRecord | null> {
  const list = await adminCall<TraccarDeviceRecord[]>(
    cfg,
    'GET',
    `/api/devices?all=true&uniqueId=${encodeURIComponent(imei)}`,
  );
  return (list ?? []).find((d) => d.uniqueId === imei) ?? null;
}

/**
 * Registers the tracker on the GPS server and gives the fleet's user access.
 * A device with this IMEI that Rovora doesn't know about (left over from a
 * removed fleet) is taken over — the caller has already checked no fleet in
 * Rovora owns it.
 */
export async function addFleetDevice(
  cfg: HostedGpsConfig,
  fleetUserId: number,
  imei: string,
  name: string,
): Promise<TraccarDeviceRecord> {
  let device: TraccarDeviceRecord;
  try {
    device = await adminCall<TraccarDeviceRecord>(cfg, 'POST', '/api/devices', {
      name,
      uniqueId: imei,
      category: 'car',
    });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const existing = await findDevice(cfg, imei);
    if (!existing) throw err;
    // Start clean: no other user keeps access to a re-used device.
    await adminCall(cfg, 'DELETE', `/api/devices/${existing.id}`);
    device = await adminCall<TraccarDeviceRecord>(cfg, 'POST', '/api/devices', {
      name,
      uniqueId: imei,
      category: 'car',
    });
  }
  try {
    await adminCall(cfg, 'POST', '/api/permissions', { userId: fleetUserId, deviceId: device.id });
  } catch (err) {
    if (!isDuplicate(err)) {
      // Don't leave an unreachable device behind.
      await adminCall(cfg, 'DELETE', `/api/devices/${device.id}`).catch(() => undefined);
      throw err;
    }
  }
  return device;
}

export async function renameFleetDevice(cfg: HostedGpsConfig, deviceId: number, imei: string, name: string): Promise<void> {
  await adminCall(cfg, 'PUT', `/api/devices/${deviceId}`, { id: deviceId, name, uniqueId: imei, category: 'car' }).catch(
    (err) => console.error(`Rovora GPS: renaming device ${deviceId} failed`, err),
  );
}

/** Removes the tracker from the GPS server entirely (its Traccar history too). */
export async function deleteFleetDevice(cfg: HostedGpsConfig, deviceId: number): Promise<void> {
  try {
    await adminCall(cfg, 'DELETE', `/api/devices/${deviceId}`);
  } catch (err) {
    // Already gone is fine.
    if (err instanceof GpsProviderError && /404/.test(err.message)) return;
    throw err;
  }
}
