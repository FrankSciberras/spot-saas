import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { getLiveTrackingSettings } from '@/lib/tracking/live-tracking';

// =============================================================================
// LIVE LOCATION DURING SHIFTS (per-fleet toggle)
// =============================================================================
// GET  -> { track_location_on_shift, module_enabled, active } for the caller's
//         active fleet. Drivers call it too: the portal only starts location
//         sharing at shift start (and the app only nags) when `active`.
// PUT  -> update the flag (admin only). Writes with the service-role client
//         scoped to the caller's organization_id, so a fleet can only ever
//         edit its own setting.
// =============================================================================

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = await getLiveTrackingSettings(user.organization_id);
  return NextResponse.json(
    { track_location_on_shift: s.trackOnShift, module_enabled: s.moduleEnabled, active: s.active },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
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
  const { error } = await admin
    .from('organizations')
    .update({ track_location_on_shift: value, updated_at: new Date().toISOString() })
    .eq('id', user.organization_id);

  if (error) {
    console.error('Error updating live tracking setting:', error);
    // Column missing = the 20261004_track_location_on_shift migration hasn't run.
    const missingColumn = error.code === 'PGRST204' || error.code === '42703';
    return NextResponse.json(
      { error: missingColumn ? 'This setting needs a database update first (migration 20261004).' : 'Failed to update setting' },
      { status: 500 }
    );
  }

  const s = await getLiveTrackingSettings(user.organization_id);
  return NextResponse.json({ track_location_on_shift: s.trackOnShift, module_enabled: s.moduleEnabled, active: s.active });
}
