import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';
import appConfig from '../app.json';
import {
  drainMotionEvents,
  startMotionDetection,
  stopMotionDetection,
  LAST_SPEED_KEY,
  RECENT_FIXES_KEY,
  type PendingMotionEvent,
  type RecentFix,
} from './motionDetector';

export const LOCATION_TASK = 'rovora-driver-location';

const CTX_KEY = 'rovora.trackingContext';
const LAST_SENT_KEY = 'rovora.lastSentAt';
const LAST_HISTORY_KEY = 'rovora.lastHistoryAt';
const SEND_ERROR_KEY = 'rovora.lastSendError';
const HISTORY_INTERVAL_MS = 60_000; // append a trail point at most once a minute

export interface TrackingContext {
  driverId: string;
  organizationId: string;
  shiftId: string | null;
}

// Runs in the background (headless on Android) whenever the OS delivers fixes.
// The whole body is defensive: a throw here would crash the app process.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];
    if (!latest) return;

    const raw = await AsyncStorage.getItem(CTX_KEY);
    if (!raw) return;
    const ctx = JSON.parse(raw) as TrackingContext;

    // In a fresh headless runtime the auth session loads from storage —
    // wait for it, or the request goes out unauthenticated and RLS rejects it.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await AsyncStorage.setItem(SEND_ERROR_KEY, 'Signed out — open the app and sign in again.');
      return;
    }

    const point = {
      driver_id: ctx.driverId,
      organization_id: ctx.organizationId,
      shift_id: ctx.shiftId,
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      accuracy: latest.coords.accuracy != null ? Math.round(latest.coords.accuracy * 100) / 100 : null,
      heading: latest.coords.heading != null && latest.coords.heading >= 0 ? latest.coords.heading : null,
      speed: latest.coords.speed != null && latest.coords.speed >= 0 ? latest.coords.speed : null,
      recorded_at: new Date(latest.timestamp).toISOString(),
    };

    // Device health rides along on the latest-position row (not the history
    // trail). Fixes arriving at all means GPS + permission are healthy.
    let batteryPct: number | null = null;
    let batteryCharging: boolean | null = null;
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level != null && level >= 0) batteryPct = Math.round(level * 100);
      const state = await Battery.getBatteryStateAsync();
      if (state !== Battery.BatteryState.UNKNOWN) {
        batteryCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
      }
    } catch {
      // battery info unavailable on this device — send position without it
    }

    const { error: upsertError } = await supabase
      .from('driver_positions')
      .upsert(
        {
          ...point,
          is_tracking: true,
          battery_pct: batteryPct,
          battery_charging: batteryCharging,
          gps_enabled: true,
          location_permission: 'full',
        },
        { onConflict: 'driver_id' }
      );
    if (upsertError) {
      await AsyncStorage.setItem(SEND_ERROR_KEY, `Send failed: ${upsertError.message}`);
      return;
    }
    await AsyncStorage.setItem(LAST_SENT_KEY, new Date().toISOString());
    await AsyncStorage.removeItem(SEND_ERROR_KEY);

    const lastHistory = Number((await AsyncStorage.getItem(LAST_HISTORY_KEY)) || 0);
    if (Date.now() - lastHistory >= HISTORY_INTERVAL_MS) {
      await AsyncStorage.setItem(LAST_HISTORY_KEY, String(Date.now()));
      await supabase.from('driver_locations').insert(point);
    }

    // Remember recent fixes for the motion detector (speed before an event,
    // the trail leading up to it, and learning which way is forward), then
    // upload any harsh-driving events it queued.
    const fix: RecentFix = {
      lat: point.latitude,
      lng: point.longitude,
      speed: point.speed,
      heading: point.heading,
      t: latest.timestamp,
    };
    await AsyncStorage.setItem(LAST_SPEED_KEY, JSON.stringify(fix));
    try {
      const rawRecent = await AsyncStorage.getItem(RECENT_FIXES_KEY);
      const recent = rawRecent ? (JSON.parse(rawRecent) as RecentFix[]) : [];
      recent.push(fix);
      await AsyncStorage.setItem(RECENT_FIXES_KEY, JSON.stringify(recent.slice(-8)));
    } catch {
      // the trail is a nice-to-have
    }

    const motionEvents = await drainMotionEvents();
    if (motionEvents.length > 0) {
      await uploadMotionEvents(motionEvents, ctx, point);
    }
  } catch (e) {
    try {
      Sentry.captureException(e);
      await AsyncStorage.setItem(SEND_ERROR_KEY, `Tracking error: ${String(e)}`);
    } catch {
      // never throw out of the task
    }
  }
});

/**
 * Upload queued harsh-driving events. Events from app ≥ 1.0.4 arrive already
 * classified with their own precise location; anything that never got its
 * own GPS capture falls back to the original method — GPS speed before vs
 * this fix's speed.
 */
async function uploadMotionEvents(
  events: PendingMotionEvent[],
  ctx: TrackingContext,
  point: { latitude: number; longitude: number; speed: number | null }
): Promise<void> {
  const kmh = (s: number | null | undefined) => (s == null ? null : Math.round(s * 36) / 10);
  const rows = events.map((e) => {
    let kind: string = e.kind || 'harsh_motion';
    let classifiedBy = e.classifiedBy ?? null;
    // speedAfter undefined = the event never got its own GPS capture.
    const speedAfter = e.speedAfter === undefined ? point.speed : e.speedAfter;
    if (!e.kind && e.speedAfter === undefined && e.speedBefore != null && speedAfter != null) {
      const delta = speedAfter - e.speedBefore;
      if (delta <= -1.4) kind = 'harsh_brake';
      else if (delta >= 1.4) kind = 'harsh_accel';
      if (kind !== 'harsh_motion') classifiedBy = 'gps';
    }
    return {
      organization_id: ctx.organizationId,
      driver_id: ctx.driverId,
      shift_id: ctx.shiftId,
      kind,
      magnitude: e.magnitude,
      latitude: e.latitude ?? point.latitude,
      longitude: e.longitude ?? point.longitude,
      occurred_at: new Date(e.t).toISOString(),
      speed_before_kmh: kmh(e.speedBefore),
      speed_after_kmh: kmh(speedAfter),
      duration_ms: e.durationMs ?? null,
      turn_rate: e.turnRate ?? null,
      heading: e.heading ?? null,
      accuracy_m: e.accuracy ?? null,
      classified_by: classifiedBy,
      trail: e.trail ?? null,
      app_version: appConfig.expo.version,
    };
  });

  const { error } = await supabase.from('driver_behavior_events').insert(rows);
  if (!error) return;
  // Server without the 20261026 migration (unknown columns / no 'harsh_turn'
  // yet): keep the event with the original columns rather than lose it.
  await supabase.from('driver_behavior_events').insert(
    rows.map((r) => ({
      organization_id: r.organization_id,
      driver_id: r.driver_id,
      shift_id: r.shift_id,
      kind: r.kind === 'harsh_turn' ? 'harsh_motion' : r.kind,
      magnitude: r.magnitude,
      latitude: r.latitude,
      longitude: r.longitude,
      occurred_at: r.occurred_at,
    }))
  );
}

export async function startTracking(ctx: TrackingContext): Promise<void> {
  await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  await AsyncStorage.removeItem(LAST_HISTORY_KEY);
  await AsyncStorage.removeItem(SEND_ERROR_KEY);
  void startMotionDetection();
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // No distance threshold: a driver parked at a rank still sends a fix every
    // ~20s (Android). With 25 m the phone went silent while stationary and the
    // Live Map showed a perfectly healthy driver as "Offline".
    timeInterval: 20_000,
    distanceInterval: 0,
    deferredUpdatesInterval: 30_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Rovora — sharing location',
      notificationBody: 'Your fleet can see your live position during this shift.',
      notificationColor: '#2bbd7e',
    },
  });
}

/**
 * The context saved when sharing started. stopTracking() clears it, so a saved
 * context while the location task ISN'T running means the phone stopped it
 * (battery saver, app swiped away, reboot) — not the driver.
 */
export async function storedContext(): Promise<TrackingContext | null> {
  try {
    const raw = await AsyncStorage.getItem(CTX_KEY);
    return raw ? (JSON.parse(raw) as TrackingContext) : null;
  } catch {
    return null;
  }
}

export async function stopTracking(driverId?: string): Promise<void> {
  stopMotionDetection();
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // the task may already be gone — still clear state below
  }
  await AsyncStorage.removeItem(CTX_KEY);
  if (driverId) {
    await supabase.from('driver_positions').update({ is_tracking: false }).eq('driver_id', driverId);
  }
}

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Report GPS + permission state while tracking is supposed to be on.
 * The background task can only report while it still gets fixes — if the
 * driver disables GPS or downgrades the permission, fixes stop and only a
 * foreground check like this one can tell the fleet why. The DB trigger
 * turns the false/downgraded transition into an admin alert.
 */
export async function reportDeviceHealth(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CTX_KEY);
    if (!raw) return;
    const ctx = JSON.parse(raw) as TrackingContext;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const gpsEnabled = await Location.hasServicesEnabledAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    const fg = await Location.getForegroundPermissionsAsync();
    const permission =
      bg.status === 'granted' ? 'full' : fg.status === 'granted' ? 'foreground_only' : 'denied';

    await supabase
      .from('driver_positions')
      .update({ gps_enabled: gpsEnabled, location_permission: permission })
      .eq('driver_id', ctx.driverId);
  } catch {
    // best effort — never let a health check disturb tracking
  }
}

export async function lastSentAt(): Promise<Date | null> {
  const iso = await AsyncStorage.getItem(LAST_SENT_KEY);
  return iso ? new Date(iso) : null;
}

export async function lastSendError(): Promise<string | null> {
  return AsyncStorage.getItem(SEND_ERROR_KEY);
}
