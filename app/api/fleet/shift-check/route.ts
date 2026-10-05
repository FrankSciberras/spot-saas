import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { shiftCheckFromOrg } from '@/lib/shifts/shift-check';

/**
 * GET/PUT /api/fleet/shift-check — the fleet's "Long shift check" setting
 * (Settings): { enabled, afterHours, graceMinutes }. PUT is admin-only and
 * writes to the caller's own fleet only.
 */
async function read(organizationId: string) {
  const { data } = await createAdminClient().from('organizations').select('*').eq('id', organizationId).maybeSingle();
  return shiftCheckFromOrg(data);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await read(session.organization_id), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.enabled === 'boolean') update.shift_check_enabled = body.enabled;
  if (body.afterHours !== undefined) {
    const h = Math.round(Number(body.afterHours) * 2) / 2; // half-hour steps
    if (!Number.isFinite(h) || h < 1 || h > 23) {
      return NextResponse.json({ error: 'Ask after must be between 1 and 23 hours.' }, { status: 400 });
    }
    update.shift_check_after_hours = h;
  }
  if (body.graceMinutes !== undefined) {
    const m = Math.round(Number(body.graceMinutes));
    if (!Number.isFinite(m) || m < 15 || m > 240) {
      return NextResponse.json({ error: 'The wait must be between 15 and 240 minutes.' }, { status: 400 });
    }
    update.shift_check_grace_minutes = m;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { error } = await createAdminClient()
    .from('organizations')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', session.organization_id);
  if (error) {
    const missing = error.code === 'PGRST204' || error.code === '42703';
    return NextResponse.json(
      { error: missing ? 'This setting needs a database update first (migration 20261005_shift_check).' : 'Failed to save' },
      { status: 500 }
    );
  }
  return NextResponse.json(await read(session.organization_id));
}
