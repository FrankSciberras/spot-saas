import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import appConfig from '../app.json';
import { isTracking, startTracking, stopTracking, storedContext } from './locationTask';

/**
 * Phone notifications without a push service (no Firebase): Android runs this
 * check every ~15 minutes in the background (WorkManager), even with the app
 * closed. While the driver is on shift it:
 *  - passes on the fleet's "Are you still on shift?" question (opening the
 *    app answers it — the portal's ShiftCheckConfirmer);
 *  - restarts sharing if the phone had stopped it this shift, and otherwise
 *    reminds them that their location is off;
 *  - stops sharing once the shift has ended (e.g. ended automatically).
 * Limits: Android decides the exact timing (15 min at best, later on strict
 * battery savers), and nothing runs after a force-stop in Settings.
 *
 * On or off shift, the same run also checks for unread chat messages
 * (runMessagesCheck) — until this build has real push, see getPushToken.
 */

export const SHIFT_CHECK_TASK = 'rovora-shift-check';
const DRIVER_KEY = 'rovora.lastDriver';
const LAST_REMINDER_KEY = 'rovora.lastShiftReminderAt';
const SHIFT_CHECK_NOTIFIED_KEY = 'rovora.shiftCheckNotified';
const MESSAGES_NOTIFIED_KEY = 'rovora.messagesNotifiedCount';
const PUSH_TOKEN_KEY = 'rovora.expoPushToken';
const REMINDER_GAP_MS = 30 * 60_000;
const CHANNEL_ID = 'shift-reminders';
// Must match the channelId the server sends chat pushes on (lib/notifications/expo-push.ts).
const MESSAGES_CHANNEL_ID = 'messages';

// Show reminders even if the app happens to be open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Which driver row the portal last said is active — background checks need it. */
export async function rememberDriver(driverId: string, organizationId: string | null): Promise<void> {
  try {
    await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify({ driverId, organizationId }));
  } catch {
    // best effort
  }
}

/** Channel + the one-time "Allow notifications?" (Android 13+). */
export async function setupNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Shift reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    // notifications are optional — tracking works without them
  }
}

async function notify(title: string, body: string, channelId = CHANNEL_ID, data?: Record<string, unknown>): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, ...(data ? { data } : {}) },
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}

/**
 * Real push (instant chat notifications) needs this build to have Firebase
 * (Android) / APNs (iOS) credentials. Without them getting a token fails and
 * we simply return null — the background unread check below covers it.
 * Call after setupNotifications() (Android 13+ needs a channel first).
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: appConfig.expo.extra.eas.projectId });
    if (data) await AsyncStorage.setItem(PUSH_TOKEN_KEY, data);
    return data || null;
  } catch {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY).catch(() => {});
    return null;
  }
}

/**
 * Signing out: unlink this phone from the account so the next person to use
 * it doesn't get the previous driver's chat notifications.
 */
export async function forgetPushToken(portalOrigin: string): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, MESSAGES_NOTIFIED_KEY]);
    if (token) {
      await fetch(`${portalOrigin}/api/push/device`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    }
  } catch {
    // best effort
  }
}

/**
 * Chat stopgap for builds without real push: every background run, ask how
 * many messages are unread and, if that went UP since we last said so, show
 * one "N new messages" notification (tapping it opens Messages). Once the app
 * has a push token the server sends each message instantly instead, so this
 * stays quiet to avoid double notifications.
 */
export async function runMessagesCheck(): Promise<void> {
  if (await AsyncStorage.getItem(PUSH_TOKEN_KEY)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const raw = await AsyncStorage.getItem(DRIVER_KEY);
  const organizationId = raw ? (JSON.parse(raw) as { organizationId?: string | null }).organizationId ?? null : null;

  const { data, error } = await supabase.rpc('chat_unread_total', { p_org: organizationId });
  if (error || typeof data !== 'number') return; // offline, or chat not set up for this fleet

  const told = Number((await AsyncStorage.getItem(MESSAGES_NOTIFIED_KEY)) || 0);
  if (data <= told) {
    // Some (or all) were read since — remember the lower number so the next
    // new message is noticed.
    if (data < told) await AsyncStorage.setItem(MESSAGES_NOTIFIED_KEY, String(Math.max(0, data)));
    return;
  }
  await AsyncStorage.setItem(MESSAGES_NOTIFIED_KEY, String(data));
  await notify(
    data === 1 ? 'New message' : `${data} new messages`,
    'Tap to read them in Rovora.',
    MESSAGES_CHANNEL_ID,
    { url: '/driver/messages' },
  );
}

export async function runShiftCheck(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const saved = await storedContext();
  let driverId = saved?.driverId ?? null;
  if (!driverId) {
    const raw = await AsyncStorage.getItem(DRIVER_KEY);
    driverId = raw ? (JSON.parse(raw) as { driverId: string }).driverId : null;
  }
  if (!driverId) return;

  // '*' so this keeps working whether or not the shift-check columns exist.
  const { data: shift, error } = await supabase
    .from('driver_shifts')
    .select('*')
    .eq('driver_id', driverId)
    .is('end_time', null)
    .limit(1)
    .maybeSingle();
  if (error) return; // offline / server trouble — try again next time
  if (!shift) {
    // The shift is over (ended in the portal, or automatically) — stop sharing.
    if (saved && (await isTracking())) await stopTracking(saved.driverId);
    return;
  }

  // The fleet asked "Are you still on shift?" — show it once per question.
  const askedAt = shift.check_requested_at as string | null | undefined;
  if (askedAt && (await AsyncStorage.getItem(SHIFT_CHECK_NOTIFIED_KEY)) !== askedAt) {
    await AsyncStorage.setItem(SHIFT_CHECK_NOTIFIED_KEY, askedAt);
    // One notification at a time: hold the "location is off" reminder for a while.
    await AsyncStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
    const deadline = shift.check_deadline_at as string | null | undefined;
    const by = deadline
      ? new Date(deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : null;
    await notify(
      'Are you still on shift?',
      by
        ? `Tap to carry on. If we don’t hear from you by ${by}, your shift will end automatically.`
        : 'Tap to carry on, or your shift will end automatically soon.'
    );
  }

  // Sharing was running this shift and the phone stopped it: try to restart.
  if (saved && saved.shiftId === shift.id && !(await isTracking())) {
    try {
      await startTracking(saved);
    } catch {
      // Android may refuse to start location from the background — remind instead.
    }
  }
  if (await isTracking()) return;

  const last = Number((await AsyncStorage.getItem(LAST_REMINDER_KEY)) || 0);
  if (Date.now() - last < REMINDER_GAP_MS) return;
  await AsyncStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
  await notify(
    'You’re on shift — location is off',
    'Rovora isn’t sharing your location with your fleet. Tap to open the app and turn it on.'
  );
}

// Defined in the global scope (imported from index.ts) so Android can run it
// headless, without the app's UI.
TaskManager.defineTask(SHIFT_CHECK_TASK, async () => {
  try {
    await runMessagesCheck();
  } catch {
    // never throw out of a background task
  }
  try {
    await runShiftCheck();
  } catch {
    // never throw out of a background task
  }
  return BackgroundTask.BackgroundTaskResult.Success;
});

/** Schedule the check (idempotent). */
export async function registerShiftCheck(): Promise<void> {
  try {
    if ((await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    if (!(await TaskManager.isTaskRegisteredAsync(SHIFT_CHECK_TASK))) {
      await BackgroundTask.registerTaskAsync(SHIFT_CHECK_TASK, { minimumInterval: 15 });
    }
  } catch {
    // background work unavailable — the in-app reminders still run
  }
}
