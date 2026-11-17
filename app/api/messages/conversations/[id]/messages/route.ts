import { after, type NextRequest } from 'next/server';
import {
  canPost,
  jsonError,
  loadMembership,
  loadPeople,
  noStore,
  otherIdFromKey,
  requireChatActor,
} from '@/lib/messages/server';
import { removeAttachment, storeAttachment } from '@/lib/messages/attachments';
import { notifyNewMessage } from '@/lib/messages/notify';
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_COLUMNS,
  mapMessageRow,
  type ChatMessagesResponse,
  type MessageRow,
} from '@/lib/messages/types';

type Ctx = { params: Promise<{ id: string }> };

const PAGE = 50;
// A person can't post more than this many messages in RATE_WINDOW_MS.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 15_000;

/** GET /api/messages/conversations/[id]/messages?before=ISO — newest page, oldest first. */
export async function GET(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');

  let query = admin
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(PAGE + 1);
  const before = request.nextUrl.searchParams.get('before');
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return jsonError(500, 'Could not load messages.');
  const rows = (data ?? []) as MessageRow[];
  const page = rows.slice(0, PAGE).reverse();
  const people = await loadPeople(admin, actor.organizationId, page.map((r) => r.sender_id));
  const body: ChatMessagesResponse = {
    messages: page.map(mapMessageRow),
    hasMore: rows.length > PAGE,
    people: Array.from(people.values()),
  };
  return noStore(body);
}

/**
 * POST /api/messages/conversations/[id]/messages — send.
 * multipart/form-data: body?, clientId?, file?   (or JSON { body, clientId })
 */
export async function POST(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;

  const found = await loadMembership(admin, actor, id);
  if (!found) return jsonError(404, 'Chat not found.');
  const { conv } = found;

  let otherInFleet: boolean | null = null;
  if (conv.kind === 'direct') {
    const otherId = otherIdFromKey(conv.direct_key, actor.userId);
    const people = await loadPeople(admin, actor.organizationId, [otherId]);
    otherInFleet = otherId ? !!people.get(otherId)?.inFleet : false;
  }
  if (!canPost(conv, actor, otherInFleet)) {
    return jsonError(
      403,
      conv.kind === 'direct' ? 'This person is no longer in your fleet.' : 'Only managers can post in this group.',
    );
  }

  // ---- Parse --------------------------------------------------------------
  let text = '';
  let clientId: string | null = null;
  let file: File | null = null;
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return jsonError(400, 'Could not read the message.');
    text = String(form.get('body') ?? '');
    clientId = form.get('clientId') ? String(form.get('clientId')) : null;
    const f = form.get('file');
    if (f instanceof File && f.size > 0) file = f;
  } else {
    const json = (await request.json().catch(() => ({}))) as { body?: unknown; clientId?: unknown };
    text = typeof json.body === 'string' ? json.body : '';
    clientId = typeof json.clientId === 'string' ? json.clientId : null;
  }
  text = text.replace(/\r\n/g, '\n').trim();
  if (clientId && (clientId.length > 64 || !/^[\w-]+$/.test(clientId))) clientId = null;
  if (!text && !file) return jsonError(400, 'Type a message first.');
  if (text.length > MAX_MESSAGE_LENGTH) return jsonError(400, `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);

  // ---- Flood guard --------------------------------------------------------
  const { count: recent } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', actor.userId)
    .gt('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString());
  if ((recent ?? 0) >= RATE_LIMIT) return jsonError(429, 'You’re sending messages too fast. Wait a moment.');

  // ---- Store --------------------------------------------------------------
  let attachment: Awaited<ReturnType<typeof storeAttachment>> | null = null;
  if (file) {
    attachment = await storeAttachment(admin, actor.organizationId, id, file);
    if ('error' in attachment) return jsonError(400, attachment.error);
  }

  const insert = {
    conversation_id: id,
    organization_id: actor.organizationId,
    sender_id: actor.userId,
    kind: attachment ? attachment.kind : 'text',
    body: text || null,
    attachment_path: attachment?.path ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_mime: attachment?.mime ?? null,
    attachment_size: attachment?.size ?? null,
    client_id: clientId,
  };
  const { data, error } = await admin.from('messages').insert(insert).select(MESSAGE_COLUMNS).single();

  if (error) {
    await removeAttachment(admin, attachment?.path);
    // Retried send of a message we already have — hand back the original.
    if (error.code === '23505' && clientId) {
      const { data: dup } = await admin
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('sender_id', actor.userId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (dup) return noStore({ message: mapMessageRow(dup as MessageRow) });
    }
    console.error('[messages] send failed:', error);
    return jsonError(500, 'Could not send the message.');
  }

  const message = mapMessageRow(data as MessageRow);

  // Your own message means you've seen everything up to it.
  await admin
    .from('conversation_members')
    .update({ last_read_at: message.createdAt })
    .eq('conversation_id', id)
    .eq('user_id', actor.userId);

  after(() => notifyNewMessage(admin, conv, actor.userId, actor.name, message).catch((e) => console.error('[messages] notify failed:', e)));

  return noStore({ message }, { status: 201 });
}
