import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { assistantRoleFor } from '@/lib/assistant/context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/assistant/feedback  { message_id, value: 1 | -1 | 0 }
// Thumbs up / down on one of YOUR OWN answers (0 clears it). Used to review
// answer quality during the beta.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!assistantRoleFor(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const organizationId = session.organization_id;

  let body: { message_id?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const messageId = typeof body.message_id === 'string' && UUID.test(body.message_id) ? body.message_id : null;
  const value = body.value === 1 || body.value === -1 ? body.value : body.value === 0 ? null : undefined;
  if (!messageId || value === undefined) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from('assistant_messages')
    .select('id, conversation_id, role')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!msg || msg.role !== 'assistant') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only the person who asked may rate the answer.
  const { data: conv } = await admin
    .from('assistant_conversations')
    .select('id')
    .eq('id', msg.conversation_id as string)
    .eq('organization_id', organizationId)
    .eq('user_id', session.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await admin
    .from('assistant_messages')
    .update({ feedback: value })
    .eq('id', messageId)
    .eq('organization_id', organizationId);
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
}
