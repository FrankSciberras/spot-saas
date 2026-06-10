'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import styles from './SplashScreen.module.css';

interface SplashScreenProps {
  children: React.ReactNode;
}

/** Public marketing / auth routes that must render instantly, with no app splash. */
function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/' || pathname === '/login' || pathname.startsWith('/login/');
}

type LoadingStatus = 'initializing' | 'service-worker' | 'backend' | 'ready' | 'error';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BACKEND_TIMEOUT = 8000;
const MIN_SPLASH_TIME = 800; // Minimum time to show splash for smooth UX

export default function SplashScreen({ children }: SplashScreenProps) {
  const pathname = usePathname();
  const publicRoute = isPublicRoute(pathname);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<LoadingStatus>('initializing');
  const [retryCount, setRetryCount] = useState(0);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

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
        setRetryCount(attempts);
        
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
    setRetryCount(0);
    initialize();
  }, [initialize]);

  // Start initialization on mount
  useEffect(() => {
    // Public marketing / auth pages never show the app splash.
    if (publicRoute) {
      return;
    }

    // Check if we've already loaded successfully in this session
    const hasLoaded = sessionStorage.getItem('app_loaded');
    if (hasLoaded) {
      setIsReady(true);
      return;
    }

    initialize();
  }, [initialize, publicRoute]);

  // Mark as loaded when ready
  useEffect(() => {
    if (isReady) {
      sessionStorage.setItem('app_loaded', 'true');
    }
  }, [isReady]);

  // Clear session flag on page unload for fresh check on next visit
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only clear if navigating away, not refreshing
      // This is handled by the service worker cache
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  if (publicRoute || isReady) {
    return <>{children}</>;
  }

  return (
    <>
      <div className={`${styles.splash} ${fadeOut ? styles.fadeOut : ''}`}>
        <div className={styles.content}>
          {/* Loading indicator — glowing conic-gradient ring spinner */}
          {status !== 'error' && (
            <div className={styles.loaderWrap} role="progressbar" aria-label="Loading">
              <span className={styles.glow} />
              <span className={styles.ring} />
              <span className={styles.core} />
            </div>
          )}

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
