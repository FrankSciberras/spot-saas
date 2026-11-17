import type { NextRequest } from 'next/server';
import { jsonError, loadMembership, noStore, requireChatActor } from '@/lib/messages/server';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/messages/conversations/[id]/read — "I've seen everything up to now". */
export async function POST(_request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');

  const now = new Date().toISOString();
  await admin
    .from('conversation_members')
    .update({ last_read_at: now })
    .eq('conversation_id', id)
    .eq('user_id', actor.userId);
  return noStore({ ok: true, lastReadAt: now });
}
