'use client';

import styles from './offline.module.css';

export default function OfflinePage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>
          <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
            <path d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 1.414a5 5 0 01-.707-7.071M3 3l18 18" />
          </svg>
        </div>
        <h1>You&apos;re Offline</h1>
        <p>It looks like you&apos;ve lost your internet connection. Please check your network and try again.</p>
        <button onClick={() => window.location.reload()} className={styles.retryBtn}>
          Try Again
        </button>
      </div>
    </div>
  );
}
