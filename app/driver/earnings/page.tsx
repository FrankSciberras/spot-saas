import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
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
      <DashboardLayout user={user} variant="driver" title="My Earnings">
        <div className={styles.errorCard}>
          <h3>Profile Not Found</h3>
          <p>Your driver profile has not been set up yet. Please contact an administrator.</p>
        </div>
      </DashboardLayout>
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

  return (
    <DashboardLayout user={user} variant="driver" title="My Earnings">
      <EarningsClient 
        settlements={(settlements || []) as SettlementWithPlatforms[]} 
        driverName={driver.full_name}
      />
    </DashboardLayout>
  );
}
