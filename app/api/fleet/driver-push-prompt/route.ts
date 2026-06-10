import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';

// =============================================================================
// DRIVER PUSH-NOTIFICATION PROMPT (per-fleet toggle)
// =============================================================================
// GET  -> { prompt_drivers_push } for the caller's active fleet.
// PUT  -> update the flag (admin only). Writes with the service-role client
//         scoped to the caller's organization_id, so a fleet can only ever
//         edit its own setting.
// =============================================================================

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('organizations')
    .select('prompt_drivers_push')
    .eq('id', user.organization_id)
    .single();

  if (error) {
    console.error('Error fetching driver push prompt setting:', error);
    return NextResponse.json({ error: 'Failed to fetch setting' }, { status: 500 });
  }

  return NextResponse.json({ prompt_drivers_push: data?.prompt_drivers_push ?? true });
}

export async function PUT(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { value } = await request.json();
  if (typeof value !== 'boolean') {
    return NextResponse.json({ error: 'value must be a boolean' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('organizations')
    .update({ prompt_drivers_push: value, updated_at: new Date().toISOString() })
    .eq('id', user.organization_id)
    .select('prompt_drivers_push')
    .single();

  if (error) {
    console.error('Error updating driver push prompt setting:', error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }

  return NextResponse.json({ prompt_drivers_push: data.prompt_drivers_push });
}
