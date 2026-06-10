import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { DEFAULT_SCHEME } from '@/lib/config/settlements';
import SettlementSettingsClient, { type DriverShareRow } from './SettlementSettingsClient';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Settlement rules — fleet-wide default revenue split + per-driver overrides.
 * Admin only.
 */
export default async function SettlementSettingsPage() {
  const user = await requireRole(['admin']);
  return (
    <FleetShell user={user} title="Settlement Rules">
      <Suspense fallback={<FleetPageSkeleton variant="form" />}>
        <SettlementSettingsContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function SettlementSettingsContent({ user }: { user: FleetUser }) {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('settlement_driver_share_pct')
    .eq('id', user.organization_id)
    .single();

  const defaultPct = org?.settlement_driver_share_pct ?? DEFAULT_SCHEME.driverSharePct;

  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, settlement_driver_share_pct')
    .eq('status', 'active')
    .order('full_name');

  const driverRows: DriverShareRow[] = (drivers || []).map((d) => ({
    id: d.id,
    full_name: d.full_name,
    overridePct: d.settlement_driver_share_pct,
  }));

  return <SettlementSettingsClient defaultPct={defaultPct} drivers={driverRows} />;
}
