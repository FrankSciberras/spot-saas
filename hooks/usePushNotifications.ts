"use client";

import { useState, useEffect, useCallback } from 'react';

interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission | null;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: null,
    error: null,
  });

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
      
      if (!isSupported) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      const permission = Notification.permission;
      
      // Check if already subscribed
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        setState({
          isSupported: true,
          isSubscribed: !!subscription,
          isLoading: false,
          permission,
          error: null,
        });
      } catch (error) {
        setState(prev => ({
          ...prev,
          isSupported: true,
          isLoading: false,
          permission,
          error: 'Failed to check subscription status',
        }));
      }
    };

    checkSupport();
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!state.isSupported) {
      setState(prev => ({ ...prev, error: 'Push notifications not supported' }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        setState(prev => ({
          ...prev,
          isLoading: false,
          permission,
          error: 'Notification permission denied',
        }));
        return false;
      }

      // Get VAPID public key
      const vapidRes = await fetch('/api/push/vapid-key');
      const vapidData = await vapidRes.json();
      
      if (!vapidData.configured) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Push notifications not configured on server',
        }));
        return false;
      }

      // Subscribe to push
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(vapidData.vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // Send subscription to server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!res.ok) {
        throw new Error('Failed to save subscription');
      }

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        permission: 'granted',
        error: null,
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe',
      }));
      return false;
    }
  }, [state.isSupported]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to unsubscribe',
      }));
      return false;
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
