import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import type { OrgPlatform } from '@/lib/types/database';
import SetupWizardClient from './SetupWizardClient';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Settlement Setup Wizard — guided Q&A that creates the fleet's platforms,
 * settlement preset (+ fleet default) and recurring weekly charges. Admin only.
 */
export default async function SettlementSetupPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'settlements');
  return (
    <FleetShell user={user} title="Settlement Setup">
      <Suspense fallback={<FleetPageSkeleton variant="form" />}>
        <SetupWizardContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function SetupWizardContent({ user }: { user: FleetUser }) {
  // Service-role reads scoped to the caller's org (requireRole resolved it).
  const admin = createAdminClient();

  const [{ data: org }, { data: platforms }, { count: driverCount }] = await Promise.all([
    admin
      .from('organizations')
      .select('default_settlement_preset_id')
      .eq('id', user.organization_id)
      .single(),
    admin
      .from('org_platforms')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('sort_order'),
    admin
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', user.organization_id)
      .eq('status', 'active'),
  ]);

  return (
    <SetupWizardClient
      platforms={(platforms || []) as OrgPlatform[]}
      hasDefault={Boolean(org?.default_settlement_preset_id)}
      driverCount={driverCount ?? 0}
    />
  );
}
