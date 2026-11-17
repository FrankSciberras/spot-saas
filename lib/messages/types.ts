/**
 * Messaging — shapes shared by the /api/messages routes and the chat UI.
 *
 * Kept free of server imports so client components can use it too. The DB
 * stores snake_case rows (see supabase/migrations/20261117_messaging.sql);
 * `mapMessageRow` turns one into the camelCase shape the UI works with — the
 * API and the Realtime feed both go through it, so a message looks the same
 * whichever way it arrived.
 */

export type FleetRole = 'admin' | 'staff' | 'driver';

export interface ChatPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: FleetRole | null;
  /** Admin, staff, or a driver who also does staff work. */
  isManager: boolean;
  /** Still a member of the fleet (false once they've left). */
  inFleet: boolean;
}

export interface ChatConversation {
  id: string;
  kind: 'direct' | 'group';
  /** Group title, or the other person's name for a direct chat. */
  title: string;
  announcement: boolean;
  /** The fleet's auto-managed "Everyone" group. */
  isEveryone: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  muted: boolean;
  /** Caller may rename / add / remove (group admin or fleet manager). */
  canManage: boolean;
  /** Caller may post (false in announcement groups for drivers, or when the other person left). */
  canPost: boolean;
  lastReadAt: string;
  unread: number;
  memberCount: number;
  /** Direct chats only. */
  other: ChatPerson | null;
}

export interface ChatAttachment {
  name: string;
  mime: string;
  size: number;
  /** Membership-checked route that redirects to a short-lived signed URL. */
  url: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: 'text' | 'image' | 'file' | 'system';
  body: string | null;
  attachment: ChatAttachment | null;
  clientId: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ChatMember extends ChatPerson {
  isGroupAdmin: boolean;
  lastReadAt: string;
}

export interface ChatInboxResponse {
  enabled: boolean;
  me: { userId: string; organizationId: string; isManager: boolean; isAdmin: boolean };
  settings: { driverDms: boolean };
  conversations: ChatConversation[];
}

export interface ChatThreadResponse {
  conversation: ChatConversation;
  members: ChatMember[];
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  /** More, older messages exist before the first one returned. */
  hasMore: boolean;
  /** Everyone who sent one of these messages (incl. people who have since left). */
  people: ChatPerson[];
}

/** Raw `messages` row as stored (and as Supabase Realtime delivers it). */
export interface MessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_id: string | null;
  kind: string;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  client_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export const MESSAGE_COLUMNS =
  'id, conversation_id, organization_id, sender_id, kind, body, attachment_path, attachment_name, attachment_mime, attachment_size, client_id, created_at, edited_at, deleted_at';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_GROUP_TITLE = 80;

export function mapMessageRow(row: MessageRow): ChatMessage {
  const kind = (['text', 'image', 'file', 'system'].includes(row.kind) ? row.kind : 'text') as ChatMessage['kind'];
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind,
    body: row.body,
    attachment:
      row.attachment_path && !row.deleted_at
        ? {
            name: row.attachment_name || 'Attachment',
            mime: row.attachment_mime || 'application/octet-stream',
            size: row.attachment_size || 0,
            url: `/api/messages/attachment/${row.id}`,
          }
        : null,
    clientId: row.client_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

/** "Ali Borg" → "AB"; falls back to "?" for an empty name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
