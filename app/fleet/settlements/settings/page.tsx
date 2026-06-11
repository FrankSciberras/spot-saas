import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import type { SettlementPreset, OrgPlatform, RecurringAdjustment } from '@/lib/types/database';
import SettlementSettingsClient, { type DriverPresetRow } from './SettlementSettingsClient';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Settlement Rules — named presets (revenue split + tax + weekly rent), a fleet
 * default, and per-driver assignment. Admin only.
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
  // Service-role reads scoped to the caller's org (requireRole resolved it).
  const admin = createAdminClient();

  const [{ data: org }, { data: presets }, { data: drivers }, { data: platforms }, { data: recurring }] = await Promise.all([
    admin
      .from('organizations')
      .select('default_settlement_preset_id')
      .eq('id', user.organization_id)
      .single(),
    admin
      .from('settlement_presets')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at'),
    admin
      .from('drivers')
      .select('id, full_name, settlement_preset_id')
      .eq('organization_id', user.organization_id)
      .eq('status', 'active')
      .order('full_name'),
    admin
      .from('org_platforms')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('sort_order'),
    admin
      .from('recurring_adjustments')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at'),
  ]);

  const driverRows: DriverPresetRow[] = (drivers || []).map((d: { id: string; full_name: string; settlement_preset_id: string | null }) => ({
    id: d.id,
    full_name: d.full_name,
    presetId: d.settlement_preset_id,
  }));

  return (
    <SettlementSettingsClient
      presets={(presets || []) as SettlementPreset[]}
      defaultPresetId={org?.default_settlement_preset_id ?? null}
      drivers={driverRows}
      platforms={(platforms || []) as OrgPlatform[]}
      recurring={(recurring || []) as RecurringAdjustment[]}
    />
  );
}
