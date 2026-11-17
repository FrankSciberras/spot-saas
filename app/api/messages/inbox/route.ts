import { createClient } from '@/lib/supabase/server';
import {
  MIGRATION_HINT,
  driverDmsAllowed,
  isMissingMigration,
  jsonError,
  loadPeople,
  noStore,
  requireChatActor,
} from '@/lib/messages/server';
import type { ChatConversation, ChatInboxResponse } from '@/lib/messages/types';

/**
 * GET /api/messages/inbox — the caller's chats in their active fleet, newest
 * first, with unread counts. Also creates the fleet's "Everyone" group the
 * first time anyone opens Messages.
 */

interface InboxRow {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  announcement: boolean;
  auto_members: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  muted: boolean;
  is_admin: boolean;
  last_read_at: string;
  unread: number;
  member_count: number;
  other_user_id: string | null;
}

export async function GET() {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;

  const ensured = await admin.rpc('chat_ensure_everyone', { p_org: actor.organizationId });
  if (ensured.error) {
    if (isMissingMigration(ensured.error)) return jsonError(503, MIGRATION_HINT, { needsMigration: true });
    console.error('[messages] ensure everyone failed:', ensured.error);
  }

  // chat_inbox() reads auth.uid(), so it runs as the signed-in user.
  const supabase = await createClient();
  const [{ data, error }, driverDms] = await Promise.all([
    supabase.rpc('chat_inbox', { p_org: actor.organizationId }),
    driverDmsAllowed(admin, actor.organizationId),
  ]);
  if (error) {
    if (isMissingMigration(error)) return jsonError(503, MIGRATION_HINT, { needsMigration: true });
    console.error('[messages] inbox failed:', error);
    return jsonError(500, 'Could not load your messages.');
  }

  const rows = (data ?? []) as InboxRow[];
  const people = await loadPeople(
    admin,
    actor.organizationId,
    rows.flatMap((r) => [r.other_user_id, r.last_message_sender_id]),
  );

  const conversations: ChatConversation[] = rows.map((r) => {
    const other = r.other_user_id ? people.get(r.other_user_id) ?? null : null;
    return {
      id: r.id,
      kind: r.kind,
      title: r.kind === 'direct' ? other?.name ?? 'Direct chat' : r.title || 'Group',
      announcement: r.announcement,
      isEveryone: r.auto_members === 'everyone',
      createdAt: r.created_at,
      lastMessageAt: r.last_message_at,
      lastMessagePreview: r.last_message_preview,
      lastMessageSenderId: r.last_message_sender_id,
      lastMessageSenderName: r.last_message_sender_id ? people.get(r.last_message_sender_id)?.name ?? null : null,
      muted: r.muted,
      canManage: r.kind === 'group' && (actor.isManager || r.is_admin),
      canPost: r.kind === 'group' ? !r.announcement || actor.isManager : other?.inFleet !== false,
      lastReadAt: r.last_read_at,
      unread: r.unread,
      memberCount: r.member_count,
      other,
    };
  });

  const body: ChatInboxResponse = {
    enabled: true,
    me: {
      userId: actor.userId,
      organizationId: actor.organizationId,
      isManager: actor.isManager,
      isAdmin: actor.isAdmin,
    },
    settings: { driverDms },
    conversations,
  };
  return noStore(body);
}
