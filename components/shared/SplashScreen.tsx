'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isAppRoute } from '@/lib/routes';
import styles from './SplashScreen.module.css';

interface SplashScreenProps {
  children: React.ReactNode;
}

/*
 * ONLY the signed-in app gets the boot splash (see isAppRoute).
 *
 * This used to be the other way round — an allow-list naming just `/` and
 * `/login` as "public". Every other marketing page (/about, /pricing,
 * /features/*, /blog/*, …) therefore server-rendered its content inside
 * `visibility:hidden; position:absolute` behind a full-screen spinner, and only
 * revealed it after hydration + an /api/health round-trip + an artificial 800ms
 * floor. That put the largest contentful paint of every landing page behind a
 * network call, and showed visitors a loading screen on pages that are fully
 * static. Marketing pages must paint immediately.
 */

type LoadingStatus = 'initializing' | 'service-worker' | 'backend' | 'ready' | 'error';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BACKEND_TIMEOUT = 8000;
// Long enough for the logo reveal (1.05s in the stylesheet) to finish before the
// splash starts fading out, plus a beat on the finished lockup. Shorten both
// together, or the animation gets cut off mid-slide.
const MIN_SPLASH_TIME = 1250;

export default function SplashScreen({ children }: SplashScreenProps) {
  const pathname = usePathname();
  const publicRoute = !isAppRoute(pathname);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<LoadingStatus>('initializing');
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  // Was the previous route inside the app? `null` = first render of this page
  // load, which counts as arriving from outside. This is what makes the splash
  // play on rovora.eu -> /dashboard but stay out of the way on /fleet -> /fleet/vehicles.
  const cameFromApp = useRef<boolean | null>(null);

  // Check if service worker is ready
  const waitForServiceWorker = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) {
      // No service worker support, continue anyway
      return true;
    }

    try {
      // Wait for service worker to be ready (with timeout)
      const swReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      
      return swReady !== null;
    } catch {
      return false;
    }
  }, []);

  // Health check with retry logic
  const checkBackendHealth = useCallback(async (): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT);

    try {
      // Use a lightweight endpoint to check if backend is up
      const response = await fetch('/api/health', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // If aborted due to timeout, try a simpler check
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Splash] Backend check timed out, will retry...');
      }
      return false;
    }
  }, []);

  // Main initialization sequence
  const initialize = useCallback(async () => {
    const startTime = Date.now();
    setShowRetryButton(false);
    setStatus('initializing');

    // Step 1: Wait for service worker
    setStatus('service-worker');
    const swReady = await waitForServiceWorker();
    
    if (!swReady) {
      console.log('[Splash] Service worker not ready, continuing anyway...');
    }

    // Step 2: Check backend health with retries
    setStatus('backend');
    let backendReady = false;
    let attempts = 0;

    while (!backendReady && attempts < MAX_RETRIES) {
      backendReady = await checkBackendHealth();
      
      if (!backendReady) {
        attempts++;

        if (attempts < MAX_RETRIES) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // Ensure minimum splash time for smooth UX
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_SPLASH_TIME) {
      await new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME - elapsed));
    }

    if (backendReady) {
      setStatus('ready');
      setFadeOut(true);
      // Wait for fade animation
      await new Promise(resolve => setTimeout(resolve, 300));
      setIsReady(true);
    } else {
      setStatus('error');
      setShowRetryButton(true);
    }
  }, [waitForServiceWorker, checkBackendHealth]);

  // Handle manual retry
  const handleRetry = useCallback(() => {
    initialize();
  }, [initialize]);

  /*
   * Play the splash on every ENTRY into the app, not once per browser session.
   *
   * "Entry" means the previous route was outside the app: a cold page load
   * straight to /dashboard, or a click through from the marketing site. Moving
   * between two app pages (/fleet -> /fleet/vehicles) is not an entry and must
   * not interrupt the user.
   *
   * This replaces a sessionStorage 'app_loaded' flag, which showed the splash
   * exactly once and then never again for the life of the tab.
   */
  useEffect(() => {
    if (publicRoute) {
      // Outside the app. Remember that, and clear any previous ready state so
      // re-entering starts on the splash rather than flashing the app first.
      cameFromApp.current = false;
      setIsReady(false);
      setFadeOut(false);
      return;
    }

    if (cameFromApp.current) {
      // App -> app navigation: stay out of the way.
      setIsReady(true);
      return;
    }

    cameFromApp.current = true;
    initialize();
  }, [initialize, publicRoute]);

  if (publicRoute || isReady) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className={`${styles.splash} ${fadeOut ? styles.fadeOut : ''}`}
        // The fading logo is the only loading affordance, so the announcement
        // lives on the container rather than a (now removed) progress bar.
        role={status === 'error' ? undefined : 'progressbar'}
        aria-label={status === 'error' ? undefined : 'Loading Rovora'}
      >
        <div className={styles.content}>
          {/* The mark alone, then the wordmark slides out from behind it — one
              image, revealed by an animated clip. See the stylesheet. */}
          <div className={styles.lockup}>
            <img
              src="/logo-full-white.png"
              alt="Rovora"
              className={styles.logo}
              draggable={false}
            />
          </div>

          {/* Error state with retry button */}
          {showRetryButton && (
            <div className={styles.errorActions}>
              <p className={styles.errorHint}>
                The server is taking longer than expected to respond.
              </p>
              <button onClick={handleRetry} className={styles.retryBtn}>
                Try Again
              </button>
              <button 
                onClick={() => setIsReady(true)} 
                className={styles.continueBtn}
              >
                Continue Anyway
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Render children behind splash for faster perceived loading */}
      <div style={{ visibility: 'hidden', position: 'absolute' }}>
        {children}
      </div>
    </>
  );
}
