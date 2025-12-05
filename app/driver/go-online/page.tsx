'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

  // Image files
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [leftImage, setLeftImage] = useState<File | null>(null);
  const [rightImage, setRightImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);

  // Load vehicles and driver info on mount
  useEffect(() => {
    const loadData = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
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

      // Get ALL vehicles (including ones assigned to this driver regardless of status)
      const { data: allVehicles } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model, assigned_driver_id, status')
        .order('registration_number');

      if (allVehicles && driver) {
        // First, find vehicles specifically assigned to this driver (any status)
        const driverVehicles = allVehicles.filter(
          v => v.assigned_driver_id === driver.id || v.id === driver.assigned_vehicle_id
        );
        
        // If driver has assigned vehicles, show those; otherwise show all active vehicles
        if (driverVehicles.length > 0) {
          setVehicles(driverVehicles);
          // Auto-select the first assigned vehicle
          setVehicleId(driverVehicles[0].id);
        } else {
          // No assigned vehicles, show all active ones
          const activeVehicles = allVehicles.filter(v => v.status === 'active');
          setVehicles(activeVehicles);
        }
      } else if (allVehicles) {
        const activeVehicles = allVehicles.filter(v => v.status === 'active');
        setVehicles(activeVehicles);
      }

      // Set default start time to now
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setStartTime(now.toISOString().slice(0, 16));
    };

    loadData();
  }, [supabase, router]);

  const handleFileChange = (
    setter: React.Dispatch<React.SetStateAction<File | null>>
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setter(file);
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
    setError('');
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
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✅</span>
          <h2>You are now online!</h2>
          <p>Your shift has been recorded successfully.</p>
          <p>Redirecting to your shifts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className="btn btn-outline">
          ← Back
        </button>
        <h1>Go Online</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h3>Shift Details</h3>
          </div>
          <div className="card-body">
            <div className={styles.formGrid}>
              <div className="form-group">
                <label htmlFor="name" className="form-label">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="vehicle" className="form-label">
                  Vehicle
                </label>
                <select
                  id="vehicle"
                  className="form-select"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  required
                >
                  <option value="">– Select Vehicle –</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration_number} - {vehicle.make} {vehicle.model}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="mileage" className="form-label">
                  Mileage (km)
                </label>
                <input
                  id="mileage"
                  type="number"
                  className="form-input"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  placeholder="Enter the mileage before the shift"
                  required
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="startTime" className="form-label">
                  Start Time
                </label>
                <input
                  id="startTime"
                  type="datetime-local"
                  className="form-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Vehicle Images</h3>
          </div>
          <div className="card-body">
            <div className={styles.imageGrid}>
              <div className={styles.imageUpload}>
                <label htmlFor="frontImage" className="form-label">
                  Front Image
                </label>
                <input
                  id="frontImage"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange(setFrontImage)}
                  className={styles.fileInput}
                />
                {frontImage && (
                  <p className={styles.fileName}>📷 {frontImage.name}</p>
                )}
              </div>

              <div className={styles.imageUpload}>
                <label htmlFor="leftImage" className="form-label">
                  Left Side (Driver Side)
                </label>
                <input
                  id="leftImage"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange(setLeftImage)}
                  className={styles.fileInput}
                />
                {leftImage && (
                  <p className={styles.fileName}>📷 {leftImage.name}</p>
                )}
              </div>

              <div className={styles.imageUpload}>
                <label htmlFor="rightImage" className="form-label">
                  Right Side (Passenger Side)
                </label>
                <input
                  id="rightImage"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange(setRightImage)}
                  className={styles.fileInput}
                />
                {rightImage && (
                  <p className={styles.fileName}>📷 {rightImage.name}</p>
                )}
              </div>

              <div className={styles.imageUpload}>
                <label htmlFor="backImage" className="form-label">
                  Back Image
                </label>
                <input
                  id="backImage"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange(setBackImage)}
                  className={styles.fileInput}
                />
                {backImage && (
                  <p className={styles.fileName}>📷 {backImage.name}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Checks</h3>
          </div>
          <div className="card-body">
            <div className={styles.checksGrid}>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={dashcamChecked}
                  onChange={(e) => setDashcamChecked(e.target.checked)}
                />
                <span>Dashcam is working and properly positioned</span>
              </label>

              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={carInternalChecked}
                  onChange={(e) => setCarInternalChecked(e.target.checked)}
                />
                <span>Car internal condition checked (clean, no damage)</span>
              </label>
            </div>
          </div>
        </div>

        <div className={styles.submitSection}>
          <button
            type="submit"
            className={`btn btn-primary btn-lg ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Submitting...
              </>
            ) : (
              '🟢 Go Online'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
