import type { NextRequest } from 'next/server';
import {
  canManage,
  describeConversation,
  jsonError,
  loadMembership,
  loadPeople,
  noStore,
  postSystemMessage,
  requireChatActor,
} from '@/lib/messages/server';
import { MAX_GROUP_TITLE, type ChatMember, type ChatThreadResponse } from '@/lib/messages/types';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/messages/conversations/[id] — the chat + its members (with read positions). */
export async function GET(_request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');

  const [conversation, { data: memberRows }] = await Promise.all([
    describeConversation(admin, actor, found.conv, found.member),
    admin.from('conversation_members').select('user_id, is_admin, last_read_at').eq('conversation_id', id),
  ]);
  const rows = (memberRows ?? []) as { user_id: string; is_admin: boolean; last_read_at: string }[];
  const people = await loadPeople(admin, actor.organizationId, rows.map((r) => r.user_id));
  const members: ChatMember[] = rows
    .map((r) => {
      const p = people.get(r.user_id)!;
      return { ...p, isGroupAdmin: r.is_admin, lastReadAt: r.last_read_at };
    })
    .sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.name.localeCompare(b.name));

  const body: ChatThreadResponse = { conversation, members };
  return noStore(body);
}

/**
 * PATCH /api/messages/conversations/[id]
 *   { muted }               — anyone, for themselves
 *   { title, announcement } — group managers
 *   { archived: true }      — managers: removes the group for everyone
 */
export async function PATCH(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');
  const { conv, member } = found;

  const body = (await request.json().catch(() => ({}))) as {
    muted?: unknown;
    title?: unknown;
    announcement?: unknown;
    archived?: unknown;
  };

  if (typeof body.muted === 'boolean') {
    await admin
      .from('conversation_members')
      .update({ muted: body.muted })
      .eq('conversation_id', id)
      .eq('user_id', actor.userId);
  }

  const wantsGroupChange = body.title !== undefined || body.announcement !== undefined || body.archived !== undefined;
  if (wantsGroupChange) {
    if (!canManage(conv, member, actor)) return jsonError(403, 'Only managers can change this group.');

    if (body.archived === true) {
      if (conv.auto_members === 'everyone') return jsonError(400, 'The Everyone group can’t be deleted.');
      if (!actor.isManager) return jsonError(403, 'Only managers can delete a group.');
      await admin.from('conversations').update({ archived_at: new Date().toISOString() }).eq('id', id);
      return noStore({ ok: true, archived: true });
    }

    const update: Record<string, unknown> = {};
    const notes: string[] = [];
    if (typeof body.title === 'string') {
      const title = body.title.trim().slice(0, MAX_GROUP_TITLE);
      if (!title) return jsonError(400, 'Give the group a name.');
      if (title !== conv.title) {
        update.title = title;
        notes.push(`${actor.name} renamed the group to "${title}".`);
      }
    }
    if (typeof body.announcement === 'boolean' && body.announcement !== conv.announcement) {
      update.announcement = body.announcement;
      notes.push(
        body.announcement
          ? `${actor.name} made this an announcement group. Only managers can post.`
          : `${actor.name} opened the group up. Everyone can post again.`,
      );
    }
    if (Object.keys(update).length) {
      update.updated_at = new Date().toISOString();
      const { error } = await admin.from('conversations').update(update).eq('id', id);
      if (error) return jsonError(500, 'Could not save the change.');
      for (const note of notes) await postSystemMessage(admin, conv, note);
    }
  }

  const fresh = await loadMembership(admin, actor, id);
  if (!fresh) return noStore({ ok: true });
  return noStore({ ok: true, conversation: await describeConversation(admin, actor, fresh.conv, fresh.member) });
}
