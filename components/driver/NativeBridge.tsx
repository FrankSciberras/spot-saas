'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compareVersions } from '@/lib/app-release';

/**
 * When the driver portal runs inside the Rovora Driver app's WebView, hand the
 * Supabase session to the native shell so background location tracking is
 * authenticated as the same user. No-op in a normal browser.
 *
 * The message also carries WHICH driver row is active (driver_id +
 * organization_id, resolved server-side from the active fleet): a driver who
 * works for two fleets has two driver rows, and the shell's own user_id lookup
 * cannot tell them apart. While a shift is open, the shift's own driver row wins
 * over the active fleet, so location always goes to the fleet they're working
 * for. Re-sent whenever the fleet switcher changes the active fleet.
 *
 * It also tells the server where the portal is running — in the app, or in a
 * plain browser — and relays the app's own status (sharing on/off, errors, and
 * from app 1.0.3 its location check and "Not now" taps) to
 * /api/driver/app-status. That's what lets the fleet's Live Map say why an
 * on-shift driver isn't sharing their location.
 */

/** Fired by the fleet switcher after a successful switch. */
export const ACTIVE_ORG_CHANGED_EVENT = 'rovora:active-org-changed';

/** Best effort — losing one report just means a slightly older status. */
function reportAppStatus(body: { context: 'app' | 'browser'; status?: Record<string, unknown> }) {
  fetch('/api/driver/app-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

const BROWSER_SEEN_KEY = 'rovora-browser-seen';

/** Apps before 1.0.3 don't report their version — treat silence as this. */
const LAST_UNREPORTED_VERSION = '1.0.2';

interface UpdateNeeded {
  latest: string;
  installed: string | null;
  storeUrl: string;
}

export default function NativeBridge() {
  // Set when the app is older than the version drivers must be on — shows the
  // full-screen "update to continue" page (works for every app version, since
  // it's drawn by the portal, not the app).
  const [update, setUpdate] = useState<UpdateNeeded | null>(null);

  useEffect(() => {
    const native = (window as any).ReactNativeWebView;
    if (!native) {
      // A plain browser can't share location in the background — recording the
      // visit lets the Live Map say "they're using the website, not the app".
      try {
        const last = Number(sessionStorage.getItem(BROWSER_SEEN_KEY) || 0);
        if (Date.now() - last < 10 * 60_000) return;
        sessionStorage.setItem(BROWSER_SEEN_KEY, String(Date.now()));
      } catch {
        // storage blocked — report anyway
      }
      reportAppStatus({ context: 'browser' });
      return;
    }
    const supabase = createClient();
    const platform = /android/i.test(navigator.userAgent) ? 'android' : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : undefined;

    // The installed app version, from its status: undefined = not heard yet,
    // null = it answered without one (an app older than 1.0.3).
    let installedVersion: string | null | undefined;
    let requiredMinimum: string | null = null;
    let cancelled = false;

    // The app re-sends its status every few seconds while sharing; pass on
    // real changes straight away, otherwise at most once a minute.
    let lastKey = '';
    let lastReportAt = 0;
    const onNativeStatus = (e: Event) => {
      let status: Record<string, unknown>;
      try {
        status = JSON.parse((e as CustomEvent<string>).detail);
      } catch {
        return;
      }
      if (!status || typeof status !== 'object') return;
      installedVersion = typeof status.appVersion === 'string' ? status.appVersion : null;
      // A late answer from an up-to-date app lifts the update screen again.
      if (installedVersion && requiredMinimum && compareVersions(installedVersion, requiredMinimum) >= 0) setUpdate(null);
      // lastSentAt ticks with every location sent — not a change worth reporting.
      const meaningful = { ...status };
      delete meaningful.lastSentAt;
      const key = JSON.stringify(meaningful);
      if (key === lastKey && Date.now() - lastReportAt < 60_000) return;
      lastKey = key;
      lastReportAt = Date.now();
      reportAppStatus({ context: 'app', status: { platform, ...status } });
    };
    window.addEventListener('rovora-native', onNativeStatus);
    reportAppStatus({ context: 'app', status: { platform } });

    // Is this app too old to keep using? Ask the server which version is
    // required, then wait (up to 8 s) to hear the app's own version.
    void (async () => {
      const info = await fetch('/api/app/version')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (!info?.minimum || typeof info.storeUrl !== 'string') return;
      requiredMinimum = info.minimum;
      const deadline = Date.now() + 8000;
      while (installedVersion === undefined && Date.now() < deadline && !cancelled) {
        await new Promise((r) => setTimeout(r, 250));
      }
      if (cancelled) return;
      const installed = installedVersion ?? null;
      if (compareVersions(installed ?? LAST_UNREPORTED_VERSION, info.minimum) < 0) {
        setUpdate({ latest: info.latest ?? info.minimum, installed, storeUrl: info.storeUrl });
      }
    })();

    const post = async (session: { access_token: string; refresh_token: string } | null) => {
      if (!session?.access_token || !session?.refresh_token) return;

      let driver_id: string | null = null;
      let organization_id: string | null = null;
      // Whether the fleet wants live location during shifts (Settings). null =
      // unknown, and the shell keeps its default (on).
      let live_tracking: boolean | null = null;
      try {
        const [meRes, trackingRes] = await Promise.all([
          fetch('/api/auth/user', { cache: 'no-store' }),
          fetch('/api/fleet/live-tracking', { cache: 'no-store' }).catch(() => null),
        ]);
        if (meRes.ok) {
          const me = await meRes.json();
          // An open shift (in any fleet) wins over the active fleet.
          driver_id = me.open_shift?.driver_id ?? me.driver_id ?? null;
          organization_id = me.open_shift?.organization_id ?? me.organization_id ?? null;
        }
        if (trackingRes?.ok) {
          const t = await trackingRes.json();
          if (typeof t.active === 'boolean') live_tracking = t.active;
        }
      } catch {
        // Fall back to the shell's own lookup.
      }

      native.postMessage(
        JSON.stringify({
          type: 'session',
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          driver_id,
          organization_id,
          live_tracking,
        })
      );
      // Ask the app for its status so it reaches the server (onNativeStatus).
      native.postMessage(JSON.stringify({ type: 'get-status' }));
    };

    supabase.auth.getSession().then(({ data }) => void post(data.session));
    const onOrgChanged = () => {
      supabase.auth.getSession().then(({ data }) => void post(data.session));
    };
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        native.postMessage(JSON.stringify({ type: 'signed-out' }));
      } else {
        void post(session);
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
      window.removeEventListener('rovora-native', onNativeStatus);
    };
  }, []);

  return update ? <UpdateRequired {...update} /> : null;
}

/** Full-screen, no way past it: the button opens Rovora Driver in the Play Store. */
function UpdateRequired({ latest, installed, storeUrl }: UpdateNeeded) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg-0, #f6f7f9)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.png" alt="Rovora" style={{ height: 34, marginBottom: 28 }} />
        <h1 id="update-title" style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, color: 'var(--text-1, #0e1116)' }}>
          Update Rovora Driver
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.5, color: 'var(--text-2, #4a5260)' }}>
          A new version of the app is available. Please update to keep using Rovora — it only takes a minute.
        </p>
        <a
          href={storeUrl}
          style={{
            display: 'block',
            padding: '14px 18px',
            borderRadius: 12,
            background: 'var(--accent, #1a8f5a)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Update now
        </a>
        <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--text-3, #7a8290)' }}>
          {installed ? `You have version ${installed}` : 'You have an older version'} · newest is {latest}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ marginTop: 10, padding: 6, border: 0, background: 'none', color: 'var(--accent, #1a8f5a)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}
        >
          Already updated? Check again
        </button>
      </div>
    </div>
  );
}
