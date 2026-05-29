'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from '@/components/admin/AdminForms.module.css';

interface ShiftData {
  id: string;
  name: string;
  starting_mileage: number;
  start_time: string;
  end_time: string | null;
  dashcam_checked: boolean;
  car_internal_checked: boolean;
  notes: string | null;
  driver_id: string;
  vehicle_id: string;
  drivers: { id: string; full_name: string } | null;
  vehicles: { id: string; registration_number: string; make: string; model: string } | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit Shift Page - Admin can correct shift data (mileage, times, etc.)
 */
export default function EditShiftPage({ params }: PageProps) {
  const router = useRouter();
  const supabase = createClient();

  const [shiftId, setShiftId] = useState<string>('');
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [startingMileage, setStartingMileage] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [dashcamChecked, setDashcamChecked] = useState(false);
  const [carInternalChecked, setCarInternalChecked] = useState(false);
  const [notes, setNotes] = useState('');

  // Get params
  useEffect(() => {
    params.then(p => setShiftId(p.id));
  }, [params]);

  // Load shift data
  useEffect(() => {
    if (!shiftId) return;

    const loadShift = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('driver_shifts')
          .select(`
            *,
            drivers:driver_id (id, full_name),
            vehicles:vehicle_id (id, registration_number, make, model)
          `)
          .eq('id', shiftId)
          .single();

        if (fetchError || !data) {
          setError('Shift not found');
          return;
        }

        const shiftData = data as ShiftData;
        setShift(shiftData);
        
        // Populate form
        setName(shiftData.name);
        setStartingMileage(shiftData.starting_mileage.toString());
        setStartTime(formatDateTimeLocal(shiftData.start_time));
        setEndTime(shiftData.end_time ? formatDateTimeLocal(shiftData.end_time) : '');
        setDashcamChecked(shiftData.dashcam_checked);
        setCarInternalChecked(shiftData.car_internal_checked);
        setNotes(shiftData.notes || '');
      } catch (err) {
        setError('Failed to load shift');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadShift();
  }, [shiftId, supabase]);

  const formatDateTimeLocal = (dateStr: string) => {
    const date = new Date(dateStr);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const mileage = parseInt(startingMileage, 10);
      if (isNaN(mileage) || mileage < 0) {
        throw new Error('Please enter a valid mileage');
      }

      const updateData: Record<string, unknown> = {
        name,
        starting_mileage: mileage,
        start_time: new Date(startTime).toISOString(),
        dashcam_checked: dashcamChecked,
        car_internal_checked: carInternalChecked,
        notes: notes || null,
      };

      // Only update end_time if provided
      if (endTime) {
        updateData.end_time = new Date(endTime).toISOString();
      } else {
        updateData.end_time = null;
      }

      const { error: updateError } = await supabase
        .from('driver_shifts')
        .update(updateData)
        .eq('id', shiftId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccess('Shift updated successfully');
      setTimeout(() => {
        router.push(`/fleet/shifts/${shiftId}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.form} style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading shift...</p>
      </div>
    );
  }

  if (!shift) {
    return (
      <div className={styles.form} style={{ padding: '40px', textAlign: 'center' }}>
        <p>Shift not found</p>
        <Link href="/fleet/shifts" className="btn btn-primary" style={{ marginTop: '16px' }}>
          Back to Shifts
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href={`/fleet/shifts/${shiftId}`} className={styles.backButton} aria-label="Back">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>Edit Shift</h2>
            <span className={styles.subtitle}>
              <span className="badge badge-info">Editing</span>
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                {shift.drivers?.full_name} • {shift.vehicles?.registration_number}
              </span>
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" style={{ marginBottom: '16px' }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className={styles.formSection}>
          <h3>Shift Details</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Name on Shift</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Starting Mileage (km)</label>
              <input
                type="number"
                value={startingMileage}
                onChange={(e) => setStartingMileage(e.target.value)}
                min="0"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>End Time (leave empty if still active)</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className={styles.formSection}>
          <h3>Pre-Shift Checks</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={dashcamChecked}
                  onChange={(e) => setDashcamChecked(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Dashcam Checked
              </label>
            </div>

            <div className={styles.formGroup}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={carInternalChecked}
                  onChange={(e) => setCarInternalChecked(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Car Internal Checked
              </label>
            </div>
          </div>
        </div>

        <div className={styles.formSection}>
          <h3>Notes</h3>
          <div className={styles.formGroup}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this shift..."
              rows={4}
            />
          </div>
        </div>

        <div className={styles.formActions}>
          <Link href={`/fleet/shifts/${shiftId}`} className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
