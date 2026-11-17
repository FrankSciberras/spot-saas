import { NextResponse, type NextRequest } from 'next/server';
import { jsonError, loadMembership, requireChatActor } from '@/lib/messages/server';
import { CHAT_BUCKET } from '@/lib/messages/attachments';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/messages/attachment/[messageId][?download=1]
 * Membership-checked redirect to a 5-minute signed URL for a chat photo/file.
 */
export async function GET(request: NextRequest, context: Ctx) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, 'File not found.');

  const { data } = await admin
    .from('messages')
    .select('conversation_id, attachment_path, attachment_name')
    .eq('id', id)
    .eq('organization_id', actor.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  const msg = data as { conversation_id: string; attachment_path: string | null; attachment_name: string | null } | null;
  if (!msg?.attachment_path) return jsonError(404, 'File not found.');
  if (!(await loadMembership(admin, actor, msg.conversation_id))) return jsonError(404, 'File not found.');

  const download = request.nextUrl.searchParams.get('download') === '1';
  const { data: signed, error } = await admin.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(msg.attachment_path, 300, download ? { download: msg.attachment_name || true } : undefined);
  if (error || !signed?.signedUrl) return jsonError(404, 'File not found.');

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, max-age=240' } });
}
