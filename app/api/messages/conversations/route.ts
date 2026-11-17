import {
  MIGRATION_HINT,
  canDirectMessage,
  directKey,
  filterFleetMembers,
  isMissingMigration,
  jsonError,
  noStore,
  postSystemMessage,
  requireChatActor,
} from '@/lib/messages/server';
import { MAX_GROUP_TITLE } from '@/lib/messages/types';

/**
 * POST /api/messages/conversations — start a chat.
 *
 *   { kind: 'direct', userId }                              → find-or-create
 *   { kind: 'group', title, memberIds, announcement? }      → managers only
 *
 * Returns { id }.
 */
export async function POST(request: Request) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    userId?: unknown;
    title?: unknown;
    memberIds?: unknown;
    announcement?: unknown;
  };

  // ---- Direct chat ---------------------------------------------------------
  if (body.kind === 'direct') {
    const target = typeof body.userId === 'string' ? body.userId : '';
    if (!target || !(await canDirectMessage(admin, actor, target))) {
      return jsonError(403, "You can't start a chat with that person.");
    }
    const key = directKey(actor.userId, target);

    const existing = await admin
      .from('conversations')
      .select('id, archived_at')
      .eq('organization_id', actor.organizationId)
      .eq('direct_key', key)
      .maybeSingle();
    if (existing.error && isMissingMigration(existing.error)) return jsonError(503, MIGRATION_HINT);

    let id = (existing.data as { id: string } | null)?.id ?? null;
    if (!id) {
      const created = await admin
        .from('conversations')
        .insert({ organization_id: actor.organizationId, kind: 'direct', direct_key: key, created_by: actor.userId })
        .select('id')
        .single();
      if (created.error) {
        // Both people opened the chat at the same moment — use the other one.
        if (created.error.code === '23505') {
          const again = await admin
            .from('conversations')
            .select('id')
            .eq('organization_id', actor.organizationId)
            .eq('direct_key', key)
            .maybeSingle();
          id = (again.data as { id: string } | null)?.id ?? null;
        }
        if (!id) {
          console.error('[messages] create direct failed:', created.error);
          return jsonError(500, 'Could not start the chat.');
        }
      } else {
        id = (created.data as { id: string }).id;
      }
    } else if ((existing.data as { archived_at: string | null }).archived_at) {
      await admin.from('conversations').update({ archived_at: null }).eq('id', id);
    }

    // (Re)join both people — e.g. a driver who left the fleet and came back.
    await admin.from('conversation_members').upsert(
      [actor.userId, target].map((user_id) => ({ conversation_id: id, user_id, organization_id: actor.organizationId })),
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
    );
    return noStore({ id });
  }

  // ---- Group chat ----------------------------------------------------------
  if (body.kind === 'group') {
    if (!actor.isManager) return jsonError(403, 'Only managers can create groups.');
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_GROUP_TITLE) : '';
    if (!title) return jsonError(400, 'Give the group a name.');
    const requested = Array.isArray(body.memberIds) ? (body.memberIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const memberIds = (await filterFleetMembers(admin, actor.organizationId, requested)).filter((id) => id !== actor.userId);
    if (!memberIds.length) return jsonError(400, 'Add at least one person to the group.');

    const created = await admin
      .from('conversations')
      .insert({
        organization_id: actor.organizationId,
        kind: 'group',
        title,
        announcement: body.announcement === true,
        created_by: actor.userId,
      })
      .select('id, organization_id')
      .single();
    if (created.error) {
      if (isMissingMigration(created.error)) return jsonError(503, MIGRATION_HINT);
      console.error('[messages] create group failed:', created.error);
      return jsonError(500, 'Could not create the group.');
    }
    const conv = created.data as { id: string; organization_id: string };

    const { error: memErr } = await admin.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: actor.userId, organization_id: actor.organizationId, is_admin: true },
      ...memberIds.map((user_id) => ({ conversation_id: conv.id, user_id, organization_id: actor.organizationId })),
    ]);
    if (memErr) {
      await admin.from('conversations').delete().eq('id', conv.id);
      console.error('[messages] add group members failed:', memErr);
      return jsonError(500, 'Could not create the group.');
    }

    await postSystemMessage(
      admin,
      conv,
      body.announcement === true
        ? `${actor.name} created the announcement group "${title}". Only managers can post here.`
        : `${actor.name} created the group "${title}".`,
    );
    return noStore({ id: conv.id }, { status: 201 });
  }

  return jsonError(400, 'Unknown chat type.');
}
