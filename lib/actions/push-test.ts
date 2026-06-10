'use server';

// =============================================================================
// SEND TEST PUSH — let a signed-in user confirm push works on THIS device.
// =============================================================================
// Sends a push notification to the caller's own devices via their saved
// push_subscriptions. Returns whether the server is configured (VAPID keys) and
// whether a push was actually delivered, so the UI can give a clear answer.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { sendPushNotification, isPushConfigured } from '@/lib/notifications/push';

export async function sendTestPushAction(): Promise<{ error?: string; configured: boolean; sent: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'You are not signed in.', configured: false, sent: false };

  const configured = isPushConfigured();
  if (!configured) {
    return { error: 'Push isn’t configured on the server (missing VAPID keys).', configured: false, sent: false };
  }

  const sent = await sendPushNotification(user.id, {
    title: 'Test notification',
    body: 'Push notifications are working on this device 🎉',
    url: '/fleet/notifications',
  });

  if (!sent) {
    return { error: 'No active push subscription on this device — toggle push on, then try again.', configured: true, sent: false };
  }
  return { configured: true, sent: true };
}
