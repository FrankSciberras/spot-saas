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
 * cannot tell them apart.
 */
export default function NativeBridge() {
  useEffect(() => {
    const native = (window as any).ReactNativeWebView;
    if (!native) return;
    const supabase = createClient();

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
          driver_id = me.driver_id ?? null;
          organization_id = me.organization_id ?? null;
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
    };

    supabase.auth.getSession().then(({ data }) => void post(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        native.postMessage(JSON.stringify({ type: 'signed-out' }));
      } else {
        void post(session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
