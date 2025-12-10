import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './roster.module.css';

export default async function DriverRosterPage() {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const supabase = await createClient();

  // Get driver record
  const { data: driver } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <DashboardLayout user={user} variant="driver" title="My Roster">
        <div className={styles.error}>
          <p>No driver profile found. Please contact admin.</p>
        </div>
      </DashboardLayout>
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
        vehicles:vehicle_id (registration_number, make, model)
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
        vehicles:vehicle_id (registration_number, make, model)
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

  const rosters = Array.from(rostersMap.values()).sort(
    (a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const isToday = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  };

  const isPast = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  return (
    <DashboardLayout user={user} variant="driver" title="My Roster">
      <div className={styles.container}>
        {!rosters || rosters.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 4v6M15 4v6" />
              </svg>
            </div>
            <h3>No Scheduled Shifts</h3>
            <p>You don&apos;t have any shifts scheduled yet. Check back later!</p>
          </div>
        ) : (
          <div className={styles.rosterList}>
            {rosters.map((roster) => (
              <div key={roster.id} className={styles.rosterCard}>
                <div className={styles.rosterHeader}>
                  <h3 className={styles.rosterTitle}>{roster.title}</h3>
                  <span className={styles.weekDates}>
                    {formatDate(roster.week_start)} - {formatDate(roster.week_end)}
                  </span>
                </div>

                <div className={styles.shiftList}>
                  {roster.roster_assignments
                    .sort((a: { assignment_date: string }, b: { assignment_date: string }) => 
                      new Date(a.assignment_date).getTime() - new Date(b.assignment_date).getTime()
                    )
                    .map((assignment: {
                      id: string;
                      assignment_date: string;
                      isSecondary?: boolean;
                      vehicles: {
                        registration_number: string;
                        make: string;
                        model: string;
                      };
                    }) => (
                      <div 
                        key={assignment.id} 
                        className={`${styles.shiftItem} ${isToday(assignment.assignment_date) ? styles.today : ''} ${isPast(assignment.assignment_date) ? styles.past : ''} ${assignment.isSecondary ? styles.secondary : ''}`}
                      >
                        <div className={styles.shiftDate}>
                          {isToday(assignment.assignment_date) && (
                            <span className={styles.todayBadge}>TODAY</span>
                          )}
                          {assignment.isSecondary && (
                            <span className={styles.sharedBadge}>SHARED</span>
                          )}
                          <span className={styles.dateText}>
                            {formatDate(assignment.assignment_date)}
                          </span>
                        </div>
                        <div className={styles.shiftVehicle}>
                          <span className={styles.vehicleReg}>
                            {assignment.vehicles.registration_number}
                          </span>
                          <span className={styles.vehicleModel}>
                            {assignment.vehicles.make} {assignment.vehicles.model}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
