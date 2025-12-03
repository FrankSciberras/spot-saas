/**
 * Notification Service - Push Notifications (Future)
 * 
 * This service handles creating, sending, and managing notifications.
 * Currently stores notifications in Supabase. Push notification delivery
 * can be added later using services like Firebase Cloud Messaging, OneSignal, etc.
 * 
 * EXTENSION POINT: Add push notification delivery in sendNotification()
 */

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

export interface NotificationPayload {
  driverId?: string; // null for broadcast to all drivers
  title: string;
  body: string;
  type?: 'info' | 'warning' | 'alert';
  actionUrl?: string;
}

export interface Notification {
  id: string;
  driver_id: string | null;
  title: string;
  body: string;
  type: string;
  action_url: string | null;
  created_at: string;
  read_at: string | null;
  sent_at: string | null;
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  error?: string;
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Create and optionally send a notification
 * 
 * @param payload - Notification details
 * @param sendPush - Whether to send push notification (future implementation)
 */
export async function createNotification(
  payload: NotificationPayload,
  sendPush: boolean = false
): Promise<NotificationResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        driver_id: payload.driverId || null,
        title: payload.title,
        body: payload.body,
        type: payload.type || 'info',
        action_url: payload.actionUrl || null,
        sent_at: sendPush ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // TODO: Implement push notification delivery
    if (sendPush) {
      await deliverPushNotification(data);
    }

    return { success: true, notificationId: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send a broadcast notification to all drivers
 */
export async function broadcastNotification(
  title: string,
  body: string,
  type: 'info' | 'warning' | 'alert' = 'info'
): Promise<NotificationResult> {
  return createNotification(
    { title, body, type, driverId: undefined },
    true
  );
}

/**
 * Get notifications for a specific driver
 */
export async function getDriverNotifications(
  driverId: string,
  unreadOnly: boolean = false
): Promise<Notification[]> {
  const supabase = await createClient();

  let query = supabase
    .from('notifications')
    .select('*')
    .or(`driver_id.eq.${driverId},driver_id.is.null`)
    .order('created_at', { ascending: false });

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  return !error;
}

/**
 * Mark all notifications as read for a driver
 */
export async function markAllNotificationsAsRead(
  driverId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .or(`driver_id.eq.${driverId},driver_id.is.null`)
    .is('read_at', null);

  return !error;
}

/**
 * Deliver push notification via external service
 * 
 * TODO: Implement with your preferred push notification service
 * Options:
 * - Firebase Cloud Messaging (FCM)
 * - OneSignal
 * - Pusher
 * - AWS SNS
 * 
 * Example with FCM:
 * ```
 * import admin from 'firebase-admin';
 * 
 * async function deliverPushNotification(notification: Notification) {
 *   const driver = await getDriverById(notification.driver_id);
 *   if (!driver?.fcm_token) return;
 *   
 *   await admin.messaging().send({
 *     token: driver.fcm_token,
 *     notification: {
 *       title: notification.title,
 *       body: notification.body,
 *     },
 *     data: {
 *       notificationId: notification.id,
 *       actionUrl: notification.action_url || '',
 *     },
 *   });
 * }
 * ```
 */
async function deliverPushNotification(
  notification: Notification
): Promise<void> {
  console.log('Push notification delivery not yet implemented');
  console.log('Notification to deliver:', {
    id: notification.id,
    title: notification.title,
    driver_id: notification.driver_id,
  });
  
  // Placeholder - implement actual push delivery here
}

/**
 * Get unread notification count for a driver
 */
export async function getUnreadCount(driverId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .or(`driver_id.eq.${driverId},driver_id.is.null`)
    .is('read_at', null);

  if (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }

  return count || 0;
}
