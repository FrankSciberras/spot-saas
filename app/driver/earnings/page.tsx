import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import { resolvePlatforms } from '@/lib/config/settlements';
import EarningsClient from './EarningsClient';
import type { DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import styles from './earnings.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

/**
 * Driver Earnings Page - View earnings breakdown from settlements
 */
export default async function DriverEarningsPage() {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const supabase = await createClient();

  // Get driver record for current user
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single();

  if (driverError || !driver) {
    if (user.role !== 'driver') {
      redirect('/fleet');
    }
    return (
      <FleetShell user={user} variant="driver" title="My Earnings">
        <div className={styles.errorCard}>
          <h3>Profile Not Found</h3>
          <p>Your driver profile has not been set up yet. Please contact an administrator.</p>
        </div>
      </FleetShell>
    );
  }

  // Fetch all finalized settlements for this driver (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      settlement_platforms (*)
    `)
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .gte('week_start', sixMonthsAgo.toISOString().split('T')[0])
    .order('week_start', { ascending: false });

  // Fleet's platforms for icons/colors in the breakdown (members can read).
  // Scope to the active org: RLS allows every org the user belongs to, so a
  // multi-fleet account would otherwise merge each fleet's platform list.
  const { data: platformRows } = await supabase
    .from('org_platforms')
    .select('key, name, default_fee_pct, icon, color')
    .eq('organization_id', user.organization_id)
    .order('sort_order');
  const platforms = resolvePlatforms(platformRows);

  return (
    <FleetShell user={user} variant="driver" title="My Earnings">
      <EarningsClient
        settlements={(settlements || []) as SettlementWithPlatforms[]}
        driverName={driver.full_name}
        platforms={platforms}
      />
    </FleetShell>
  );
}
