"use client";

import { usePushNotifications } from '@/hooks/usePushNotifications';
import styles from './PushNotificationToggle.module.css';

export default function PushNotificationToggle() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className={styles.container} data-tour="push-toggle">
        <div className={styles.info}>
          <span className={styles.label}>Push Notifications</span>
          <span className={styles.description}>Not supported in this browser</span>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className={styles.container} data-tour="push-toggle">
      <div className={styles.info}>
        <span className={styles.label}>Push Notifications</span>
        <span className={styles.description}>
          {isSubscribed 
            ? 'Receive instant notifications on this device' 
            : permission === 'denied'
              ? 'Notifications blocked - enable in browser settings'
              : 'Get notified about new rosters and updates'
          }
        </span>
        {error && <span className={styles.error}>{error}</span>}
      </div>
      <button
        onClick={handleToggle}
        disabled={isLoading || permission === 'denied'}
        className={`${styles.toggle} ${isSubscribed ? styles.active : ''}`}
        title={isSubscribed ? 'Disable notifications' : 'Enable notifications'}
      >
        <span className={styles.toggleThumb} />
      </button>
    </div>
  );
}
