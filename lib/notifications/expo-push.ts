import { createAdminClient } from '@/lib/supabase/server';

/**
 * Phone push for the Rovora driver app, through Expo's push service.
 *
 * Tokens live in `push_devices` (written by POST /api/push/device once the app
 * has registered). Until the app ships with Firebase (Android) / APNs (iOS)
 * configured there are simply no tokens, and every call here is a cheap no-op.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request.

export interface ExpoPushPayload {
  title: string;
  body: string;
  /** Opened by the app when the notification is tapped. */
  url?: string;
  /** Android notification channel (the app creates 'messages'). */
  channelId?: string;
  /** Collapses notifications with the same id on the lock screen. */
  threadId?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Send the same notification to every registered phone of each user. */
export async function sendExpoPushToUsers(
  userIds: string[],
  payloadFor: (userId: string) => ExpoPushPayload,
): Promise<void> {
  if (!userIds.length) return;
  const admin = createAdminClient();
  const { data: devices, error } = await admin
    .from('push_devices')
    .select('token, user_id')
    .in('user_id', userIds);
  if (error || !devices?.length) return;

  const messages = (devices as { token: string; user_id: string }[]).map((d) => {
    const p = payloadFor(d.user_id);
    return {
      to: d.token,
      title: p.title,
      body: p.body,
      sound: 'default',
      priority: 'high',
      channelId: p.channelId ?? 'messages',
      ...(p.threadId ? { threadId: p.threadId } : {}),
      data: { url: p.url ?? '/' },
    };
  });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // Only needed if "enhanced push security" is switched on in the Expo account.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(chunk) });
      if (!res.ok) {
        console.warn('[expo-push] send failed', res.status, await res.text().catch(() => ''));
        continue;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      (json.data ?? []).forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[idx].to);
        }
      });
    } catch (err) {
      console.warn('[expo-push] send error', err);
    }
  }

  // The app was uninstalled or the token rotated — stop sending to it.
  if (dead.length) await admin.from('push_devices').delete().in('token', dead);
}
