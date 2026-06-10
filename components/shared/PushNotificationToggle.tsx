"use client";

import { useState, useTransition } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { sendTestPushAction } from '@/lib/actions/push-test';
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

  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isTesting, startTest] = useTransition();

  const sendTest = () => {
    setTestMsg(null);
    startTest(async () => {
      const r = await sendTestPushAction();
      if (r.error) setTestMsg({ ok: false, text: r.error });
      else setTestMsg({ ok: true, text: 'Sent — check your device.' });
    });
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {isSubscribed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={sendTest}
            disabled={isTesting}
            style={{
              padding: '7px 13px', borderRadius: 8, border: '1px solid var(--line-2, #e2e5ea)',
              background: 'var(--bg-1, #fff)', color: 'var(--text-1, #1a1d23)', fontSize: 12.5,
              fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', opacity: isTesting ? 0.6 : 1,
            }}
          >
            {isTesting ? 'Sending…' : 'Send test notification'}
          </button>
          {testMsg && (
            <span style={{ fontSize: 12, color: testMsg.ok ? 'var(--pos, #15803d)' : 'var(--neg, #dc2626)' }}>
              {testMsg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
