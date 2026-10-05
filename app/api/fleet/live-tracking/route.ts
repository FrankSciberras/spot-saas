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
    {
      track_location_on_shift: s.trackOnShift,
      module_enabled: s.moduleEnabled,
      active: s.active,
      require_location_for_shift: s.requireRule,
      require_effective: s.requireForShift,
    },
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

  // { value } = "Live location during shifts"; { require } = the fleet rule
  // "Require location to start a shift".
  const { value, require: requireRule } = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof value === 'boolean') update.track_location_on_shift = value;
  if (typeof requireRule === 'boolean') update.require_location_for_shift = requireRule;
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'value or require must be a boolean' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update(update)
    .eq('id', user.organization_id);

  if (error) {
    console.error('Error updating live tracking setting:', error);
    // Column missing = the 20261004_track_location_on_shift migration hasn't run.
    const missingColumn = error.code === 'PGRST204' || error.code === '42703';
    return NextResponse.json(
      { error: missingColumn ? 'This setting needs a database update first (migrations 20261004 / 20261005_tracking_recovery).' : 'Failed to update setting' },
      { status: 500 }
    );
  }

  const s = await getLiveTrackingSettings(user.organization_id);
  return NextResponse.json({
    track_location_on_shift: s.trackOnShift,
    module_enabled: s.moduleEnabled,
    active: s.active,
    require_location_for_shift: s.requireRule,
    require_effective: s.requireForShift,
  });
}
