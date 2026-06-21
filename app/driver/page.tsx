import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DashboardClient from './DashboardClient';
import { safeNumber } from '@/lib/utils/settlementCalculations';
import styles from './driver.module.css';

/**
 * Driver Dashboard - Fresh Minimal Design
 * What a driver wants to see: Next shift, Earnings graph, Key stats
 */
export default async function DriverDashboardPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <DashboardLayout user={user} variant="driver" title="Dashboard">
        <div className={styles.page}>
          <div className={styles.errorCard}>
            <div className={styles.errorIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h2>Profile Not Found</h2>
            <p>Please contact an administrator to set up your driver profile.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get settlements for earnings chart with platform breakdown
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      id,
      week_start, 
      week_label, 
      final_balance, 
      total_net,
      total_gross_fare,
      settlement_platforms (
        platform_id,
        platform_name,
        net,
        tips,
        campaigns,
        balance
      )
    `)
    .eq('driver_id', driver.id)
    .eq('status', 'finalized')
    .order('week_start', { ascending: false })
    .limit(16);

  // Get next scheduled shift from roster
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: nextShiftData } = await supabase
    .from('roster_assignments')
    .select(`
      assignment_date,
      vehicles:vehicle_id (registration_number, make, model),
      rosters:roster_id (title, status)
    `)
    .eq('driver_id', driver.id)
    .gte('assignment_date', today.toISOString().split('T')[0])
    .order('assignment_date', { ascending: true })
    .limit(1)
    .single();

  interface NextShift {
    assignment_date: string;
    vehicles: { registration_number: string; make: string; model: string } | null;
    rosters: { title: string; status: string } | null;
  }
  
  // Normalize the data from Supabase
  const normalizeNextShift = (): NextShift | null => {
    if (!nextShiftData) return null;
    const data = nextShiftData as { 
      assignment_date: string; 
      vehicles: { registration_number: string; make: string; model: string }[] | { registration_number: string; make: string; model: string } | null;
      rosters: { title: string; status: string }[] | { title: string; status: string } | null;
    };
    
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles[0] : data.vehicles;
    const rosters = Array.isArray(data.rosters) ? data.rosters[0] : data.rosters;
    
    if (rosters?.status !== 'published') return null;
    
    return {
      assignment_date: data.assignment_date,
      vehicles: vehicles || null,
      rosters: rosters || null
    };
  };
  
  const nextShift = normalizeNextShift();

  // Get total shifts
  const { count: totalShifts } = await supabase
    .from('driver_shifts')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', driver.id);

  // Is there a shift currently in progress? (drives the Start ⇄ End toggle)
  const { data: activeShift } = await supabase
    .from('driver_shifts')
    .select('id')
    .eq('driver_id', driver.id)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <DashboardLayout user={user} variant="driver" title="Dashboard">
      <DashboardClient
        firstName={driver.full_name?.split(' ')[0] || 'Driver'}
        settlements={(settlements || []) as any}
        nextShift={nextShift}
        totalShifts={safeNumber(totalShifts)}
        hasActiveShift={Boolean(activeShift)}
      />
    </DashboardLayout>
  );
}
