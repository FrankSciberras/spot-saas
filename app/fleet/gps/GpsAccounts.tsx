'use client';

import { useEffect, useState } from 'react';
import GpsConnect, { type ConnectableProvider } from './GpsConnect';
import GpsAccountControls from './GpsAccountControls';
import styles from './gps.module.css';
import IntegrationMark, { integrationTileStyle } from '@/components/shared/IntegrationMark';

export interface GpsAccountView {
  id: string;
  provider: string;
  providerName: string;
  mark: string;
  logoSrc?: string;
  bg: string;
  fg: string;
  accountLabel: string | null;
  status: 'connected' | 'error';
  lastError: string | null;
  lastSyncedAt: string | null;
  deviceCount: number;
  linkedCount: number;
}

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Connected accounts (with Sync / Disconnect / Reconnect) + "add another". */
export default function GpsAccounts({
  accounts,
  providers,
}: {
  accounts: GpsAccountView[];
  providers: ConnectableProvider[];
}) {
  const [reconnecting, setReconnecting] = useState<GpsAccountView | null>(null);
  const [adding, setAdding] = useState(false);
  // Coming back from "Sign in with Wialon" → reopen the form that started it
  // (after mount, so the server and browser render the same first frame).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL only works after mount
    if (/[?&#](access_token|svc_error)=/.test(window.location.href)) setAdding(true);
  }, []);

  return (
    <>
      <div className={styles.connList}>
        {accounts.map((a) => (
          <div key={a.id} className={styles.connStrip} data-status={a.status}>
            <span className={styles.providerLogo} style={integrationTileStyle(a, 36)} aria-hidden>
              <IntegrationMark it={a} tile={36} />
            </span>
            <div className={styles.connInfo}>
              <div className={styles.connName}>
                {a.providerName} {a.accountLabel && <span className={styles.connAccount}>· {a.accountLabel}</span>}
              </div>
              <div className={styles.connMeta}>
                {a.status === 'connected' ? (
                  <span className={styles.chipOk}>Connected</span>
                ) : (
                  <span className={styles.chipBad}>Needs attention</span>
                )}
                <span>
                  {a.deviceCount} tracker{a.deviceCount === 1 ? '' : 's'} · {a.linkedCount} in a vehicle
                </span>
                <span>· synced {ago(a.lastSyncedAt)}</span>
              </div>
              {a.lastError && <div className={styles.connError}>{a.lastError}</div>}
            </div>
            <GpsAccountControls
              connectionId={a.id}
              providerName={a.providerName}
              needsReconnect={a.status === 'error' && a.provider !== 'rovora'}
              hosted={a.provider === 'rovora'}
              onReconnect={() => {
                setAdding(false);
                setReconnecting(a);
              }}
            />
          </div>
        ))}
      </div>

      {reconnecting && (
        <GpsConnect
          providers={providers}
          reconnect={{ connectionId: reconnecting.id, provider: reconnecting.provider }}
          onCancel={() => setReconnecting(null)}
        />
      )}

      {!reconnecting &&
        (adding ? (
          <>
            <h2 className={styles.sectionTitle}>Add another GPS account</h2>
            <p className={styles.sectionLead}>
              Some fleets have trackers on two platforms (an old installer and a new one). Connect both — every
              tracker shows on the same map.
            </p>
            <GpsConnect providers={providers} onCancel={() => setAdding(false)} />
          </>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <button className={styles.ghostBtn} type="button" onClick={() => setAdding(true)}>
              + Add another GPS account
            </button>
          </div>
        ))}
    </>
  );
}
