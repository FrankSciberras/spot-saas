import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';

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

    const { error: upsertError } = await supabase
      .from('driver_positions')
      .upsert({ ...point, is_tracking: true }, { onConflict: 'driver_id' });
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
  } catch (e) {
    try {
      Sentry.captureException(e);
      await AsyncStorage.setItem(SEND_ERROR_KEY, `Tracking error: ${String(e)}`);
    } catch {
      // never throw out of the task
    }
  }
});

export async function startTracking(ctx: TrackingContext): Promise<void> {
  await AsyncStorage.setItem(CTX_KEY, JSON.stringify(ctx));
  await AsyncStorage.removeItem(LAST_HISTORY_KEY);
  await AsyncStorage.removeItem(SEND_ERROR_KEY);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15_000,
    distanceInterval: 25,
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

export async function stopTracking(driverId?: string): Promise<void> {
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

export async function lastSentAt(): Promise<Date | null> {
  const iso = await AsyncStorage.getItem(LAST_SENT_KEY);
  return iso ? new Date(iso) : null;
}

export async function lastSendError(): Promise<string | null> {
  return AsyncStorage.getItem(SEND_ERROR_KEY);
}
