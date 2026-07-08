import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import MonthlySettlementsClient from './MonthlySettlementsClient';
import type { DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import styles from './driver-settlements.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

/**
 * Driver Settlements Page - View own weekly settlements
 */
export default async function DriverSettlementsPage() {
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
      <FleetShell user={user} variant="driver" title="My Settlements">
        <div className={styles.errorCard}>
          <h3>Profile Not Found</h3>
          <p>Your driver profile has not been set up yet. Please contact an administrator.</p>
        </div>
      </FleetShell>
    );
  }

  // Fetch ALL finalized settlements for this driver (no limit for filtering)
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      settlement_platforms (*)
    `)
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .order('week_start', { ascending: false });

  return (
    <FleetShell user={user} variant="driver" title="My Settlements">
      <MonthlySettlementsClient 
        settlements={(settlements || []) as SettlementWithPlatforms[]} 
        driverName={driver.full_name}
      />
    </FleetShell>
  );
}
