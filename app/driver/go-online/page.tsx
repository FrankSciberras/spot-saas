'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './go-online.module.css';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  assigned_driver_id?: string | null;
}

interface DriverInfo {
  id: string;
  full_name: string;
  assigned_vehicle_id: string | null;
}

/**
 * Go Online Page - Driver shift start form
 * Allows drivers to start their shift by filling out vehicle details and uploading images
 */
export default function GoOnlinePage() {
  const router = useRouter();
  const supabase = createClient();

  // Form state
  const [name, setName] = useState('');
  const [mileage, setMileage] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [dashcamChecked, setDashcamChecked] = useState(false);
  const [carInternalChecked, setCarInternalChecked] = useState(false);
  const [checklistError, setChecklistError] = useState('');

  // Image files
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [leftImage, setLeftImage] = useState<File | null>(null);
  const [rightImage, setRightImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [damageImages, setDamageImages] = useState<File[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  
  // Ref to prevent double submissions (more reliable than state for race conditions)
  const isSubmitting = useRef(false);

  // Load vehicles and driver info on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          console.error('Auth error:', authError);
          setError('Session expired. Please log in again.');
          setInitialLoading(false);
          setTimeout(() => router.push('/login'), 2000);
          return;
        }
        if (!user) {
          router.push('/login');
          return;
        }

        // Get driver info
        const { data: driver } = await supabase
          .from('drivers')
          .select('id, full_name, assigned_vehicle_id')
          .eq('user_id', user.id)
          .single();

        if (driver) {
          setDriverInfo(driver);
          setName(driver.full_name);
          if (driver.assigned_vehicle_id) {
            setVehicleId(driver.assigned_vehicle_id);
          }
        }

        if (driver) {
          const { data: assignments } = await supabase
            .from('driver_vehicle_assignments')
            .select(`
              vehicle_id,
              vehicles:vehicle_id (id, registration_number, make, model, status)
            `)
            .eq('driver_id', driver.id);

          const normalizeVehicle = (v: unknown): { id: string; registration_number: string; make: string; model: string; status?: string } | null => {
            if (!v) return null;
            if (Array.isArray(v)) {
              return (v[0] as { id: string; registration_number: string; make: string; model: string; status?: string } | undefined) || null;
            }
            return v as { id: string; registration_number: string; make: string; model: string; status?: string };
          };

          const typedAssignments = (assignments || []) as Array<{ vehicles?: unknown }>;
          const assignedVehicles = typedAssignments.map((a) => normalizeVehicle(a.vehicles)).filter(Boolean);

          if (assignedVehicles.length > 0) {
            setVehicles(assignedVehicles as unknown as Vehicle[]);
            setVehicleId((assignedVehicles[0] as { id: string }).id);
          } else {
            const { data: allVehicles } = await supabase
              .from('vehicles')
              .select('id, registration_number, make, model, assigned_driver_id, status')
              .order('registration_number');

            if (allVehicles) {
              const driverVehicles = allVehicles.filter(
                v => v.assigned_driver_id === driver.id || v.id === driver.assigned_vehicle_id
              );

              if (driverVehicles.length > 0) {
                setVehicles(driverVehicles);
                setVehicleId(driverVehicles[0].id);
              } else {
                const activeVehicles = allVehicles.filter(v => v.status === 'active');
                setVehicles(activeVehicles);
              }
            }
          }
        } else {
          const { data: allVehicles } = await supabase
            .from('vehicles')
            .select('id, registration_number, make, model, assigned_driver_id, status')
            .order('registration_number');

          if (allVehicles) {
            const activeVehicles = allVehicles.filter(v => v.status === 'active');
            setVehicles(activeVehicles);
          }
        }

        // Set default start time to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setStartTime(now.toISOString().slice(0, 16));
      } catch (err) {
        console.error('Error loading go-online data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data. Please refresh the page.');
      } finally {
        setInitialLoading(false);
      }
    };

    loadData();
  }, [supabase, router]);

  const handleFileChange = (
    setter: React.Dispatch<React.SetStateAction<File | null>>
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setter(file);
  };

  const handleMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setDamageImages(files);
  };

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('shift-images')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('shift-images')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submissions using ref (more reliable than state for fast clicks)
    if (isSubmitting.current) {
      console.log('Submission already in progress, ignoring duplicate click');
      return;
    }
    isSubmitting.current = true;
    
    setError('');
    setChecklistError('');
    setLoading(true);

    try {
      if (!driverInfo) {
        throw new Error('Driver profile not found');
      }

      if (!vehicleId) {
        throw new Error('Please select a vehicle');
      }

      if (!mileage || isNaN(Number(mileage))) {
        throw new Error('Please enter a valid mileage');
      }

      if (!dashcamChecked || !carInternalChecked) {
        const msg =
          'Mandatory: Before going online you must complete the pre-shift checks and confirm the vehicle is in good condition (internal & external). If you proceed without checking and reporting issues/damage, you will be held liable for any unreported damage/issues.';
        setChecklistError(msg);
        throw new Error(msg);
      }

      // Upload images
      let frontUrl = null;
      let leftUrl = null;
      let rightUrl = null;
      let backUrl = null;

      if (frontImage) {
        frontUrl = await uploadImage(frontImage, 'front');
      }
      if (leftImage) {
        leftUrl = await uploadImage(leftImage, 'left');
      }
      if (rightImage) {
        rightUrl = await uploadImage(rightImage, 'right');
      }
      if (backImage) {
        backUrl = await uploadImage(backImage, 'back');
      }

      const damageUrls: string[] = [];
      for (const f of damageImages) {
        const url = await uploadImage(f, 'damage');
        if (url) damageUrls.push(url);
      }

      // Create shift record
      const { error: insertError } = await supabase
        .from('driver_shifts')
        .insert({
          driver_id: driverInfo.id,
          vehicle_id: vehicleId,
          name: name,
          starting_mileage: parseInt(mileage, 10),
          start_time: new Date(startTime).toISOString(),
          front_image_url: frontUrl,
          left_image_url: leftUrl,
          right_image_url: rightUrl,
          back_image_url: backUrl,
          dashcam_checked: dashcamChecked,
          car_internal_checked: carInternalChecked,
          notes: damageUrls.length ? JSON.stringify({ damage_image_urls: damageUrls }) : null,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Update vehicle mileage via API (bypasses RLS restrictions for drivers)
      const mileageRes = await fetch(`/api/vehicles/${vehicleId}/mileage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mileage: parseInt(mileage, 10) }),
      });
      
      if (!mileageRes.ok) {
        const mileageError = await mileageRes.json();
        console.error('Failed to update vehicle mileage:', mileageError);
        // Don't fail the shift - just log the error
      }

      // Check if vehicle service is due (triggers automated alert if needed)
      try {
        await fetch('/api/shifts/check-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: vehicleId,
            current_mileage: parseInt(mileage, 10),
          }),
        });
      } catch (checkError) {
        // Non-blocking - don't fail the shift creation if service check fails
        console.error('Service check failed:', checkError);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/driver/shifts');
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      // Reset submission lock on error so user can try again
      isSubmitting.current = false;
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>⏳</div>
          <h2>Loading...</h2>
          <p>Preparing your shift form</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>✓</div>
          <h2>You&apos;re Online!</h2>
          <p>Your shift has been recorded successfully.</p>
          <p className={styles.successSub}>Redirecting to shifts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <Link href="/driver" className={styles.backBtn}>
          ←
        </Link>
        <h1>Start Shift</h1>
        <div className={styles.headerSpacer} />
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && (
          <div className={styles.errorMsg}>
            {error}
          </div>
        )}

        {/* Vehicle Selection */}
        <section className={styles.section}>
          <h2>Vehicle</h2>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className={styles.select}
            required
          >
            <option value="">Select your vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registration_number} - {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
        </section>

        {/* Mileage */}
        <section className={styles.section}>
          <h2>Current Mileage</h2>
          <div className={styles.inputWrapper}>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="Enter current mileage"
              className={styles.input}
              required
              min="0"
              inputMode="numeric"
            />
            <span className={styles.inputSuffix}>km</span>
          </div>
        </section>

        {/* Vehicle Photos */}
        <section className={styles.section}>
          <h2>Vehicle Photos</h2>
          <p className={styles.sectionHint}>Take photos of all sides of the vehicle</p>
          
          <div className={styles.photoGrid}>
            <label className={`${styles.photoBox} ${frontImage ? styles.hasPhoto : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange(setFrontImage)}
              />
              <span className={styles.photoIcon}>{frontImage ? '✓' : '📷'}</span>
              <span className={styles.photoLabel}>Front</span>
            </label>

            <label className={`${styles.photoBox} ${leftImage ? styles.hasPhoto : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange(setLeftImage)}
              />
              <span className={styles.photoIcon}>{leftImage ? '✓' : '📷'}</span>
              <span className={styles.photoLabel}>Left</span>
            </label>

            <label className={`${styles.photoBox} ${rightImage ? styles.hasPhoto : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange(setRightImage)}
              />
              <span className={styles.photoIcon}>{rightImage ? '✓' : '📷'}</span>
              <span className={styles.photoLabel}>Right</span>
            </label>

            <label className={`${styles.photoBox} ${backImage ? styles.hasPhoto : ''}`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange(setBackImage)}
              />
              <span className={styles.photoIcon}>{backImage ? '✓' : '📷'}</span>
              <span className={styles.photoLabel}>Back</span>
            </label>
          </div>
        </section>

        {/* Checklist */}
        <section className={styles.section}>
          <h2>Pre-Shift Checklist</h2>
          
          <label className={styles.checkItem}>
            <input
              type="checkbox"
              checked={dashcamChecked}
              onChange={(e) => setDashcamChecked(e.target.checked)}
            />
            <span className={styles.checkBox}>
              {dashcamChecked && '✓'}
            </span>
            <span className={styles.checkText}>Dashcam working & positioned</span>
          </label>

          <label className={styles.checkItem}>
            <input
              type="checkbox"
              checked={carInternalChecked}
              onChange={(e) => setCarInternalChecked(e.target.checked)}
            />
            <span className={styles.checkBox}>
              {carInternalChecked && '✓'}
            </span>
            <span className={styles.checkText}>Interior clean & no damage</span>
          </label>

          {(!dashcamChecked || !carInternalChecked) && (
            <div className={styles.mandatoryNote}>
              Mandatory: You must check the vehicle internally & externally and confirm everything is in good condition before proceeding. If you proceed without checking and reporting issues/damage, you will be held liable for any unreported damage/issues.
            </div>
          )}

          {checklistError && <div className={styles.mandatoryError}>{checklistError}</div>}
        </section>

        <section className={styles.section}>
          <h2>Scratches / Damage (Optional)</h2>
          <p className={styles.sectionHint}>Upload any photos of scratches/damage you notice before starting</p>

          <label className={`${styles.damageBox} ${damageImages.length > 0 ? styles.hasDamage : ''}`}>
            <input type="file" accept="image/*" multiple onChange={handleMultiFileChange} />
            <span className={styles.damageIcon}>{damageImages.length > 0 ? '✓' : '📷'}</span>
            <span className={styles.damageLabel}>
              {damageImages.length > 0 ? `${damageImages.length} photo${damageImages.length === 1 ? '' : 's'} selected` : 'Add damage photos'}
            </span>
          </label>
        </section>

        {/* Submit */}
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={loading || !vehicleId || !mileage || !dashcamChecked || !carInternalChecked}
        >
          {loading ? 'Starting...' : 'Start Shift'}
        </button>
      </form>
    </div>
  );
}
