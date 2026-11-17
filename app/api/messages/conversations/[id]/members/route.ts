import type { NextRequest } from 'next/server';
import {
  canManage,
  filterFleetMembers,
  jsonError,
  loadMembership,
  loadPeople,
  nameList,
  noStore,
  postSystemMessage,
  requireChatActor,
} from '@/lib/messages/server';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/messages/conversations/[id]/members — { userIds } add people (group managers). */
export async function POST(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');
  const { conv, member } = found;
  if (!canManage(conv, member, actor)) return jsonError(403, 'Only managers can add people.');
  if (conv.auto_members) return jsonError(400, 'Everyone in the fleet is already in this group.');

  const body = (await request.json().catch(() => ({}))) as { userIds?: unknown };
  const requested = Array.isArray(body.userIds) ? (body.userIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const valid = await filterFleetMembers(admin, actor.organizationId, requested);

  const { data: existing } = await admin.from('conversation_members').select('user_id').eq('conversation_id', id);
  const already = new Set((existing ?? []).map((r: { user_id: string }) => r.user_id));
  const toAdd = valid.filter((u) => !already.has(u));
  if (!toAdd.length) return noStore({ ok: true, added: 0 });

  const { error } = await admin
    .from('conversation_members')
    .insert(toAdd.map((user_id) => ({ conversation_id: id, user_id, organization_id: actor.organizationId })));
  if (error) {
    console.error('[messages] add members failed:', error);
    return jsonError(500, 'Could not add those people.');
  }

  const people = await loadPeople(admin, actor.organizationId, toAdd);
  await postSystemMessage(admin, conv, `${actor.name} added ${nameList(toAdd.map((u) => people.get(u)?.name ?? 'someone'))}.`);
  return noStore({ ok: true, added: toAdd.length });
}

/**
 * DELETE /api/messages/conversations/[id]/members?userId=…
 * Remove someone (group managers) — or leave, when userId is the caller.
 */
export async function DELETE(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');
  const { conv, member } = found;
  if (conv.kind !== 'group') return jsonError(400, 'You can’t leave a direct chat.');
  if (conv.auto_members) return jsonError(400, 'Everyone in the fleet is in this group. You can mute it instead.');

  const target = request.nextUrl.searchParams.get('userId') || actor.userId;
  const leaving = target === actor.userId;
  if (!leaving && !canManage(conv, member, actor)) return jsonError(403, 'Only managers can remove people.');

  const { error } = await admin.from('conversation_members').delete().eq('conversation_id', id).eq('user_id', target);
  if (error) return jsonError(500, 'Could not update the group.');

  if (leaving) {
    await postSystemMessage(admin, conv, `${actor.name} left.`);
  } else {
    const people = await loadPeople(admin, actor.organizationId, [target]);
    await postSystemMessage(admin, conv, `${actor.name} removed ${people.get(target)?.name ?? 'someone'}.`);
  }
  return noStore({ ok: true });
}
