import { createClient } from '@/lib/supabase/server';
import webpush from 'web-push';

// Lazy-initialize web-push VAPID configuration
let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  
  if (publicKey && privateKey) {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
      publicKey,
      privateKey
    );
    vapidConfigured = true;
    return true;
  }
  return false;
}

interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

/**
 * Send push notification to a user
 * Requires the user to have registered a push subscription
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  // Check if push is configured
  if (!ensureVapidConfigured()) {
    console.log('Push notifications not configured (missing VAPID keys)');
    return false;
  }

  try {
    const supabase = await createClient();
    
    // Get user's push subscriptions
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subscriptions || subscriptions.length === 0) {
      console.log(`No push subscriptions found for user ${userId}`);
      return false;
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/android-chrome-192x192.png',
      badge: payload.badge || '/icons/favicon-32x32.png',
      data: {
        url: payload.url || '/',
      },
    });

    // Send to all subscriptions for this user
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notificationPayload);
          return true;
        } catch (error: unknown) {
          // If subscription is invalid, remove it
          if (error && typeof error === 'object' && 'statusCode' in error) {
            const statusCode = (error as { statusCode: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await supabase
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
            }
          }
          throw error;
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    return successCount > 0;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Get the public VAPID key for client-side subscription
 */
export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}
