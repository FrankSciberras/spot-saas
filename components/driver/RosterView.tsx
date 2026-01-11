'use client';

import { useState, useEffect } from 'react';
import styles from './RosterView.module.css';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
}

interface Driver {
  id: string;
  full_name: string;
}

interface Assignment {
  id: string;
  assignment_date: string;
  day_of_week: number;
  vehicle_id: string;
  driver_id: string | null;
  secondary_driver_id: string | null;
  vehicles: Vehicle;
  driver: Driver | null;
  secondary_driver: Driver | null;
  isSecondary?: boolean;
}

interface Roster {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  status: string;
  roster_assignments: Assignment[];
}

interface RosterViewProps {
  myRosters: Roster[];
  driverId: string;
}

type ViewMode = 'my-shifts' | 'all-shifts';

export default function RosterView({ myRosters, driverId }: RosterViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('my-shifts');
  const [allRosters, setAllRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    // Only fetch once when switching to all-shifts for the first time
    if (viewMode === 'all-shifts' && !hasFetched) {
      fetchAllShifts();
    }
  }, [viewMode, hasFetched]);

  const fetchAllShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rosters/all-shifts');
      if (res.ok) {
        const data = await res.json();
        setAllRosters(data);
        setHasFetched(true);
      }
    } catch (error) {
      console.error('Error fetching all shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatDayOnly = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { 
      weekday: 'long'
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

  const isMyShift = (assignment: Assignment) => {
    return assignment.driver_id === driverId || assignment.secondary_driver_id === driverId;
  };

  // For all-shifts view, group by date and vehicle (only today and future)
  const getAllShiftsGrouped = () => {
    if (!allRosters.length) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allAssignments: (Assignment & { roster_title: string; week_start: string; week_end: string })[] = [];
    
    allRosters.forEach(roster => {
      roster.roster_assignments.forEach(assignment => {
        // Only include today and future dates
        const assignmentDate = new Date(assignment.assignment_date);
        if (assignmentDate >= today) {
          allAssignments.push({
            ...assignment,
            roster_title: roster.title,
            week_start: roster.week_start,
            week_end: roster.week_end
          });
        }
      });
    });

    // Sort by date
    allAssignments.sort((a, b) => 
      new Date(a.assignment_date).getTime() - new Date(b.assignment_date).getTime()
    );

    // Group by date
    const grouped = new Map<string, typeof allAssignments>();
    allAssignments.forEach(assignment => {
      const date = assignment.assignment_date;
      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(assignment);
    });

    return Array.from(grouped.entries()).map(([date, assignments]) => ({
      date,
      assignments: assignments.sort((a, b) => 
        a.vehicles.registration_number.localeCompare(b.vehicles.registration_number)
      )
    }));
  };

  const renderMyShifts = () => {
    if (!myRosters || myRosters.length === 0) {
      return (
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
      );
    }

    return (
      <div className={styles.rosterList}>
        {myRosters.map((roster) => (
          <div key={roster.id} className={styles.rosterCard}>
            <div className={styles.rosterHeader}>
              <h3 className={styles.rosterTitle}>{roster.title}</h3>
              <span className={styles.weekDates}>
                {formatDate(roster.week_start)} - {formatDate(roster.week_end)}
              </span>
            </div>

            <div className={styles.shiftList}>
              {roster.roster_assignments
                .sort((a, b) => 
                  new Date(a.assignment_date).getTime() - new Date(b.assignment_date).getTime()
                )
                .map((assignment) => (
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
    );
  };

  const renderAllShifts = () => {
    if (loading) {
      return (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading all shifts...</p>
        </div>
      );
    }

    const groupedShifts = getAllShiftsGrouped();

    if (groupedShifts.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 10h18M9 4v6M15 4v6" />
            </svg>
          </div>
          <h3>No Shifts Available</h3>
          <p>There are no published shifts at this time.</p>
        </div>
      );
    }

    return (
      <div className={styles.allShiftsList}>
        {groupedShifts.map(({ date, assignments }) => (
          <div key={date} className={`${styles.dayCard} ${isToday(date) ? styles.todayCard : ''} ${isPast(date) ? styles.pastCard : ''}`}>
            <div className={styles.dayHeader}>
              <div className={styles.dayInfo}>
                {isToday(date) && <span className={styles.todayBadge}>TODAY</span>}
                <span className={styles.dayName}>{formatDayOnly(date)}</span>
                <span className={styles.dayDate}>{formatDate(date)}</span>
              </div>
              <span className={styles.shiftCount}>{assignments.length} vehicle{assignments.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className={styles.vehicleGrid}>
              {assignments.map((assignment) => {
                const isMine = isMyShift(assignment);
                const isUnassigned = !assignment.driver_id;
                
                return (
                  <div 
                    key={assignment.id} 
                    className={`${styles.vehicleCard} ${isMine ? styles.myVehicle : ''} ${isUnassigned ? styles.unassigned : ''}`}
                  >
                    <div className={styles.vehicleHeader}>
                      <span className={styles.vehicleRegAll}>{assignment.vehicles.registration_number}</span>
                      {isMine && <span className={styles.youBadge}>YOU</span>}
                      {isUnassigned && <span className={styles.availableBadge}>AVAILABLE</span>}
                    </div>
                    <span className={styles.vehicleModelAll}>
                      {assignment.vehicles.make} {assignment.vehicles.model}
                    </span>
                    <div className={styles.driverInfo}>
                      {assignment.driver_id ? (
                        <div className={styles.driverRow}>
                          <span className={styles.driverLabel}>Driver:</span>
                          <span className={`${styles.driverName} ${assignment.driver_id === driverId ? styles.isYou : ''}`}>
                            {assignment.driver?.full_name || 'Assigned'}
                          </span>
                        </div>
                      ) : (
                        <div className={styles.driverRow}>
                          <span className={styles.noDriver}>No driver assigned</span>
                        </div>
                      )}
                      {assignment.secondary_driver_id && (
                        <div className={styles.driverRow}>
                          <span className={styles.driverLabel}>Shared:</span>
                          <span className={`${styles.driverName} ${styles.secondaryName} ${assignment.secondary_driver_id === driverId ? styles.isYou : ''}`}>
                            {assignment.secondary_driver?.full_name || 'Assigned'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.filterBar}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${viewMode === 'my-shifts' ? styles.active : ''}`}
            onClick={() => setViewMode('my-shifts')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            My Shifts
          </button>
          <button
            className={`${styles.filterTab} ${viewMode === 'all-shifts' ? styles.active : ''}`}
            onClick={() => setViewMode('all-shifts')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            All Shifts
          </button>
        </div>
      </div>

      {viewMode === 'my-shifts' ? renderMyShifts() : renderAllShifts()}
    </div>
  );
}
