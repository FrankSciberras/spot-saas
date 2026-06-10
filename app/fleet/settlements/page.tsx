import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import SettlementsWorkspace from './SettlementsWorkspace';

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

  // Fleet-wide default driver share % (used as the fallback split in previews).
  const { data: org } = await supabase
    .from('organizations')
    .select('settlement_driver_share_pct')
    .eq('id', user.organization_id)
    .single();
  const orgDriverSharePct = org?.settlement_driver_share_pct ?? 50;

  // Fetch all drivers (active and inactive for archive)
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, status, employment_type, settlement_driver_share_pct')
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
    />
  );
}
