/**
 * Chat Service - Messaging System (Future)
 * 
 * This service handles chat/messaging functionality between users.
 * Currently implements basic CRUD operations. Real-time messaging
 * can be added using Supabase Realtime or WebSockets.
 * 
 * EXTENSION POINT: Add WebSocket/Realtime subscriptions for live chat
 */

import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  id: string;
  sender_user_id: string;
  recipient_user_id: string | null;
  room_id: string | null;
  message: string;
  message_type: 'text' | 'image' | 'file';
  attachment_url: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ChatMessageWithSender extends ChatMessage {
  sender?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface SendMessagePayload {
  recipientUserId?: string;
  roomId?: string;
  message: string;
  messageType?: 'text' | 'image' | 'file';
  attachmentUrl?: string;
}

export interface Conversation {
  recipientUserId: string;
  recipientName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

// =============================================================================
// Service Functions
// =============================================================================

/**
 * Send a message to a user or room
 */
export async function sendMessage(
  senderUserId: string,
  payload: SendMessagePayload
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    if (!payload.recipientUserId && !payload.roomId) {
      return { success: false, error: 'Recipient or room ID required' };
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        sender_user_id: senderUserId,
        recipient_user_id: payload.recipientUserId || null,
        room_id: payload.roomId || null,
        message: payload.message,
        message_type: payload.messageType || 'text',
        attachment_url: payload.attachmentUrl || null,
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get messages between two users
 */
export async function getConversation(
  userId: string,
  otherUserId: string,
  limit: number = 50
): Promise<ChatMessageWithSender[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      sender:sender_user_id (id, full_name, email)
    `)
    .or(
      `and(sender_user_id.eq.${userId},recipient_user_id.eq.${otherUserId}),and(sender_user_id.eq.${otherUserId},recipient_user_id.eq.${userId})`
    )
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching conversation:', error);
    return [];
  }

  return data || [];
}

/**
 * Get room messages
 */
export async function getRoomMessages(
  roomId: string,
  limit: number = 50
): Promise<ChatMessageWithSender[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      sender:sender_user_id (id, full_name, email)
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching room messages:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  userId: string,
  senderUserId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('chat_messages')
    .update({ is_read: true })
    .eq('recipient_user_id', userId)
    .eq('sender_user_id', senderUserId)
    .eq('is_read', false);

  return !error;
}

/**
 * Get list of conversations for a user
 */
export async function getUserConversations(
  userId: string
): Promise<Conversation[]> {
  const supabase = await createClient();

  // Get all messages involving this user
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      sender:sender_user_id (id, full_name),
      recipient:recipient_user_id (id, full_name)
    `)
    .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
    .is('room_id', null)
    .order('created_at', { ascending: false });

  if (error || !messages) {
    console.error('Error fetching conversations:', error);
    return [];
  }

  // Group by conversation partner
  const conversationsMap = new Map<string, Conversation>();

  for (const msg of messages) {
    const isIncoming = msg.recipient_user_id === userId;
    const partnerId = isIncoming ? msg.sender_user_id : msg.recipient_user_id;
    const partner = isIncoming ? msg.sender : msg.recipient;

    if (!partnerId || !partner) continue;

    if (!conversationsMap.has(partnerId)) {
      conversationsMap.set(partnerId, {
        recipientUserId: partnerId,
        recipientName: partner.full_name || 'Unknown',
        lastMessage: msg.message,
        lastMessageTime: msg.created_at,
        unreadCount: 0,
      });
    }

    // Count unread
    if (isIncoming && !msg.is_read) {
      const conv = conversationsMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  return Array.from(conversationsMap.values());
}

/**
 * Get total unread message count for a user
 */
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }

  return count || 0;
}

// =============================================================================
// Real-time Subscriptions (Future Implementation)
// =============================================================================

/**
 * Subscribe to new messages
 * 
 * TODO: Implement real-time subscriptions using Supabase Realtime
 * 
 * Example implementation:
 * ```
 * import { createClient } from '@/lib/supabase/client';
 * 
 * export function subscribeToMessages(
 *   userId: string,
 *   onMessage: (message: ChatMessage) => void
 * ) {
 *   const supabase = createClient();
 *   
 *   const channel = supabase
 *     .channel('chat_messages')
 *     .on(
 *       'postgres_changes',
 *       {
 *         event: 'INSERT',
 *         schema: 'public',
 *         table: 'chat_messages',
 *         filter: `recipient_user_id=eq.${userId}`,
 *       },
 *       (payload) => {
 *         onMessage(payload.new as ChatMessage);
 *       }
 *     )
 *     .subscribe();
 *   
 *   return () => {
 *     supabase.removeChannel(channel);
 *   };
 * }
 * ```
 */
export function subscribeToMessages(
  userId: string,
  onMessage: (message: ChatMessage) => void
): () => void {
  console.log('Real-time chat subscriptions not yet implemented');
  console.log('Would subscribe for user:', userId);
  
  // Return unsubscribe function
  return () => {
    console.log('Unsubscribe called');
  };
}
