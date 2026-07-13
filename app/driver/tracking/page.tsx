'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './tracking.module.css';

interface DriverRow {
  id: string;
  organization_id: string;
}

const POSITION_INTERVAL_MS = 8_000;   // upsert latest position at most this often
const HISTORY_INTERVAL_MS = 60_000;   // append a history point at most this often

/**
 * Share Location.
 * - Inside the Rovora Driver app (WebView): commands the native shell over the
 *   message bridge, which runs true background tracking via the OS.
 * - In a regular browser: falls back to browser geolocation while the page is open.
 */
export default function DriverTrackingPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  const [nativeMode, setNativeMode] = useState(false);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionSentRef = useRef(0);
  const lastHistorySentRef = useRef(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const batteryRef = useRef<{ level: number; charging: boolean } | null>(null);

  // Battery Status API is Chromium-only — ride along where available.
  useEffect(() => {
    const getBattery = (navigator as any).getBattery?.bind(navigator);
    if (!getBattery) return;
    let battery: any;
    const sync = () => {
      batteryRef.current = { level: battery.level, charging: battery.charging };
    };
    getBattery().then((b: any) => {
      battery = b;
      sync();
      battery.addEventListener('levelchange', sync);
      battery.addEventListener('chargingchange', sync);
    }).catch(() => {});
    return () => {
      battery?.removeEventListener('levelchange', sync);
      battery?.removeEventListener('chargingchange', sync);
    };
  }, []);

  // Native app mode: listen for tracking status from the shell.
  useEffect(() => {
    const native = (window as any).ReactNativeWebView;
    if (!native) return;
    setNativeMode(true);
    const onStatus = (e: Event) => {
      try {
        const status = JSON.parse((e as CustomEvent).detail as string) as {
          tracking: boolean;
          lastSentAt: string | null;
          error: string | null;
        };
        setSharing(status.tracking);
        setLastSentAt(status.lastSentAt ? new Date(status.lastSentAt) : null);
        setError(status.error || '');
      } catch {
        // ignore malformed status
      }
    };
    window.addEventListener('rovora-native', onStatus);
    native.postMessage(JSON.stringify({ type: 'get-status' }));
    return () => window.removeEventListener('rovora-native', onStatus);
  }, []);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();
      if (!driverRow) {
        setError('Driver profile not found. Please contact your fleet administrator.');
        setLoading(false);
        return;
      }
      setDriver(driverRow);
      const { data: shift } = await supabase
        .from('driver_shifts')
        .select('id')
        .eq('driver_id', driverRow.id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      setShiftId(shift?.id || null);
      setLoading(false);
    };
    load();
  }, [router]);

  const sendFix = async (pos: GeolocationPosition) => {
    if (!driver) return;
    const now = Date.now();
    const supabase = supabaseRef.current;
    const point = {
      driver_id: driver.id,
      organization_id: driver.organization_id,
      shift_id: shiftId,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy * 100) / 100 : null,
      heading: pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
      speed: pos.coords.speed != null && !isNaN(pos.coords.speed) ? pos.coords.speed : null,
      recorded_at: new Date(pos.timestamp).toISOString(),
    };

    if (now - lastPositionSentRef.current >= POSITION_INTERVAL_MS) {
      lastPositionSentRef.current = now;
      // Battery only — GPS/permission health is reported by the native app;
      // sending browser values here would trigger false "permission lost" alerts.
      const battery = batteryRef.current;
      const { error: upsertError } = await supabase
        .from('driver_positions')
        .upsert(
          {
            ...point,
            is_tracking: true,
            battery_pct: battery ? Math.round(battery.level * 100) : null,
            battery_charging: battery ? battery.charging : null,
          },
          { onConflict: 'driver_id' }
        );
      if (upsertError) {
        setError(`Failed to send location: ${upsertError.message}`);
        return;
      }
      setError('');
      setLastSentAt(new Date());
      setPointCount((c) => c + 1);
    }

    if (now - lastHistorySentRef.current >= HISTORY_INTERVAL_MS) {
      lastHistorySentRef.current = now;
      await supabase.from('driver_locations').insert(point);
    }
  };

  const start = () => {
    setError('');
    if (nativeMode) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'start-tracking' }));
      return;
    }
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { void sendFix(pos); },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Allow location access for this site in your browser settings, then try again.');
        } else {
          setError(`Location error: ${err.message}`);
        }
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
    );
    setSharing(true);
    // Best effort: keep the screen awake so the browser keeps reporting.
    try {
      (navigator as any).wakeLock?.request('screen').then((lock: any) => {
        wakeLockRef.current = lock;
      });
    } catch { /* unsupported browser — sharing still works while the screen is on */ }
  };

  const stop = () => {
    if (nativeMode) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'stop-tracking' }));
      return;
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setSharing(false);
    lastPositionSentRef.current = 0;
    lastHistorySentRef.current = 0;
    if (driver) {
      void supabaseRef.current
        .from('driver_positions')
        .update({ is_tracking: false })
        .eq('driver_id', driver.id);
    }
  };

  // Stop the browser GPS watch if the driver navigates away (native keeps going).
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  if (loading) {
    return (
      <div className={`fleetSolo ${styles.page}`}>
        <div className={styles.card}>
          <p className={styles.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fleetSolo ${styles.page}`}>
      <header className={styles.header}>
        <Link href="/driver" className={styles.backBtn}>←</Link>
        <h1>Share Location</h1>
        <div className={styles.headerSpacer} />
      </header>

      <div className={styles.card}>
        <div className={`${styles.statusRing} ${sharing ? styles.statusRingOn : ''}`}>
          <div className={`${styles.statusDot} ${sharing ? styles.statusDotOn : ''}`} />
        </div>
        <h2 className={styles.statusTitle}>{sharing ? 'Sharing your location' : 'Location sharing is off'}</h2>
        <p className={styles.muted}>
          {sharing
            ? nativeMode
              ? 'Your fleet can see your live position — it keeps working with the screen off or while using other apps.'
              : 'Your fleet can see your live position on the map. Keep this page open while you drive.'
            : 'Sharing starts automatically when you start a shift and stops when you end it. You can also start or stop it manually here.'}
        </p>

        {shiftId === null && !sharing && (
          <p className={styles.hint}>No active shift found — you can still share, but starting a shift first links your route to it.</p>
        )}

        {error && <div className={styles.errorMsg}>{error}</div>}

        {sharing && (
          <div className={styles.stats}>
            <div>
              <span className={styles.statValue}>{lastSentAt ? lastSentAt.toLocaleTimeString() : '—'}</span>
              <span className={styles.statLabel}>Last update</span>
            </div>
            {!nativeMode && (
              <div>
                <span className={styles.statValue}>{pointCount}</span>
                <span className={styles.statLabel}>Updates sent</span>
              </div>
            )}
          </div>
        )}

        <button
          className={`${styles.toggleBtn} ${sharing ? styles.toggleBtnStop : ''}`}
          onClick={sharing ? stop : start}
          disabled={!driver && !nativeMode}
        >
          {sharing ? 'Stop sharing' : 'Start sharing'}
        </button>

        <p className={styles.footnote}>
          {nativeMode
            ? 'Sharing keeps running in the background until you stop it. Only your fleet’s staff can see your location.'
            : 'Sharing stops automatically if you close this page. Only your fleet’s staff can see your location.'}
        </p>
      </div>
    </div>
  );
}
