'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

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

export default function NativeBridge() {
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
      subscription.unsubscribe();
      window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onOrgChanged);
      window.removeEventListener('rovora-native', onNativeStatus);
    };
  }, []);

  return null;
}
