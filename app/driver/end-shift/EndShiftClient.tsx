'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useFleetSettings } from '@/components/fleet/FleetSettingsProvider';
import styles from './end-shift.module.css';

interface Props {
  shiftId: string;
  startTime: string;
  startingMileage: number;
  vehicleLabel: string;
  timeZone: string;
}

const MAX_PHOTOS = 6;

export default function EndShiftClient({ startTime, startingMileage, vehicleLabel, timeZone }: Props) {
  const router = useRouter();
  // Fleet rules for ending a shift (Settings → Shifts → Ending a shift).
  const fleet = useFleetSettings();
  const mileageRequired = fleet['shifts.end_mileage'] === 'required';
  const photoRule = fleet['shifts.end_photos'];
  const [endingMileage, setEndingMileage] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);

  const startedLabel = new Date(startTime).toLocaleString('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const enteredKm = parseInt(endingMileage, 10);
  const distance = Number.isFinite(enteredKm) && enteredKm >= startingMileage ? enteredKm - startingMileage : null;

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const supabase = createClient();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `end/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('shift-images').upload(path, file);
    if (uploadError) {
      console.error('End-shift photo upload failed:', uploadError);
      return null;
    }
    // Stored like the start-of-shift photos: the server signs it on display.
    const { data } = supabase.storage.from('shift-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setError('');

    const hasKm = endingMileage.trim() !== '';
    if ((mileageRequired || hasKm) && (!Number.isFinite(enteredKm) || enteredKm < 0)) {
      setError('Enter the odometer reading shown on the dashboard.');
      return;
    }
    if (hasKm && enteredKm < startingMileage) {
      setError(`The reading cannot be lower than the ${startingMileage.toLocaleString()} km you started with.`);
      return;
    }
    if (photoRule === 'required' && photos.length === 0) {
      setError('Your fleet needs at least one photo of the car before you end the shift.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of photos.slice(0, MAX_PHOTOS)) {
        const url = await uploadPhoto(file);
        if (url) urls.push(url);
      }

      const res = await fetch('/api/shifts/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ending_mileage: hasKm ? enteredKm : null, end_image_urls: urls }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Could not end the shift. Please try again.');
      }

      // Stop background location in the Rovora Driver app (no-op in a browser).
      const native = (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView;
      if (native) native.postMessage(JSON.stringify({ type: 'stop-tracking' }));

      setDone(true);
      setTimeout(() => {
        router.push('/driver');
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not end the shift. Please try again.');
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>Shift ended</h2>
        <p className={styles.muted}>
          {distance !== null ? `${distance.toLocaleString()} km driven. ` : ''}Thanks — see you next shift.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <h2 className={styles.title}>End your shift</h2>
      <dl className={styles.summary}>
        <div>
          <dt>Vehicle</dt>
          <dd>{vehicleLabel}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{startedLabel}</dd>
        </div>
        <div>
          <dt>Starting odometer</dt>
          <dd>{startingMileage.toLocaleString()} km</dd>
        </div>
      </dl>

      <label className={styles.field}>
        <span>Odometer now (km){mileageRequired ? '' : ' — optional'}</span>
        <input
          type="number"
          inputMode="numeric"
          min={startingMileage}
          step={1}
          value={endingMileage}
          onChange={(e) => setEndingMileage(e.target.value)}
          placeholder={`At least ${startingMileage.toLocaleString()}`}
          required={mileageRequired}
          autoFocus
        />
        {distance !== null && <small className={styles.hint}>{distance.toLocaleString()} km this shift</small>}
      </label>

      {photoRule !== 'off' && (
      <label className={styles.field}>
        <span>Photos of the car ({photoRule === 'required' ? 'at least 1' : 'optional'}, up to {MAX_PHOTOS})</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, MAX_PHOTOS))}
        />
        {photos.length > 0 && <small className={styles.hint}>{photos.length} photo{photos.length === 1 ? '' : 's'} selected</small>}
      </label>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.actions}>
        <Link href="/driver" className={styles.secondaryLink}>Not yet</Link>
        <button type="submit" className={styles.primaryBtn} disabled={busy || (mileageRequired && !endingMileage) || (photoRule === 'required' && photos.length === 0)}>
          {busy ? 'Ending…' : 'End shift'}
        </button>
      </div>
    </form>
  );
}
