import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resolvePlatforms } from '@/lib/config/settlements';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import SettlementsWorkspace from './SettlementsWorkspace';
import SettlementsSetupPrompt from './SettlementsSetupPrompt';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Admin Settlements Page - Batch Entry Workspace
 */
export default async function SettlementsPage() {
  const user = await requireRole(['admin', 'staff']);
  return (
    <FleetShell user={user} title="Driver Settlements">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <SettlementsContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function SettlementsContent({ user }: { user: FleetUser }) {
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  // Fleet-wide default driver share % (legacy fallback split) + default preset.
  const { data: org } = await supabase
    .from('organizations')
    .select('settlement_driver_share_pct, default_settlement_preset_id')
    .eq('id', user.organization_id)
    .single();
  const orgDriverSharePct = org?.settlement_driver_share_pct ?? 50;

  // Settlement presets (price new settlements; RLS scopes to the active org).
  const { data: presets } = await supabase
    .from('settlement_presets')
    .select('*')
    .order('created_at');

  // First-visit gate: a fleet with no presets has never configured how it pays
  // drivers. Invite them into the guided pay interview instead of an empty
  // workspace. (Existing fleets were seeded a "Standard" preset by migration, so
  // this only ever shows for a brand-new fleet.)
  if (!presets || presets.length === 0) {
    return <SettlementsSetupPrompt isAdmin={isAdmin} />;
  }

  // Active platforms for the entry form (falls back to the classic three).
  // Scope to the ACTIVE org explicitly: RLS only narrows to orgs the user is a
  // member of, so a multi-fleet account would otherwise get every fleet's
  // platforms merged (duplicate bolt/uber/ecabs slugs).
  const { data: platformRows } = await supabase
    .from('org_platforms')
    .select('key, name, default_fee_pct, icon, color')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true)
    .order('sort_order');
  const platforms = resolvePlatforms(platformRows);

  // Fetch all drivers (active and inactive for archive)
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, status, employment_type, settlement_driver_share_pct, settlement_preset_id')
    .order('full_name');

  // Separate active and archived drivers
  const activeDrivers = (allDrivers || []).filter(d => d.status === 'active');
  const archivedDrivers = (allDrivers || []).filter(d => d.status !== 'active');

  // Fetch all settlements (we'll filter client-side by week)
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      drivers:driver_id (id, full_name, status),
      settlement_platforms (*)
    `)
    .order('week_start', { ascending: false });

  return (
    <SettlementsWorkspace
      activeDrivers={activeDrivers}
      archivedDrivers={archivedDrivers}
      settlements={settlements || []}
      isAdmin={isAdmin}
      orgDriverSharePct={orgDriverSharePct}
      presets={presets || []}
      orgDefaultPresetId={org?.default_settlement_preset_id ?? null}
      platforms={platforms}
    />
  );
}
