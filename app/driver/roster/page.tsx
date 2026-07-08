import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import RosterView from '@/components/driver/RosterView';
import styles from './roster.module.css';

export default async function DriverRosterPage() {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const supabase = await createClient();

  // Get driver record
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <FleetShell user={user} variant="driver" title="My Roster">
        <div className={styles.error}>
          <p>No driver profile found. Please contact admin.</p>
        </div>
      </FleetShell>
    );
  }

  // Get current and upcoming rosters with this driver's assignments (primary or secondary)
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(today.getDate() - 14);

  // Get assignments where driver is primary
  const { data: primaryRosters } = await supabase
    .from('rosters')
    .select(`
      *,
      roster_assignments!inner (
        id,
        assignment_date,
        day_of_week,
        vehicle_id,
        driver_id,
        secondary_driver_id,
        vehicles:vehicle_id (id, registration_number, make, model)
      )
    `)
    .eq('status', 'published')
    .eq('roster_assignments.driver_id', driver.id)
    .gte('week_end', twoWeeksAgo.toISOString().split('T')[0])
    .order('week_start', { ascending: false });

  // Get assignments where driver is secondary
  const { data: secondaryRosters } = await supabase
    .from('rosters')
    .select(`
      *,
      roster_assignments!inner (
        id,
        assignment_date,
        day_of_week,
        vehicle_id,
        driver_id,
        secondary_driver_id,
        vehicles:vehicle_id (id, registration_number, make, model)
      )
    `)
    .eq('status', 'published')
    .eq('roster_assignments.secondary_driver_id', driver.id)
    .gte('week_end', twoWeeksAgo.toISOString().split('T')[0])
    .order('week_start', { ascending: false });

  // Merge and deduplicate rosters, marking secondary assignments
  const rostersMap = new Map();
  
  primaryRosters?.forEach(roster => {
    if (!rostersMap.has(roster.id)) {
      rostersMap.set(roster.id, { ...roster, roster_assignments: [] });
    }
    roster.roster_assignments.forEach((a: { id: string }) => {
      rostersMap.get(roster.id).roster_assignments.push({ ...a, isSecondary: false });
    });
  });

  secondaryRosters?.forEach(roster => {
    if (!rostersMap.has(roster.id)) {
      rostersMap.set(roster.id, { ...roster, roster_assignments: [] });
    }
    roster.roster_assignments.forEach((a: { id: string }) => {
      // Only add if not already added as primary
      const existing = rostersMap.get(roster.id).roster_assignments.find((x: { id: string }) => x.id === a.id);
      if (!existing) {
        rostersMap.get(roster.id).roster_assignments.push({ ...a, isSecondary: true });
      }
    });
  });

  // Sort rosters: current/future weeks first (by week_start ascending), then past weeks (most recent first)
  const todayStr = new Date().toISOString().split('T')[0];
  const rosters = Array.from(rostersMap.values()).sort((a, b) => {
    const aIsPast = a.week_end < todayStr;
    const bIsPast = b.week_end < todayStr;
    
    // If one is past and one is current/future, show current/future first
    if (aIsPast !== bIsPast) {
      return aIsPast ? 1 : -1;
    }
    
    // For current/future rosters: ascending order (soonest first)
    // For past rosters: descending order (most recent past first)
    if (!aIsPast) {
      return new Date(a.week_start).getTime() - new Date(b.week_start).getTime();
    } else {
      return new Date(b.week_start).getTime() - new Date(a.week_start).getTime();
    }
  });

  return (
    <FleetShell user={user} variant="driver" title="Roster">
      <RosterView 
        myRosters={rosters} 
        driverId={driver.id} 
      />
    </FleetShell>
  );
}
