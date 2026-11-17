import { listContacts, noStore, requireChatActor } from '@/lib/messages/server';

/** GET /api/messages/contacts — people the caller may start a direct chat with. */
export async function GET() {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const contacts = await listContacts(ctx.admin, ctx.actor);
  return noStore({ contacts });
}
