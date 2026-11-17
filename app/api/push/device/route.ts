import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST   /api/push/device { token, platform } — the driver app registers its
 *        Expo push token for the signed-in user (called from inside the
 *        portal WebView, so the session cookie identifies the user).
 * DELETE /api/push/device { token }           — on sign-out (no session needed).
 *
 * A token belongs to one phone; if someone else signs in on that phone it
 * moves to them.
 */
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { token?: unknown; platform?: unknown };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;

  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from('push_devices')
    .upsert({ token, user_id: session.id, platform, last_seen_at: now }, { onConflict: 'token' });
  if (error) return NextResponse.json({ error: 'Could not register this device' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * No session needed: the app calls this right AFTER signing out. Knowing the
 * exact token (only the phone has it) is enough to stop notifications to that
 * phone — which is all this can do.
 */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (TOKEN.test(token)) {
    await createAdminClient().from('push_devices').delete().eq('token', token);
  }
  return NextResponse.json({ ok: true });
}
