'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

type NativeShell = { postMessage: (message: string) => void };

const noSubscribe = () => () => {};
const getShell = (): NativeShell | null =>
  (window as unknown as { ReactNativeWebView?: NativeShell }).ReactNativeWebView ?? null;

/**
 * "On shift" line on the driver dashboard, showing whether location is really
 * being shared — having an open shift doesn't mean tracking started (the driver
 * may have refused location access or tapped "Not now").
 *
 * Inside the Rovora Driver app the native shell knows: we ask it for its status
 * and "Turn on" hands back to it, which checks location access and shows its
 * fix-it modal if needed. In a plain browser nothing shares from this page
 * (browser GPS only runs while Share Location is open), so it says so.
 * When the fleet doesn't track location on shift, "not sharing" is expected
 * and the line stays a plain "On shift".
 */
export default function ShiftSharingStatus({ expectSharing = true }: { expectSharing?: boolean }) {
  // The app's message bridge: undefined while server-rendering (unknown yet),
  // null in a plain browser.
  const native = useSyncExternalStore(noSubscribe, getShell, () => undefined);
  // In the app: null until it answers.
  const [appSharing, setAppSharing] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const shell = getShell();
    if (!shell) return;
    const onStatus = (e: Event) => {
      try {
        const status = JSON.parse((e as CustomEvent).detail as string) as {
          tracking: boolean;
          error: string | null;
        };
        setAppSharing(status.tracking);
        setError(status.tracking ? '' : status.error || '');
      } catch {
        // ignore malformed status
      }
    };
    window.addEventListener('rovora-native', onStatus);
    shell.postMessage(JSON.stringify({ type: 'get-status' }));
    return () => window.removeEventListener('rovora-native', onStatus);
  }, []);

  const sharing = native === null ? false : native === undefined ? null : appSharing;

  // The fleet turned location during shifts off: nothing to warn about.
  if (sharing === null || (!expectSharing && !sharing)) {
    return <span style={{ fontWeight: 600 }}>● On shift</span>;
  }

  if (sharing) {
    return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● On shift — sharing location</span>;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>● On shift — location sharing is off</span>
      {native ? (
        <button
          type="button"
          onClick={() => native.postMessage(JSON.stringify({ type: 'start-tracking' }))}
          style={{
            background: 'var(--color-warning)',
            color: '#1a1a1a',
            border: 'none',
            borderRadius: 999,
            padding: '3px 12px',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Turn on
        </button>
      ) : (
        <Link href="/driver/tracking" style={{ color: 'var(--color-warning)', fontWeight: 700 }}>
          Share location →
        </Link>
      )}
      {error && <span style={{ fontSize: '0.8rem' }}>{error}</span>}
    </span>
  );
}
