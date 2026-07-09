import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import AdjustmentsWorkspace from './AdjustmentsWorkspace';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Admin Driver Adjustments Page
 * Manage expenses, bonuses, deductions, and reimbursements for drivers
 */
export default async function AdjustmentsPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'settlements');
  return (
    <FleetShell user={user} title="Driver Adjustments">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={0} />}>
        <AdjustmentsContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function AdjustmentsContent({ user }: { user: FleetUser }) {
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  // Fetch all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .eq('organization_id', user.organization_id)
    .order('full_name');

  // Fetch all adjustments with driver info
  const { data: adjustments } = await supabase
    .from('driver_adjustments')
    .select(`
      *,
      drivers:driver_id (id, full_name)
    `)
    .eq('organization_id', user.organization_id)
    .order('date', { ascending: false });

  return (
    <AdjustmentsWorkspace
      drivers={drivers || []}
      adjustments={adjustments || []}
      isAdmin={isAdmin}
    />
  );
}
