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
 */

/** Fired by the fleet switcher after a successful switch. */
export const ACTIVE_ORG_CHANGED_EVENT = 'rovora:active-org-changed';

export default function NativeBridge() {
  useEffect(() => {
    const native = (window as any).ReactNativeWebView;
    if (!native) return;
    const supabase = createClient();

    const post = async (session: { access_token: string; refresh_token: string } | null) => {
      if (!session?.access_token || !session?.refresh_token) return;

      let driver_id: string | null = null;
      let organization_id: string | null = null;
      try {
        const res = await fetch('/api/auth/user', { cache: 'no-store' });
        if (res.ok) {
          const me = await res.json();
          driver_id = me.open_shift?.driver_id ?? me.driver_id ?? null;
          organization_id = me.open_shift?.organization_id ?? me.organization_id ?? null;
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
        })
      );
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
    };
  }, []);

  return null;
}
