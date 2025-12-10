"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/shared/DatePicker';
import styles from './RosterEditor.module.css';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
}

interface Driver {
  id: string;
  full_name: string;
  phone: string;
}

interface Assignment {
  vehicle_id: string;
  driver_id: string | null;
  secondary_driver_id?: string | null;
  assignment_date: string;
  day_of_week: number;
}

interface Roster {
  id: string;
  week_start: string;
  week_end: string;
  title: string;
  status: 'draft' | 'published';
  notes?: string;
  assignments?: Assignment[];
}

interface RosterEditorProps {
  roster?: Roster;
  vehicles: Vehicle[];
  drivers: Driver[];
  mode: 'create' | 'edit';
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function RosterEditor({ roster, vehicles, drivers, mode }: RosterEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Week selection
  const [weekStart, setWeekStart] = useState<string>(() => {
    if (roster?.week_start) return roster.week_start;
    // Default to next Monday
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split('T')[0];
  });

  const [title, setTitle] = useState(roster?.title || '');
  const [notes, setNotes] = useState(roster?.notes || '');
  
  // Assignments: key is "vehicleId|dayIndex", value is driverId
  // Secondary assignments: key is "vehicleId|dayIndex|secondary", value is driverId
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [showSecondary, setShowSecondary] = useState<Record<string, boolean>>({});

  // Generate dates for the week (use UTC to avoid timezone issues)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const [year, month, day] = weekStart.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + i));
    return {
      date: date.toISOString().split('T')[0],
      day: DAYS[i],
      dayOfMonth: date.getUTCDate(),
      month: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
    };
  });

  // Initialize assignments from existing roster
  useEffect(() => {
    if (roster?.assignments) {
      const assignmentMap: Record<string, string> = {};
      const secondaryMap: Record<string, boolean> = {};
      roster.assignments.forEach(a => {
        if (a.driver_id) {
          assignmentMap[`${a.vehicle_id}|${a.day_of_week}`] = a.driver_id;
        }
        if (a.secondary_driver_id) {
          assignmentMap[`${a.vehicle_id}|${a.day_of_week}|secondary`] = a.secondary_driver_id;
          secondaryMap[`${a.vehicle_id}|${a.day_of_week}`] = true;
        }
      });
      setAssignments(assignmentMap);
      setShowSecondary(secondaryMap);
    }
  }, [roster]);

  // Generate title when week changes
  useEffect(() => {
    if (!roster) {
      const start = new Date(weekStart);
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const startDay = start.getDate();
      const endDay = end.getDate();
      const month = start.toLocaleString('en-US', { month: 'short' }).toUpperCase();
      setTitle(`${startDay}-${endDay} ${month}`);
    }
  }, [weekStart, roster]);

  const handleAssignmentChange = (vehicleId: string, dayIndex: number, driverId: string, isSecondary = false) => {
    const key = isSecondary ? `${vehicleId}|${dayIndex}|secondary` : `${vehicleId}|${dayIndex}`;
    setAssignments(prev => {
      if (driverId === '') {
        const newAssignments = { ...prev };
        delete newAssignments[key];
        return newAssignments;
      }
      return { ...prev, [key]: driverId };
    });
  };

  const toggleSecondaryDriver = (vehicleId: string, dayIndex: number) => {
    const key = `${vehicleId}|${dayIndex}`;
    setShowSecondary(prev => {
      const newState = { ...prev, [key]: !prev[key] };
      // Clear secondary assignment if hiding
      if (!newState[key]) {
        setAssignments(a => {
          const newAssignments = { ...a };
          delete newAssignments[`${key}|secondary`];
          return newAssignments;
        });
      }
      return newState;
    });
  };

  const handleSave = async (publish = false) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Convert assignments to array format
      const assignmentArray: Assignment[] = [];
      
      // Group assignments by vehicle|day
      const groupedAssignments: Record<string, { primary?: string; secondary?: string }> = {};
      
      Object.entries(assignments).forEach(([key, driverId]) => {
        if (!driverId) return;
        
        const isSecondary = key.endsWith('|secondary');
        const baseKey = isSecondary ? key.replace('|secondary', '') : key;
        
        if (!groupedAssignments[baseKey]) {
          groupedAssignments[baseKey] = {};
        }
        
        if (isSecondary) {
          groupedAssignments[baseKey].secondary = driverId;
        } else {
          groupedAssignments[baseKey].primary = driverId;
        }
      });
      
      Object.entries(groupedAssignments).forEach(([key, drivers]) => {
        const separatorIndex = key.lastIndexOf('|');
        if (separatorIndex === -1) return;
        
        const vehicleId = key.substring(0, separatorIndex);
        const dayNum = parseInt(key.substring(separatorIndex + 1));
        
        if (dayNum >= 0 && dayNum < 7 && weekDates[dayNum] && (drivers.primary || drivers.secondary)) {
          assignmentArray.push({
            vehicle_id: vehicleId,
            driver_id: drivers.primary || null,
            secondary_driver_id: drivers.secondary || null,
            assignment_date: weekDates[dayNum].date,
            day_of_week: dayNum,
          });
        }
      });

      if (mode === 'create') {
        // Create new roster
        const createRes = await fetch('/api/rosters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ week_start: weekStart, title, notes }),
        });

        if (!createRes.ok) {
          const data = await createRes.json();
          throw new Error(data.error || 'Failed to create roster');
        }

        const { data: newRoster } = await createRes.json();

        // Update with assignments
        const updateRes = await fetch(`/api/rosters/${newRoster.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments: assignmentArray }),
        });

        if (!updateRes.ok) {
          throw new Error('Failed to save assignments');
        }

        // Publish if requested
        if (publish) {
          const publishRes = await fetch(`/api/rosters/${newRoster.id}/publish`, { method: 'POST' });
          if (!publishRes.ok) {
            const data = await publishRes.json();
            throw new Error(data.error || 'Failed to publish roster');
          }
        }

        setSuccess(publish ? 'Roster published and drivers notified!' : 'Roster saved as draft!');
        setTimeout(() => router.push(`/admin/rosters/${newRoster.id}`), 1500);
      } else {
        // Update existing roster
        const updateRes = await fetch(`/api/rosters/${roster!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, notes, assignments: assignmentArray }),
        });

        if (!updateRes.ok) {
          throw new Error('Failed to update roster');
        }

        // Publish/Republish if requested (always notify drivers)
        if (publish) {
          const publishRes = await fetch(`/api/rosters/${roster!.id}/publish`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ republish: roster!.status === 'published' }),
          });
          if (!publishRes.ok) {
            const data = await publishRes.json();
            throw new Error(data.error || 'Failed to publish');
          }
          setSuccess('Roster published and drivers notified!');
        } else {
          setSuccess('Roster saved successfully!');
        }

        setTimeout(() => {
          router.push(`/admin/rosters/${roster!.id}`);
          router.refresh();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Scroll to top to show error
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.editor}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={() => router.back()} className={styles.backBtn}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>
        <div className={styles.headerRight}>
          <button 
            onClick={() => handleSave(false)} 
            className={styles.saveBtn}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Draft'}
          </button>
          <button 
            onClick={() => handleSave(true)} 
            className={styles.publishBtn}
            disabled={loading}
          >
            {loading ? 'Publishing...' : roster?.status === 'published' ? 'Republish & Notify' : 'Save & Publish'}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error}>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className={styles.success}>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          {success}
        </div>
      )}

      {/* Week Selector */}
      <div className={styles.weekSelector}>
        <div className={styles.weekInputGroup}>
          <label>Week Starting</label>
          <DatePicker
            value={weekStart}
            onChange={setWeekStart}
            disabled={mode === 'edit'}
            placeholder="Select week start"
          />
        </div>
        <div className={styles.weekInputGroup}>
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., 1-7 DEC"
            className={styles.textInput}
          />
        </div>
        <div className={styles.weekInputGroup} style={{ flex: 2 }}>
          <label>Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for this week..."
            className={styles.textInput}
          />
        </div>
      </div>

      {/* Warnings for missing data */}
      {vehicles.length === 0 && (
        <div className={styles.warning}>
          <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>No active vehicles found. Please add vehicles first.</span>
        </div>
      )}

      {drivers.length === 0 && (
        <div className={styles.warning}>
          <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>No active drivers found. Please add drivers first.</span>
        </div>
      )}

      {/* Roster Grid */}
      <div className={styles.gridContainer}>
        <div className={styles.grid}>
          {/* Header Row */}
          <div className={styles.gridHeader}>
            <div className={styles.vehicleHeader}>Vehicle</div>
            {weekDates.map((d, i) => (
              <div key={i} className={styles.dayHeader}>
                <span className={styles.dayName}>{d.day}</span>
                <span className={styles.dayDate}>{d.dayOfMonth}/{d.month}</span>
              </div>
            ))}
          </div>

          {/* Vehicle Rows */}
          {vehicles.length === 0 ? (
            <div className={styles.emptyRow}>
              <span>No vehicles to display</span>
            </div>
          ) : (
            vehicles.map((vehicle) => (
              <div key={vehicle.id} className={styles.gridRow}>
                <div className={styles.vehicleCell}>
                  <span className={styles.vehicleReg}>{vehicle.registration_number}</span>
                  <span className={styles.vehicleModel}>{vehicle.make} {vehicle.model}</span>
                </div>
                {weekDates.map((_, dayIndex) => {
                  const cellKey = `${vehicle.id}|${dayIndex}`;
                  const assignedDriver = assignments[cellKey];
                  const secondaryDriver = assignments[`${cellKey}|secondary`];
                  const hasSecondary = showSecondary[cellKey];
                  return (
                    <div key={dayIndex} className={styles.assignmentCell} data-day={weekDates[dayIndex].day}>
                      <div className={styles.driverSlot}>
                        <select
                          value={assignedDriver || ''}
                          onChange={(e) => handleAssignmentChange(vehicle.id, dayIndex, e.target.value)}
                          className={`${styles.driverSelect} ${assignedDriver ? styles.hasDriver : ''}`}
                          disabled={drivers.length === 0}
                        >
                          <option value="">-</option>
                          {drivers.map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.full_name}
                            </option>
                          ))}
                        </select>
                        {!hasSecondary && assignedDriver && (
                          <button
                            type="button"
                            className={styles.addSecondaryBtn}
                            onClick={() => toggleSecondaryDriver(vehicle.id, dayIndex)}
                            title="Add second driver"
                          >
                            +
                          </button>
                        )}
                      </div>
                      {hasSecondary && (
                        <div className={styles.driverSlot}>
                          <select
                            value={secondaryDriver || ''}
                            onChange={(e) => handleAssignmentChange(vehicle.id, dayIndex, e.target.value, true)}
                            className={`${styles.driverSelect} ${styles.secondarySelect} ${secondaryDriver ? styles.hasDriver : ''}`}
                            disabled={drivers.length === 0}
                          >
                            <option value="">-</option>
                            {drivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.full_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={styles.removeSecondaryBtn}
                            onClick={() => toggleSecondaryDriver(vehicle.id, dayIndex)}
                            title="Remove second driver"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.assigned}`}></div>
          <span>Driver Assigned</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.unassigned}`}></div>
          <span>No Driver</span>
        </div>
        <div className={styles.legendStats}>
          <span>{vehicles.length} vehicles</span>
          <span>•</span>
          <span>{drivers.length} drivers</span>
        </div>
      </div>
    </div>
  );
}
