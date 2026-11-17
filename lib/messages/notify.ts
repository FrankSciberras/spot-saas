import { sendPushNotification } from '@/lib/notifications/push';
import { sendExpoPushToUsers } from '@/lib/notifications/expo-push';
import { loadPeople, type Admin, type ConversationRow } from './server';
import type { ChatMessage } from './types';

/**
 * Tell the other members of a chat that a message arrived.
 *
 *   * browser push (managers on the website, anyone who allowed notifications)
 *   * phone push (driver app, once it has registered a token)
 *
 * Muted members are skipped. One notification per chat: a newer message
 * replaces the older one instead of stacking (tag / threadId), and the website
 * stays quiet if the person is already looking at that chat.
 *
 * Runs AFTER the response is sent (see `after()` in the send route), so a slow
 * push service never delays the sender.
 */
export async function notifyNewMessage(
  admin: Admin,
  conv: ConversationRow,
  senderId: string,
  senderName: string,
  message: ChatMessage,
): Promise<void> {
  const { data: rows } = await admin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conv.id)
    .eq('muted', false)
    .neq('user_id', senderId);
  const recipients = (rows ?? []).map((r: { user_id: string }) => r.user_id);
  if (!recipients.length) return;

  const people = await loadPeople(admin, conv.organization_id, recipients);

  const preview =
    message.kind === 'image'
      ? `📷 ${message.body?.trim() || 'Photo'}`
      : message.kind === 'file'
        ? `📎 ${message.attachment?.name || 'File'}`
        : (message.body || '').trim();
  const short = preview.length > 140 ? `${preview.slice(0, 137)}…` : preview;

  const title = conv.kind === 'direct' ? senderName : conv.title || 'Group';
  const body = conv.kind === 'direct' ? short : `${senderName}: ${short}`;
  const urlFor = (userId: string) =>
    `${people.get(userId)?.isManager ? '/fleet/messages' : '/driver/messages'}?c=${conv.id}`;
  const tag = `chat-${conv.id}`;

  const fleetMembers = recipients.filter((id) => people.get(id)?.inFleet);

  await Promise.allSettled([
    ...fleetMembers.map((userId) =>
      sendPushNotification(userId, {
        title,
        body,
        url: urlFor(userId),
        tag,
        requireInteraction: false,
        skipIfVisible: true,
      }),
    ),
    sendExpoPushToUsers(fleetMembers, (userId) => ({
      title,
      body,
      url: urlFor(userId),
      channelId: 'messages',
      threadId: tag,
    })),
  ]);
}
