import type { NextRequest } from 'next/server';
import { jsonError, loadMembership, noStore, requireChatActor } from '@/lib/messages/server';
import { removeAttachment } from '@/lib/messages/attachments';

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/messages/message/[id] — "delete for everyone".
 * Your own messages, anywhere; managers may also remove anyone's message in a
 * group (moderation). The row stays as "This message was deleted".
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, 'Message not found.');

  const { data: msg } = await admin
    .from('messages')
    .select('id, conversation_id, sender_id, kind, attachment_path, deleted_at')
    .eq('id', id)
    .eq('organization_id', actor.organizationId)
    .maybeSingle();
  if (!msg) return jsonError(404, 'Message not found.');
  const row = msg as { id: string; conversation_id: string; sender_id: string | null; kind: string; attachment_path: string | null; deleted_at: string | null };

  const found = await loadMembership(admin, actor, row.conversation_id);
  if (!found) return jsonError(404, 'Message not found.');
  if (row.kind === 'system') return jsonError(400, 'That line can’t be deleted.');
  if (row.deleted_at) return noStore({ ok: true });

  const own = row.sender_id === actor.userId;
  const moderating = found.conv.kind === 'group' && actor.isManager;
  if (!own && !moderating) return jsonError(403, 'You can only delete your own messages.');

  const { error } = await admin
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      body: null,
      attachment_path: null,
      attachment_name: null,
      attachment_mime: null,
      attachment_size: null,
    })
    .eq('id', id);
  if (error) return jsonError(500, 'Could not delete the message.');

  await removeAttachment(admin, row.attachment_path);
  return noStore({ ok: true });
}
