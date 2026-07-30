"use client";

import { useEffect } from 'react';
import { initInstallCapture } from '@/hooks/useInstallPrompt';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // `beforeinstallprompt` fires once, early, and is lost if nobody is
    // listening. This component mounts in the root layout on first paint, so
    // it is the earliest reliable place to park the event for the install UI.
    initInstallCapture();

    if ('serviceWorker' in navigator) {
      // Register service worker with proper scope and cache settings
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('New version available, refresh to update');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return null;
}
